import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { summarizeN8nPayload } from '../../src/payload-summary';
import { globiGuardRequest } from '../../src/transport';

const DECISIONS = ['ALLOW', 'MODIFY', 'BLOCK', 'QUEUE'] as const;
const METHODS = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'] as const;
const MAX_AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const MAX_TIMEOUT_MS = 120_000;
const FORBIDDEN_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

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
  executable?: boolean;
  nextAction?: string;
}

interface ExactHttpRequest extends IDataObject {
  method: IHttpRequestMethods;
  url: string;
  headers: IDataObject;
  body: IDataObject | IDataObject[] | null;
  responseFormat: 'json' | 'text';
  timeoutMs: number;
  followRedirects: false;
}

export class GlobiGuardHttpAction implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'GlobiGuard Governed HTTP Action',
    name: 'globiGuardHttpAction',
    icon: {
      light: 'file:globiguard.light.svg',
      dark: 'file:globiguard.dark.svg'
    },
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["method"]}} {{$parameter["url"]}}',
    description:
      'Construct, authorize, recheck, and execute one exact HTTP request in a single fail-closed boundary',
    defaults: { name: 'GlobiGuard Governed HTTP Action' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main
    ],
    outputNames: ['executed', 'modified', 'blocked', 'queued', 'error'],
    credentials: [{ name: 'globiGuardApi', required: true }],
    properties: [
      {
        displayName: 'Governed Action Type',
        name: 'governedActionType',
        type: 'string',
        default: 'http.request',
        required: true,
        placeholder: 'email.send',
        description:
          'Semantic policy action, such as email.send or crm.update. The exact HTTP method remains independently bound into the authorized request.'
      },
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'POST',
        options: METHODS.map((method) => ({ name: method, value: method }))
      },
      {
        displayName: 'URL',
        name: 'url',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://api.example.com/v1/messages',
        description:
          'Exact HTTPS destination. Redirects are disabled so authorization cannot drift to another target.'
      },
      {
        displayName: 'Headers (JSON)',
        name: 'headersJson',
        type: 'json',
        default: '{}',
        description:
          'Optional string-valued request headers. Header values are hashed locally and are not sent to GlobiGuard.'
      },
      {
        displayName: 'Body (JSON)',
        name: 'bodyJson',
        type: 'json',
        default: '={{$json}}',
        displayOptions: { hide: { method: ['GET'] } },
        description:
          'Exact JSON body. Its canonical hash, size, and shape are authorized; raw values are not sent to GlobiGuard.'
      },
      {
        displayName: 'Response Format',
        name: 'responseFormat',
        type: 'options',
        default: 'json',
        options: [
          { name: 'JSON', value: 'json' },
          { name: 'Text', value: 'text' }
        ]
      },
      {
        displayName: 'Timeout (MS)',
        name: 'timeoutMs',
        type: 'number',
        default: 30_000,
        typeOptions: { minValue: 1_000, maxValue: MAX_TIMEOUT_MS },
        description: 'Bounded timeout for the downstream request'
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
        ]
      },
      {
        displayName: 'Purpose',
        name: 'purpose',
        type: 'string',
        default: '',
        description: 'Business purpose used by purpose-limitation policies'
      },
      {
        displayName: 'Workflow Run ID',
        name: 'workflowRunId',
        type: 'string',
        default: '={{$execution.id}}'
      },
      {
        displayName: 'Correlation ID',
        name: 'correlationId',
        type: 'string',
        default: ''
      },
      {
        displayName: 'Idempotency Key',
        name: 'idempotencyKey',
        type: 'string',
        default: '',
        description:
          'Stable business key recommended for retryable side effects. This node never retries the downstream request.'
      },
      {
        displayName: 'Approved Queue Entry ID',
        name: 'approvalQueueEntryId',
        type: 'string',
        default: '',
        description:
          'Optional approval to consume. GlobiGuard binds it to this exact current request and issues a fresh short-lived authorization; approval alone never executes.'
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputs = this.getInputData();
    const outputs: INodeExecutionData[][] = [[], [], [], [], []];

    for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
      const input = inputs[itemIndex];
      try {
        const exactRequest = buildExactRequest(this, itemIndex);
        const authorizedSummary = await summarizeN8nPayload(exactRequest);
        const destination = new URL(exactRequest.url);
        const authorization = await globiGuardRequest<AuthorizationResponse>(
          this,
          'controlPlane',
          'POST',
          '/v1/actions/authorize',
          {
            body: {
              dryRun: false,
              context: {
                actionType: requiredParameter(
                  this,
                  'governedActionType',
                  itemIndex
                ),
                destination: {
                  type: 'webhook',
                  name: destination.origin,
                  resource: destination.pathname
                },
                dataClasses: this.getNodeParameter(
                  'dataClasses',
                  itemIndex,
                  ['INTERNAL']
                ) as string[],
                payloadSummary: authorizedSummary as unknown as IDataObject,
                actor: { type: 'workflow', displayName: this.getNode().name },
                purpose: optionalParameter(this, 'purpose', itemIndex),
                workflowRunId: optionalParameter(this, 'workflowRunId', itemIndex),
                workflowStepId: this.getNode().name,
                correlationId: optionalParameter(this, 'correlationId', itemIndex),
                idempotencyKey: optionalParameter(this, 'idempotencyKey', itemIndex),
                approvalQueueEntryId: optionalParameter(
                  this,
                  'approvalQueueEntryId',
                  itemIndex
                ),
                metadata: {
                  integrationKind: 'n8n',
                  executionBoundary: 'governed-http-action',
                  httpMethod: exactRequest.method,
                  nodeTypeVersion: 1,
                  itemIndex
                }
              }
            }
          }
        );

        validateAuthorization(this, authorization, itemIndex);
        if (authorization.decision !== 'ALLOW') {
          outputs[decisionOutput(authorization.decision)].push(
            policyOutput(input, itemIndex, authorization, authorizedSummary.sha256)
          );
          continue;
        }

        const preExecutionSummary = await summarizeN8nPayload(exactRequest);
        if (preExecutionSummary.sha256 !== authorizedSummary.sha256) {
          throw new NodeOperationError(
            this.getNode(),
            'The exact HTTP request changed after authorization; execution was stopped.',
            { itemIndex }
          );
        }
        assertAuthorizationCurrent(this, authorization, itemIndex);

        let response: unknown;
        try {
          response = await this.helpers.httpRequest(
            toHttpRequestOptions(exactRequest)
          );
        } catch {
          throw new NodeOperationError(
            this.getNode(),
            'The downstream HTTP request failed after authorization. Response details are suppressed to avoid leaking governed data.',
            { itemIndex }
          );
        }
        outputs[0].push({
          json: {
            response: normalizeResponse(response),
            globiguard: {
              execution: 'COMPLETED',
              authorizationId: authorization.authorizationId,
              requestFingerprint: authorizedSummary.sha256,
              expiresAt: authorization.expiresAt,
              correlationId: authorization.correlationId ?? null,
              evidenceRefs: authorization.evidenceRefs ?? []
            }
          },
          pairedItem: { item: itemIndex }
        });
      } catch (error) {
        if (!this.continueOnFail()) {
          throw new NodeOperationError(this.getNode(), safeError(error), {
            itemIndex
          });
        }
        outputs[4].push({
          json: {
            globiguard: {
              execution: 'STOPPED',
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

function buildExactRequest(
  context: IExecuteFunctions,
  itemIndex: number
): ExactHttpRequest {
  const method = context.getNodeParameter('method', itemIndex, 'POST') as string;
  if (!METHODS.includes(method as (typeof METHODS)[number])) {
    throw new NodeOperationError(context.getNode(), 'Unsupported HTTP method.', {
      itemIndex
    });
  }
  const url = normalizeUrl(
    context,
    requiredParameter(context, 'url', itemIndex),
    itemIndex
  );
  const headers = parseHeaders(
    context,
    context.getNodeParameter('headersJson', itemIndex, '{}'),
    itemIndex
  );
  const body =
    method === 'GET'
      ? null
      : parseBody(
          context,
          context.getNodeParameter('bodyJson', itemIndex, '{}'),
          itemIndex
        );
  const responseFormat = context.getNodeParameter(
    'responseFormat',
    itemIndex,
    'json'
  ) as string;
  if (responseFormat !== 'json' && responseFormat !== 'text') {
    throw new NodeOperationError(context.getNode(), 'Invalid response format.', {
      itemIndex
    });
  }
  const timeoutMs = Number(
    context.getNodeParameter('timeoutMs', itemIndex, 30_000)
  );
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new NodeOperationError(
      context.getNode(),
      `Timeout must be an integer from 1000 to ${MAX_TIMEOUT_MS} milliseconds.`,
      { itemIndex }
    );
  }

  return {
    method: method as IHttpRequestMethods,
    url,
    headers,
    body,
    responseFormat,
    timeoutMs,
    followRedirects: false
  };
}

function toHttpRequestOptions(request: ExactHttpRequest): IHttpRequestOptions {
  return {
    method: request.method,
    url: request.url,
    headers: request.headers,
    ...(request.body === null ? {} : { body: request.body }),
    json: request.responseFormat === 'json',
    encoding: request.responseFormat,
    timeout: request.timeoutMs,
    disableFollowRedirect: true,
    sendCredentialsOnCrossOriginRedirect: false,
    returnFullResponse: false,
    ignoreHttpStatusErrors: false
  };
}

function normalizeUrl(
  context: IExecuteFunctions,
  value: string,
  itemIndex: number
): string {
  if (!URL.canParse(value)) {
    throw new NodeOperationError(context.getNode(), 'URL must be valid.', {
      itemIndex
    });
  }
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new NodeOperationError(
      context.getNode(),
      'Governed HTTP actions require HTTPS.',
      { itemIndex }
    );
  }
  if (url.username || url.password || url.hash) {
    throw new NodeOperationError(
      context.getNode(),
      'URL credentials and fragments are not allowed.',
      { itemIndex }
    );
  }
  return url.toString();
}

function parseHeaders(
  context: IExecuteFunctions,
  value: unknown,
  itemIndex: number
): IDataObject {
  const parsed = parseJson(context, value, 'Headers', itemIndex);
  if (!isPlainObject(parsed)) {
    throw new NodeOperationError(context.getNode(), 'Headers must be a JSON object.', {
      itemIndex
    });
  }
  const entries = Object.entries(parsed);
  if (entries.length > 100) {
    throw new NodeOperationError(context.getNode(), 'At most 100 headers are allowed.', {
      itemIndex
    });
  }
  const normalized: IDataObject = {};
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim().toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]{1,128}$/.test(name)) {
      throw new NodeOperationError(context.getNode(), 'A header name is invalid.', {
        itemIndex
      });
    }
    if (FORBIDDEN_HEADERS.has(name)) {
      throw new NodeOperationError(
        context.getNode(),
        `Header ${name} is controlled by the HTTP transport and cannot be set.`,
        { itemIndex }
      );
    }
    if (typeof rawValue !== 'string' || /[\r\n]/.test(rawValue)) {
      throw new NodeOperationError(
        context.getNode(),
        'Header values must be strings without line breaks.',
        { itemIndex }
      );
    }
    normalized[name] = rawValue;
  }
  return normalized;
}

function parseBody(
  context: IExecuteFunctions,
  value: unknown,
  itemIndex: number
): IDataObject | IDataObject[] {
  const parsed = parseJson(context, value, 'Body', itemIndex);
  if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
    throw new NodeOperationError(
      context.getNode(),
      'Body must be a JSON object or array.',
      { itemIndex }
    );
  }
  return parsed as IDataObject | IDataObject[];
}

function parseJson(
  context: IExecuteFunctions,
  value: unknown,
  label: string,
  itemIndex: number
): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new NodeOperationError(context.getNode(), `${label} is not valid JSON.`, {
      itemIndex
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
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

function assertAuthorizationCurrent(
  context: IExecuteFunctions,
  value: AuthorizationResponse,
  itemIndex: number
): void {
  if (
    value.executable !== true ||
    value.nextAction !== 'EXECUTE_EXACT_ACTION_ONCE'
  ) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard marked this ALLOW as non-executable; execution was stopped pending fresh authorization.',
      { itemIndex }
    );
  }
  if (value.approvalState !== 'NOT_REQUIRED' && value.approvalState !== 'APPROVED') {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard ALLOW has no resolved approval state; execution was stopped.',
      { itemIndex }
    );
  }
  const expiry = value.expiresAt ? Date.parse(value.expiresAt) : Number.NaN;
  const remainingMs = expiry - Date.now();
  if (
    !Number.isFinite(expiry) ||
    remainingMs <= 0 ||
    remainingMs > MAX_AUTHORIZATION_TTL_MS
  ) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard ALLOW is expired, invalid, or longer than the five-minute execution window.',
      { itemIndex }
    );
  }
  if ((value.obligations?.length ?? 0) > 0) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard ALLOW contains obligations this executor cannot enforce.',
      { itemIndex }
    );
  }
  if (value.modifications && Object.keys(value.modifications).length > 0) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard ALLOW contains unresolved modifications.',
      { itemIndex }
    );
  }
}

function policyOutput(
  input: INodeExecutionData,
  itemIndex: number,
  authorization: AuthorizationResponse,
  requestFingerprint: string
): INodeExecutionData {
  return {
    ...input,
    json: {
      ...input.json,
      globiguard: {
        execution: 'NOT_EXECUTED',
        decision: authorization.decision,
        authorizationId: authorization.authorizationId,
        queueEntryId: authorization.queueEntryId ?? null,
        requestFingerprint,
        reason: authorization.reason ?? null,
        obligations: authorization.obligations ?? [],
        modifications: authorization.modifications ?? null,
        evidenceRefs: authorization.evidenceRefs ?? []
      }
    },
    pairedItem: { item: itemIndex }
  };
}

function decisionOutput(decision: Decision): number {
  return decision === 'ALLOW' ? 0 : DECISIONS.indexOf(decision);
}

function normalizeResponse(value: unknown): IDataObject | IDataObject[] | string | number | boolean | null {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    Array.isArray(value) ||
    isPlainObject(value)
  ) {
    return value as IDataObject | IDataObject[] | string | number | boolean | null;
  }
  return String(value);
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
  const message = error instanceof Error ? error.message : 'Unknown governed HTTP error';
  return new Error(
    message
      .replace(/\b(?:ggsk|sk|pk)_(?:test_|live_)?[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
      .replace(
        /(?:authorization|cookie|x-api-key|x-globiguard-secret-key)\s*[:=]\s*(?:bearer\s+)?\S+/gi,
        '[REDACTED_CREDENTIAL]'
      )
      .slice(0, 512)
  );
}
