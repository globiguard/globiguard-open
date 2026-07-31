import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { summarizeN8nItem } from '../../src/payload-summary';
import { encodePathSegment, globiGuardRequest } from '../../src/transport';

const DECISIONS = ['ALLOW', 'MODIFY', 'BLOCK', 'QUEUE'] as const;
type Decision = (typeof DECISIONS)[number];

interface AuthorizationResponse extends IDataObject {
  authorizationId: string;
  decision: Decision;
  approvalState: string;
  queueEntryId?: string | null;
  evidenceRefs: IDataObject[];
  reason?: string;
  obligations?: string[];
  modifications?: IDataObject;
  expiresAt?: string | null;
  correlationId?: string | null;
  contractVersion?: string;
}

interface QueueEntry extends IDataObject {
  id: string;
  status: string;
  authorizationId?: string | null;
  evidencePackageId?: string | null;
  correlationId?: string | null;
  resumePayloadSummary?: IDataObject | null;
}

export class GlobiGuard implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'GlobiGuard Action Gate',
    name: 'globiGuard',
    icon: {
      light: 'file:globiguard.light.svg',
      dark: 'file:globiguard.dark.svg'
    },
    group: ['transform'],
    version: 2,
    subtitle: '={{$parameter["operation"]}}',
    description:
      'Route a proposed action by policy; use a governed executor for an actual side effect',
    usableAsTool: true,
    defaults: {
      name: 'GlobiGuard Action Gate'
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main
    ],
    outputNames: ['allow', 'modified', 'blocked', 'queued', 'error'],
    credentials: [{ name: 'globiGuardApi', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'authorize',
        noDataExpression: true,
        options: [
          {
            name: 'Authorize Action',
            value: 'authorize',
            action: 'Authorize an action',
            description:
              'Request a policy-routing decision for the current item'
          },
          {
            name: 'Reauthorize After Approval',
            value: 'reauthorize',
            action: 'Reauthorize an approved action',
            description:
              'Verify queue state, then request a fresh policy decision for the current item'
          }
        ]
      },
      {
        displayName: 'Queue Entry ID',
        name: 'queueEntryId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['reauthorize'] } },
        description: 'Approval queue entry from the earlier QUEUE decision. Approval never bypasses fresh authorization.'
      },
      {
        displayName: 'Action Type',
        name: 'actionType',
        type: 'string',
        default: 'email.send',
        required: true,
        placeholder: 'robot.move_arm',
        description:
          'Stable verb describing the exact downstream side effect, such as email.send or database.write'
      },
      {
        displayName: 'Destination Type',
        name: 'destinationType',
        type: 'options',
        default: 'email',
        options: [
          { name: 'CRM', value: 'crm' },
          { name: 'Custom', value: 'custom' },
          { name: 'Database', value: 'database' },
          { name: 'Email', value: 'email' },
          { name: 'Slack', value: 'slack' },
          { name: 'Storage', value: 'storage' },
          { name: 'Ticketing', value: 'ticketing' },
          { name: 'Webhook', value: 'webhook' }
        ]
      },
      {
        displayName: 'Destination Name',
        name: 'destinationName',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'customer-notification-email',
        description:
          'Stable logical destination, not a secret or a full payload value'
      },
      {
        displayName: 'Destination Resource',
        name: 'destinationResource',
        type: 'string',
        default: '',
        placeholder: 'customers/us-east',
        description:
          'Optional logical resource, table, channel, or device group affected by the action'
      },
      {
        displayName: 'Data Classes',
        name: 'dataClasses',
        type: 'multiOptions',
        default: ['INTERNAL'],
        options: [
          { name: 'Confidential', value: 'CONFIDENTIAL' },
          { name: 'Internal', value: 'INTERNAL' },
          { name: 'PCI', value: 'PCI' },
          { name: 'PHI', value: 'PHI' },
          { name: 'PII', value: 'PII' },
          { name: 'Public', value: 'PUBLIC' },
          { name: 'Restricted', value: 'RESTRICTED' },
          { name: 'Secret', value: 'SECRET' }
        ],
        description: 'Known sensitivity classes in the action payload. Use GlobiGuard Detect upstream when unknown.'
      },
      {
        displayName: 'Purpose',
        name: 'purpose',
        type: 'string',
        default: '',
        placeholder: 'Fulfill a verified customer request',
        description: 'Business purpose used by purpose-limitation policies'
      },
      {
        displayName: 'Workflow Run ID',
        name: 'workflowRunId',
        type: 'string',
        default: '={{$execution.id}}',
        description: 'Stable workflow execution identifier for evidence correlation'
      },
      {
        displayName: 'Workflow Step ID',
        name: 'workflowStepId',
        type: 'string',
        default: '={{$node.name}}',
        description: 'Stable step identifier for evidence correlation'
      },
      {
        displayName: 'Correlation ID',
        name: 'correlationId',
        type: 'string',
        default: '',
        description: 'Optional end-to-end correlation identifier'
      },
      {
        displayName: 'Idempotency Key',
        name: 'idempotencyKey',
        type: 'string',
        default: '',
        description: 'Recommended for side effects. Use a stable upstream business key that survives workflow retries.'
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputs = this.getInputData();
    const outputs: INodeExecutionData[][] = [[], [], [], [], []];

    for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
      const input = inputs[itemIndex];
      try {
        const operation = this.getNodeParameter(
          'operation',
          itemIndex,
          'authorize'
        ) as string;

        if (operation === 'reauthorize') {
          const terminal = await checkApprovalState.call(this, itemIndex);
          if (terminal) {
            outputs[decisionOutput(terminal.decision)].push(
              governedOutput(input, itemIndex, terminal)
            );
            continue;
          }
        }

        const authorization = await authorize.call(this, itemIndex, input);
        validateAuthorization(this, authorization, itemIndex);
        outputs[decisionOutput(authorization.decision)].push(
          governedOutput(input, itemIndex, authorization)
        );
      } catch (error) {
        if (!this.continueOnFail()) {
          throw new NodeOperationError(this.getNode(), safeError(error), {
            itemIndex
          });
        }
        outputs[4].push({
          ...input,
          json: {
            ...input.json,
            globiguard: {
              routingDecision: 'ERROR',
              executionBoundary: false,
              error: safeError(error).message
            }
          },
          pairedItem: { item: itemIndex }
        });
      }
    }

    return outputs;
  }

}

async function authorize(
  this: IExecuteFunctions,
  itemIndex: number,
  input: INodeExecutionData
): Promise<AuthorizationResponse> {
    const operation = this.getNodeParameter(
      'operation',
      itemIndex,
      'authorize'
    ) as string;
    const actionType = requiredParameter(this, 'actionType', itemIndex);
    const destinationName = requiredParameter(this, 'destinationName', itemIndex);
    const destinationResource = optionalParameter(
      this,
      'destinationResource',
      itemIndex
    );
    const dataClasses = this.getNodeParameter(
      'dataClasses',
      itemIndex,
      ['INTERNAL']
    ) as string[];
    const summary = await summarizeN8nItem(this, itemIndex, input);
    const body: IDataObject = {
      context: {
        actionType,
        destination: {
          type: this.getNodeParameter(
            'destinationType',
            itemIndex,
            'custom'
          ) as string,
          name: destinationName,
          ...(destinationResource ? { resource: destinationResource } : {})
        },
        dataClasses,
        payloadSummary: summary as unknown as IDataObject,
        actor: {
          type: 'workflow',
          displayName: this.getNode().name
        },
        purpose: optionalParameter(this, 'purpose', itemIndex),
        workflowRunId: optionalParameter(this, 'workflowRunId', itemIndex),
        workflowStepId: optionalParameter(this, 'workflowStepId', itemIndex),
        correlationId: optionalParameter(this, 'correlationId', itemIndex),
        idempotencyKey: optionalParameter(this, 'idempotencyKey', itemIndex),
        approvalQueueEntryId:
          operation === 'reauthorize'
            ? requiredParameter(this, 'queueEntryId', itemIndex)
            : undefined,
        metadata: {
          integrationKind: 'n8n',
          nodeTypeVersion: 2,
          itemIndex
        }
      } as IDataObject
    };

    return await globiGuardRequest<AuthorizationResponse>(
      this,
      'controlPlane',
      'POST',
      '/v1/actions/authorize',
      { body }
    );
}

async function checkApprovalState(
  this: IExecuteFunctions,
  itemIndex: number
): Promise<AuthorizationResponse | undefined> {
    const queueEntryId = requiredParameter(this, 'queueEntryId', itemIndex);
    const entry = await globiGuardRequest<QueueEntry>(
      this,
      'controlPlane',
      'GET',
      `/v1/queue/${encodePathSegment(queueEntryId)}`
    );

    if (['APPROVED', 'AUTO_APPROVED'].includes(entry.status)) {
      return undefined;
    }

    if (entry.status === 'MODIFIED') {
      return syntheticDecision('MODIFY', entry, {
        reason:
          'The reviewer changed the action. Apply the reviewed modification to the authoritative payload, then authorize that new payload.',
        modifications: entry.resumePayloadSummary ?? undefined
      });
    }

    if (['PENDING', 'ESCALATED'].includes(entry.status)) {
      return syntheticDecision('QUEUE', entry, {
        reason: `Approval is unresolved (${entry.status}). No downstream action is authorized.`
      });
    }

    if (['REJECTED', 'EXPIRED', 'FAILED', 'RESUMED'].includes(entry.status)) {
      return syntheticDecision('BLOCK', entry, {
        reason:
          entry.status === 'RESUMED'
            ? 'This approval was already consumed by an execution handoff. No duplicate action is authorized.'
            : `Approval ended in ${entry.status}. No downstream action is authorized.`
      });
    }

    throw new NodeOperationError(
      this.getNode(),
      `Unknown approval status ${entry.status}; GlobiGuard failed closed.`,
      { itemIndex }
    );
}

function validateAuthorization(
  context: IExecuteFunctions,
  value: AuthorizationResponse,
  itemIndex: number
): void {
  if (!value.authorizationId || !DECISIONS.includes(value.decision)) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard returned an invalid authorization response.',
      { itemIndex }
    );
  }
}

function syntheticDecision(
  decision: Decision,
  entry: QueueEntry,
  extra: Pick<AuthorizationResponse, 'reason' | 'modifications'>
): AuthorizationResponse {
  return {
    authorizationId: entry.authorizationId ?? `queue:${entry.id}`,
    decision,
    approvalState:
      decision === 'QUEUE' ? 'PENDING' : decision === 'MODIFY' ? 'APPROVED' : 'REJECTED',
    queueEntryId: entry.id,
    evidenceRefs: [],
    correlationId: entry.correlationId,
    ...extra
  };
}

function governedOutput(
  input: INodeExecutionData,
  itemIndex: number,
  authorization: AuthorizationResponse
): INodeExecutionData {
  return {
    ...input,
    json: {
      ...input.json,
      globiguard: {
        routingDecision: authorization.decision,
        executionBoundary: false,
        authorizationId: authorization.authorizationId,
        approvalState: authorization.approvalState,
        queueEntryId: authorization.queueEntryId ?? null,
        correlationId: authorization.correlationId ?? null,
        expiresAt: authorization.expiresAt ?? null,
        reason: authorization.reason ?? null,
        obligations: authorization.obligations ?? [],
        modifications: authorization.modifications ?? null,
        evidenceRefs: authorization.evidenceRefs ?? [],
        contractVersion: authorization.contractVersion ?? null
      }
    },
    pairedItem: { item: itemIndex }
  };
}

function decisionOutput(decision: Decision): number {
  return DECISIONS.indexOf(decision);
}

function requiredParameter(
  context: IExecuteFunctions,
  name: string,
  itemIndex: number
): string {
  const value = optionalParameter(context, name, itemIndex);
  if (!value) {
    throw new NodeOperationError(context.getNode(), `${name} is required.`, {
      itemIndex
    });
  }
  return value;
}

function optionalParameter(
  context: IExecuteFunctions,
  name: string,
  itemIndex: number
): string | undefined {
  const value = context.getNodeParameter(name, itemIndex, '');
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safeError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Unknown GlobiGuard error';
  const sanitized = message
    .replace(/\b(?:sk|pk)_(?:test|live)_[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(/x-globiguard-secret-key\s*[:=]\s*\S+/gi, 'x-globiguard-secret-key=[REDACTED]');
  return new Error(sanitized);
}
