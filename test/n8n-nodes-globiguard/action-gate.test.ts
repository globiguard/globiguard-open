import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  IExecuteFunctions,
  IHttpRequestOptions,
  INodeExecutionData
} from 'n8n-workflow';

import { GlobiGuard } from '../../packages/n8n-nodes-globiguard/nodes/GlobiGuard/GlobiGuard.node';
import { GlobiGuardDetect } from '../../packages/n8n-nodes-globiguard/nodes/GlobiGuardDetect/GlobiGuardDetect.node';
import { GlobiGuardHttpAction } from '../../packages/n8n-nodes-globiguard/nodes/GlobiGuardHttpAction/GlobiGuardHttpAction.node';
import { GlobiGuardObserve } from '../../packages/n8n-nodes-globiguard/nodes/GlobiGuardObserve/GlobiGuardObserve.node';
import {
  canonicalJson,
  summarizeN8nPayload
} from '../../packages/n8n-nodes-globiguard/src/payload-summary';

interface ContextOptions {
  input?: INodeExecutionData[];
  parameters?: Record<string, unknown>;
  responses?: unknown[];
  downstreamResponses?: unknown[];
  continueOnFail?: boolean;
  binaryData?: Record<string, Buffer>;
}

describe('GlobiGuard Action Gate', () => {
  it('sends only a deterministic payload summary and routes ALLOW exclusively', async () => {
    const { context, requests } = createContext({
      input: [
        {
          json: {
            recipient: 'customer@example.com',
            body: 'Account 4242 is ready'
          }
        }
      ],
      responses: [authorization('ALLOW')]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([1, 0, 0, 0, 0]);
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      routingDecision: 'ALLOW',
      executionBoundary: false,
      authorizationId: 'auth_123'
    });
    expect(outputs[0][0]?.pairedItem).toEqual({ item: 0 });

    const requestBody = requests[0]?.body as Record<string, unknown>;
    const encodedBody = JSON.stringify(requestBody);
    expect(encodedBody).not.toContain('customer@example.com');
    expect(encodedBody).not.toContain('Account 4242');
    expect(requestBody).toMatchObject({
      context: {
        actionType: 'email.send',
        destination: { type: 'email', name: 'customer-email' },
        dataClasses: ['PII'],
        payloadSummary: {
          approxBytes: 67,
          topLevelKeys: ['body', 'recipient']
        }
      }
    });
    expect(
      (
        (requestBody.context as Record<string, unknown>)
          .payloadSummary as Record<string, unknown>
      ).sha256
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds binary content into authorization while preserving the paired binary item', async () => {
    const binaryData = Buffer.from('claim attachment bytes');
    const input: INodeExecutionData = {
      json: { claimId: 'claim_42' },
      binary: {
        attachment: {
          data: 'n8n-storage-reference',
          mimeType: 'application/pdf',
          fileName: 'claim.pdf'
        }
      }
    };
    const { context, requests } = createContext({
      input: [input],
      binaryData: { attachment: binaryData },
      responses: [authorization('ALLOW')]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(outputs[0][0]?.binary).toBe(input.binary);
    expect(outputs[0][0]?.pairedItem).toEqual({ item: 0 });
    const summary = (
      (requests[0]?.body as Record<string, unknown>).context as Record<
        string,
        unknown
      >
    ).payloadSummary as Record<string, unknown>;
    expect(summary).toMatchObject({
      binaryCount: 1,
      binaryBytes: binaryData.byteLength,
      binaryProperties: ['attachment']
    });
    expect(JSON.stringify(requests[0]?.body)).not.toContain(
      binaryData.toString('utf8')
    );
  });

  it('rejects binary property counts that exceed the API contract', async () => {
    const binary = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [
        `attachment_${index}`,
        { data: `storage-${index}`, mimeType: 'application/octet-stream' }
      ])
    );
    const { context, requests } = createContext({
      input: [{ json: { claimId: 'claim_42' }, binary }]
    });

    await expect(new GlobiGuard().execute.call(context)).rejects.toThrow(
      'more than 128 binary properties'
    );
    expect(requests).toHaveLength(0);
  });

  it.each([
    ['BLOCK', [0, 0, 1, 0, 0]],
    ['MODIFY', [0, 1, 0, 0, 0]],
    ['QUEUE', [0, 0, 0, 1, 0]]
  ] as const)('never places %s on the allow output', async (decision, counts) => {
    const { context } = createContext({
      responses: [authorization(decision)]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual(counts);
    expect(
      outputs.flat().find((item) => item.json.globiguard)?.json.globiguard
    ).toMatchObject({
      routingDecision: decision,
      executionBoundary: false
    });
  });

  it('reauthorizes the current payload after approval before returning ALLOW', async () => {
    const { context, requests } = createContext({
      input: [{ json: { amount: 125, account: 'acct_42' } }],
      parameters: {
        operation: 'reauthorize',
        queueEntryId: 'queue/approved'
      },
      responses: [
        {
          id: 'queue/approved',
          status: 'APPROVED',
          authorizationId: 'auth_old'
        },
        authorization('ALLOW')
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toContain('/v1/queue/queue%2Fapproved');
    expect(requests[1]?.method).toBe('POST');
    expect(requests[1]?.url).toContain('/v1/actions/authorize');
    expect(requests[1]?.body).toMatchObject({
      context: { approvalQueueEntryId: 'queue/approved' }
    });
    expect(outputs.map((items) => items.length)).toEqual([1, 0, 0, 0, 0]);
  });

  it('keeps unresolved approvals queued without issuing authorization', async () => {
    const { context, requests } = createContext({
      parameters: {
        operation: 'reauthorize',
        queueEntryId: 'queue_pending'
      },
      responses: [
        {
          id: 'queue_pending',
          status: 'PENDING',
          authorizationId: 'auth_old'
        }
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(requests).toHaveLength(1);
    expect(outputs.map((items) => items.length)).toEqual([0, 0, 0, 1, 0]);
  });

  it('blocks a consumed approval instead of authorizing a duplicate action', async () => {
    const { context, requests } = createContext({
      parameters: {
        operation: 'reauthorize',
        queueEntryId: 'queue_consumed'
      },
      responses: [
        {
          id: 'queue_consumed',
          status: 'RESUMED',
          authorizationId: 'auth_old'
        }
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(requests).toHaveLength(1);
    expect(outputs.map((items) => items.length)).toEqual([0, 0, 1, 0, 0]);
    expect(outputs[2][0]?.json.globiguard).toMatchObject({
      routingDecision: 'BLOCK',
      executionBoundary: false
    });
  });

  it('requires an authoritative payload rebuild for reviewer modifications', async () => {
    const { context, requests } = createContext({
      parameters: {
        operation: 'reauthorize',
        queueEntryId: 'queue_modified'
      },
      responses: [
        {
          id: 'queue_modified',
          status: 'MODIFIED',
          authorizationId: 'auth_old',
          resumePayloadSummary: { requiredFields: ['maskedEmail'] }
        }
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);

    expect(requests).toHaveLength(1);
    expect(outputs.map((items) => items.length)).toEqual([0, 1, 0, 0, 0]);
    expect(outputs[1][0]?.json.globiguard).toMatchObject({
      executionBoundary: false,
      modifications: { requiredFields: ['maskedEmail'] }
    });
  });

  it('does not misrepresent an expired routing ALLOW as an execution permit', async () => {
    const { context } = createContext({
      responses: [
        {
          ...authorization('ALLOW'),
          expiresAt: '2020-01-01T00:00:00.000Z'
        }
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      routingDecision: 'ALLOW',
      executionBoundary: false,
      expiresAt: '2020-01-01T00:00:00.000Z'
    });
  });

  it('does not claim executability when routing ALLOW has no expiry', async () => {
    const { context } = createContext({
      responses: [
        {
          ...authorization('ALLOW'),
          expiresAt: undefined
        }
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      routingDecision: 'ALLOW',
      executionBoundary: false,
      expiresAt: null
    });
  });

  it('routes obligations without pretending to enforce them', async () => {
    const { context } = createContext({
      responses: [
        {
          ...authorization('ALLOW'),
          obligations: ['mask recipient before send']
        }
      ]
    });

    const outputs = await new GlobiGuard().execute.call(context);
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      executionBoundary: false,
      obligations: ['mask recipient before send']
    });
  });
});

describe('GlobiGuard Governed HTTP Action', () => {
  it('authorizes an exact request fingerprint and executes only the same request', async () => {
    const { context, requests, downstreamRequests } = createContext({
      parameters: {
        governedActionType: 'email.send',
        method: 'POST',
        url: 'https://hooks.example.com/v1/messages?tenant=demo',
        headersJson: JSON.stringify({
          Authorization: 'Bearer downstream-secret',
          'X-Request-ID': 'request_123'
        }),
        bodyJson: JSON.stringify({ recipient: 'alice@example.com', amount: 42 }),
        responseFormat: 'json',
        timeoutMs: 15_000,
        dataClasses: ['PII']
      },
      responses: [authorization('ALLOW')],
      downstreamResponses: [{ delivered: true }]
    });

    const outputs = await new GlobiGuardHttpAction().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([1, 0, 0, 0, 0]);
    expect(downstreamRequests).toHaveLength(1);
    expect(downstreamRequests[0]).toMatchObject({
      method: 'POST',
      url: 'https://hooks.example.com/v1/messages?tenant=demo',
      headers: {
        authorization: 'Bearer downstream-secret',
        'x-request-id': 'request_123'
      },
      body: { recipient: 'alice@example.com', amount: 42 },
      timeout: 15_000,
      disableFollowRedirect: true,
      sendCredentialsOnCrossOriginRedirect: false
    });
    const encodedPolicyBody = JSON.stringify(requests[0]?.body);
    expect(encodedPolicyBody).not.toContain('downstream-secret');
    expect(encodedPolicyBody).not.toContain('alice@example.com');
    expect(requests[0]?.body).toMatchObject({
      dryRun: false,
      context: {
        actionType: 'email.send',
        destination: {
          name: 'https://hooks.example.com',
          resource: '/v1/messages'
        },
        payloadSummary: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }
      }
    });
    expect(requests[0]).toMatchObject({
      timeout: 30_000,
      disableFollowRedirect: true,
      sendCredentialsOnCrossOriginRedirect: false
    });
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      execution: 'COMPLETED',
      authorizationId: 'auth_123',
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
  });

  it.each(['BLOCK', 'MODIFY', 'QUEUE'] as const)(
    'never calls the downstream endpoint for %s',
    async (decision) => {
      const { context, downstreamRequests } = createContext({
        parameters: {
          method: 'POST',
          url: 'https://hooks.example.com/action',
          headersJson: '{}',
          bodyJson: '{}'
        },
        responses: [authorization(decision)]
      });

      const outputs = await new GlobiGuardHttpAction().execute.call(context);

      expect(downstreamRequests).toHaveLength(0);
      expect(outputs[decision === 'MODIFY' ? 1 : decision === 'BLOCK' ? 2 : 3]).toHaveLength(1);
    }
  );

  it('consumes an approval only through a fresh authorization of the exact request', async () => {
    const { context, requests, downstreamRequests } = createContext({
      parameters: {
        governedActionType: 'payments.transfer',
        method: 'POST',
        url: 'https://hooks.example.com/action',
        headersJson: '{}',
        bodyJson: JSON.stringify({ transferId: 'transfer_42', amount: 125 }),
        approvalQueueEntryId: 'queue/approved'
      },
      responses: [
        {
          ...authorization('ALLOW'),
          approvalState: 'APPROVED',
          queueEntryId: 'queue/approved'
        }
      ],
      downstreamResponses: [{ accepted: true }]
    });

    const outputs = await new GlobiGuardHttpAction().execute.call(context);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toMatchObject({
      dryRun: false,
      context: {
        approvalQueueEntryId: 'queue/approved',
        actionType: 'payments.transfer',
        payloadSummary: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }
      }
    });
    expect(downstreamRequests).toHaveLength(1);
    expect(outputs.map((items) => items.length)).toEqual([1, 0, 0, 0, 0]);
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      execution: 'COMPLETED',
      authorizationId: 'auth_123'
    });
  });

  it('does not execute when an approval is not consumable for the exact request', async () => {
    const { context, requests, downstreamRequests } = createContext({
      parameters: {
        method: 'POST',
        url: 'https://hooks.example.com/action',
        headersJson: '{}',
        bodyJson: '{}',
        approvalQueueEntryId: 'queue_wrong_action'
      },
      responses: [authorization('QUEUE')]
    });

    const outputs = await new GlobiGuardHttpAction().execute.call(context);

    expect(requests[0]?.body).toMatchObject({
      context: { approvalQueueEntryId: 'queue_wrong_action' }
    });
    expect(downstreamRequests).toHaveLength(0);
    expect(outputs.map((items) => items.length)).toEqual([0, 0, 0, 1, 0]);
  });

  it.each([
    ['expired', { expiresAt: '2020-01-01T00:00:00.000Z' }],
    [
      'overlong',
      { expiresAt: new Date(Date.now() + 6 * 60 * 1000).toISOString() }
    ],
    ['unresolved approval', { approvalState: 'PENDING' }],
    ['explicitly non-executable', { executable: false }],
    ['non-execution next action', { nextAction: 'REAUTHORIZE_EXACT_ACTION' }],
    ['obligations', { obligations: ['redact'] }],
    ['modifications', { modifications: { body: 'changed' } }]
  ] as const)('fails closed for %s ALLOW', async (_name, override) => {
    const { context, downstreamRequests } = createContext({
      parameters: {
        method: 'POST',
        url: 'https://hooks.example.com/action',
        headersJson: '{}',
        bodyJson: '{}'
      },
      responses: [{ ...authorization('ALLOW'), ...override }]
    });

    await expect(
      new GlobiGuardHttpAction().execute.call(context)
    ).rejects.toThrow();
    expect(downstreamRequests).toHaveLength(0);
  });

  it('rejects insecure destinations and transport-controlled headers before authorization', async () => {
    const insecure = createContext({
      parameters: {
        method: 'POST',
        url: 'http://example.com/action',
        headersJson: '{}',
        bodyJson: '{}'
      }
    });
    await expect(
      new GlobiGuardHttpAction().execute.call(insecure.context)
    ).rejects.toThrow(/HTTPS/);
    expect(insecure.requests).toHaveLength(0);

    const smuggled = createContext({
      parameters: {
        method: 'POST',
        url: 'https://example.com/action',
        headersJson: JSON.stringify({ Host: 'evil.example' }),
        bodyJson: '{}'
      }
    });
    await expect(
      new GlobiGuardHttpAction().execute.call(smuggled.context)
    ).rejects.toThrow(/controlled/);
    expect(smuggled.requests).toHaveLength(0);
  });

  it('suppresses downstream error details that could contain governed response data', async () => {
    const { context } = createContext({
      parameters: {
        method: 'POST',
        url: 'https://hooks.example.com/action',
        headersJson: '{}',
        bodyJson: '{}'
      },
      responses: [authorization('ALLOW')],
      downstreamResponses: [
        new Error('401 response body: customer-secret authorization: Bearer abc')
      ]
    });

    await expect(
      new GlobiGuardHttpAction().execute.call(context)
    ).rejects.toThrow(/details are suppressed/);
  });
});

describe('GlobiGuard Detect', () => {
  it('uses the byte-identical canonical Brain provenance fixtures', async () => {
    const fixtureBytes = readFileSync(
      resolve(__dirname, '../fixtures/brain-inference-v1.json')
    );
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(
      'e247589e1ea3457481ba98f58d87d102171c642899273e2a9044880ac721f0a9'
    );
    const fixture = JSON.parse(fixtureBytes.toString('utf8')) as {
      cases: Array<{
        id: string;
        expect: 'accept' | 'reject';
        response: Record<string, unknown>;
      }>;
    };

    const acceptedAllow = fixture.cases.find(
      (item) => item.id === 'complete-clean-allow'
    );
    const unavailableBlock = fixture.cases.find(
      (item) => item.id === 'unavailable-block'
    );
    expect(acceptedAllow?.expect).toBe('accept');
    expect(unavailableBlock?.expect).toBe('accept');

    for (const item of [acceptedAllow, unavailableBlock]) {
      const { context } = createContext({
        input: [{ json: { text: 'contract fixture' } }],
        parameters: { text: 'contract fixture' },
        responses: [item?.response]
      });
      const outputs = await new GlobiGuardDetect().execute.call(context);
      expect(outputs[2]).toHaveLength(0);
      expect(outputs.flat()).toHaveLength(1);
    }

    for (const item of fixture.cases.filter(({ expect }) => expect === 'reject')) {
      const { context } = createContext({
        input: [{ json: { text: 'contract fixture' } }],
        parameters: { text: 'contract fixture' },
        continueOnFail: true,
        responses: [item.response]
      });
      const outputs = await new GlobiGuardDetect().execute.call(context);
      expect(outputs.map((items) => items.length)).toEqual([0, 0, 1]);
      expect(JSON.stringify(outputs)).not.toContain('contract fixture');
    }
  });

  it('routes transport failures to error, never clean, when Continue On Fail is set', async () => {
    const { context } = createContext({
      input: [{ json: { text: 'secret' } }],
      parameters: { text: 'secret' },
      continueOnFail: true,
      responses: [new Error('service unavailable')]
    });

    const outputs = await new GlobiGuardDetect().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([0, 0, 1]);
    expect(outputs[2][0]?.json.globiguard).toMatchObject({
      scanned: false,
      safeToProceed: false
    });
  });

  it('redacts Unicode code-point offsets without leaking or splitting emoji', async () => {
    const { context } = createContext({
      input: [{ json: { text: '🤖 alice@example.com' } }],
      parameters: {
        text: '🤖 alice@example.com',
        redactionStrategy: 'replace'
      },
      responses: [
        {
          decision: 'MODIFY',
          masked_fields: [
            {
              field_type: 'EMAIL',
              confidence: 0.99,
              method: 'REGEX',
              sensitivity_tier: 'CONFIDENTIAL',
              start_pos: 2,
              end_pos: 19
            }
          ],
          blocked_fields: []
        }
      ]
    });

    const outputs = await new GlobiGuardDetect().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([1, 0, 0]);
    expect(outputs[0][0]?.json.globiguard).toMatchObject({
      redactedText: '🤖 [EMAIL]',
      redactionComplete: true,
      safeToProceed: false
    });
  });

  it('fails closed instead of partially redacting an invalid span', async () => {
    const { context } = createContext({
      input: [{ json: { text: 'alice@example.com' } }],
      parameters: {
        text: 'alice@example.com',
        redactionStrategy: 'mask'
      },
      continueOnFail: true,
      responses: [
        {
          decision: 'MODIFY',
          masked_fields: [
            {
              field_type: 'EMAIL',
              confidence: 0.99,
              method: 'REGEX',
              sensitivity_tier: 'CONFIDENTIAL',
              start_pos: null,
              end_pos: null
            }
          ],
          blocked_fields: []
        }
      ]
    });

    const outputs = await new GlobiGuardDetect().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([0, 0, 1]);
    expect(outputs[2][0]?.json.globiguard).toMatchObject({
      scanned: false,
      safeToProceed: false
    });
    expect(JSON.stringify(outputs)).not.toContain('alice@example.com');
  });

  it('fails closed when a sensitive decision has no redactable spans', async () => {
    const { context } = createContext({
      input: [{ json: { text: '1234' } }],
      parameters: { text: '1234', redactionStrategy: 'mask' },
      continueOnFail: true,
      responses: [
        { decision: 'BLOCK', masked_fields: [], blocked_fields: [] }
      ]
    });

    const outputs = await new GlobiGuardDetect().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([0, 0, 1]);
    expect(JSON.stringify(outputs)).not.toContain('1234');
    expect(outputs[2][0]?.json.globiguard).toMatchObject({
      redactionComplete: false,
      safeToProceed: false
    });
  });

  it('surfaces governed Brain provenance without exposing source text', async () => {
    const { context } = createContext({
      input: [{ json: { text: 'clean synthetic text' } }],
      parameters: { text: 'clean synthetic text' },
      responses: [
        {
          brain_contract_version: '1.0',
          trace_id: 'a'.repeat(32),
          decision: 'ALLOW',
          masked_fields: [],
          blocked_fields: [],
          inference: {
            status: 'complete',
            policy_authority: 'control_plane',
            route: 'sensitive_information',
            specialists: [
              {
                role: 'sensitive_contextual_span',
                status: 'complete',
                artifact_id: 'brain-detection/default',
                artifact_sha256: 'b'.repeat(64),
              confidence_band: 'not_applicable',
              finding_count: 0,
              raw_customer_value: 'must-not-cross-n8n'
              }
            ],
            deterministic_layers: ['regex'],
            total_latency_ms: 4.2,
            provenance_digest: 'c'.repeat(64)
          }
        }
      ]
    });

    const outputs = await new GlobiGuardDetect().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([0, 1, 0]);
    expect(outputs[1][0]?.json.globiguard).toMatchObject({
      safeToProceed: true,
      brainContractVersion: '1.0',
      inferenceStatus: 'complete',
      policyAuthority: 'control_plane',
      provenanceDigest: 'c'.repeat(64),
      deterministicLayers: ['regex']
    });
    expect(JSON.stringify(outputs)).not.toContain('must-not-cross-n8n');
  });

  it('fails closed when unavailable Brain inference claims a clean decision', async () => {
    const { context } = createContext({
      input: [{ json: { text: 'synthetic text' } }],
      parameters: { text: 'synthetic text' },
      continueOnFail: true,
      responses: [
        {
          brain_contract_version: '1.0',
          trace_id: 'a'.repeat(32),
          decision: 'ALLOW',
          masked_fields: [],
          blocked_fields: [],
          inference: {
            status: 'unavailable',
            policy_authority: 'control_plane',
            route: 'sensitive_information',
            specialists: [],
            deterministic_layers: [],
            total_latency_ms: 1,
            provenance_digest: 'c'.repeat(64)
          }
        }
      ]
    });

    const outputs = await new GlobiGuardDetect().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([0, 0, 1]);
    expect(outputs[2][0]?.json.globiguard).toMatchObject({
      scanned: false,
      safeToProceed: false
    });
    expect(JSON.stringify(outputs)).not.toContain('synthetic text');
  });
});

describe('GlobiGuard Evidence', () => {
  it('uses the control-plane evidence package endpoint and encodes the ID', async () => {
    const { context, requests } = createContext({
      parameters: {
        operation: 'getEvidencePackage',
        evidencePackageId: 'package/customer-42'
      },
      responses: [{ id: 'package/customer-42' }]
    });

    const outputs = await new GlobiGuardObserve().execute.call(context);

    expect(outputs.map((items) => items.length)).toEqual([1, 0]);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toContain(
      '/v1/audit/evidence-packages/package%2Fcustomer-42/summary'
    );
    expect(requests[0]?.url).not.toContain('/observability/');
  });

  it('sends exactly one incident replay lookup identifier', async () => {
    const { context, requests } = createContext({
      parameters: {
        operation: 'incidentReplay',
        replayIdentifierType: 'correlationId',
        replayIdentifier: 'corr_123'
      },
      responses: [{ incidentReplayId: 'replay_123' }]
    });

    await new GlobiGuardObserve().execute.call(context);

    expect(requests[0]).toMatchObject({
      method: 'GET',
      qs: { correlationId: 'corr_123' }
    });
    expect(requests[0]?.url).toContain('/v1/audit/incident-replay');
  });

});

describe('payload summary', () => {
  it('is stable across object key order and hashes unsafe field names', async () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    const summary = await summarizeN8nPayload({
      '4111111111111111': 'value',
      safe_name: true
    });
    expect(summary.topLevelKeys[0]).toMatch(/^field_sha256:/);
    expect(summary.topLevelKeys).toContain('safe_name');
  });
});

function createContext(options: ContextOptions = {}): {
  context: IExecuteFunctions;
  requests: IHttpRequestOptions[];
  downstreamRequests: IHttpRequestOptions[];
} {
  const requests: IHttpRequestOptions[] = [];
  const downstreamRequests: IHttpRequestOptions[] = [];
  const responses = [...(options.responses ?? [])];
  const downstreamResponses = [...(options.downstreamResponses ?? [])];
  const parameters: Record<string, unknown> = {
    operation: 'authorize',
    actionType: 'email.send',
    governedActionType: 'http.request',
    destinationType: 'email',
    destinationName: 'customer-email',
    dataClasses: ['PII'],
    ...options.parameters
  };
  const request = vi.fn(
    async (_credentialName: string, requestOptions: IHttpRequestOptions) => {
      requests.push(requestOptions);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
  );
  const downstreamRequest = vi.fn(async (requestOptions: IHttpRequestOptions) => {
    downstreamRequests.push(requestOptions);
    const response = downstreamResponses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  const context = {
    continueOnFail: () => options.continueOnFail ?? false,
    getCredentials: async () => ({
      environment: 'sandbox',
      apiUrl: 'https://api.example.com',
      brainUrl: '',
      projectId: 'proj_123',
      secretKey: 'sk_test_123'
    }),
    getInputData: () => options.input ?? [{ json: { value: 'sensitive' } }],
    getNode: () => ({
      id: 'node_1',
      name: 'GlobiGuard',
      type: 'n8n-nodes-globiguard.globiGuard',
      typeVersion: 2,
      position: [0, 0],
      parameters: {}
    }),
    getNodeParameter: (
      name: string,
      _itemIndex: number,
      defaultValue?: unknown
    ) => parameters[name] ?? defaultValue,
    helpers: {
      getBinaryDataBuffer: async (
        _itemIndex: number,
        propertyName: string
      ) => {
        const data = options.binaryData?.[propertyName];
        if (!data) throw new Error(`Missing binary fixture ${propertyName}`);
        return data;
      },
      httpRequest: downstreamRequest,
      httpRequestWithAuthentication: request
    }
  } as unknown as IExecuteFunctions;

  return { context, requests, downstreamRequests };
}

function authorization(decision: 'ALLOW' | 'MODIFY' | 'BLOCK' | 'QUEUE') {
  return {
    contractVersion: '2026-04-action-beta',
    authorizationId: 'auth_123',
    decision,
    executable: decision === 'ALLOW',
    nextAction:
      decision === 'ALLOW'
        ? 'EXECUTE_EXACT_ACTION_ONCE'
        : decision === 'MODIFY'
          ? 'APPLY_MODIFICATIONS_AND_REAUTHORIZE'
          : decision === 'QUEUE'
            ? 'WAIT_FOR_APPROVAL'
            : 'STOP',
    approvalState: decision === 'QUEUE' ? 'PENDING' : 'NOT_REQUIRED',
    queueEntryId: decision === 'QUEUE' ? 'queue_123' : null,
    evidenceRefs: [],
    expiresAt:
      decision === 'ALLOW'
        ? new Date(Date.now() + 60_000).toISOString()
        : undefined
  };
}
