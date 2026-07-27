import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { encodePathSegment, globiGuardRequest } from '../../src/transport';

type EvidenceOperation =
  | 'getActionEvidence'
  | 'getAuditEvent'
  | 'getAuthorization'
  | 'getEvidencePackage'
  | 'incidentReplay'
  | 'listActionEvidence'
  | 'listAuditEvents';

export class GlobiGuardObserve implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'GlobiGuard Evidence',
    name: 'globiGuardObserve',
    icon: {
      light: 'file:globiguard.light.svg',
      dark: 'file:globiguard.dark.svg'
    },
    group: ['transform'],
    version: 2,
    subtitle: '={{$parameter["operation"]}}',
    description:
      'Read authorization evidence, audit events, incident replays, and evidence-package summaries',
    defaults: { name: 'GlobiGuard Evidence' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main, NodeConnectionTypes.Main],
    outputNames: ['result', 'error'],
    credentials: [{ name: 'globiGuardApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        default: 'audit',
        noDataExpression: true,
        options: [
          {
            name: 'Action Authorization',
            value: 'authorization'
          },
          {
            name: 'Action Evidence',
            value: 'actionEvidence'
          },
          {
            name: 'Audit Event',
            value: 'audit'
          },
          {
            name: 'Evidence Package',
            value: 'evidencePackage'
          },
          {
            name: 'Incident Replay',
            value: 'incidentReplay'
          }
        ]
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'getAuthorization',
        noDataExpression: true,
        options: [
          {
            name: 'Get',
            value: 'getAuthorization',
            action: 'Get an action authorization'
          }
        ],
        displayOptions: { show: { resource: ['authorization'] } }
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'listActionEvidence',
        noDataExpression: true,
        options: [
          {
            name: 'Get',
            value: 'getActionEvidence',
            action: 'Get action evidence'
          },
          {
            name: 'List',
            value: 'listActionEvidence',
            action: 'List action evidence'
          }
        ],
        displayOptions: { show: { resource: ['actionEvidence'] } }
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'listAuditEvents',
        noDataExpression: true,
        options: [
          {
            name: 'Get',
            value: 'getAuditEvent',
            action: 'Get an audit event'
          },
          {
            name: 'List',
            value: 'listAuditEvents',
            action: 'List audit events'
          }
        ],
        displayOptions: { show: { resource: ['audit'] } }
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'getEvidencePackage',
        noDataExpression: true,
        options: [
          {
            name: 'Get Summary',
            value: 'getEvidencePackage',
            action: 'Get an evidence package summary'
          }
        ],
        displayOptions: { show: { resource: ['evidencePackage'] } }
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        default: 'incidentReplay',
        noDataExpression: true,
        options: [
          {
            name: 'Get',
            value: 'incidentReplay',
            action: 'Get an incident replay'
          }
        ],
        displayOptions: { show: { resource: ['incidentReplay'] } }
      },
      {
        displayName: 'Audit Event ID',
        name: 'auditEventId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['getAuditEvent'] } }
      },
      {
        displayName: 'Action Evidence ID',
        name: 'actionEvidenceId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['getActionEvidence'] } }
      },
      {
        displayName: 'Authorization ID',
        name: 'authorizationId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['getAuthorization'] } }
      },
      {
        displayName: 'Evidence Package ID',
        name: 'evidencePackageId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['getEvidencePackage'] } }
      },
      {
        displayName: 'Replay Lookup By',
        name: 'replayIdentifierType',
        type: 'options',
        default: 'correlationId',
        noDataExpression: true,
        options: [
          { name: 'Audit Event ID', value: 'auditEventId' },
          { name: 'Authorization ID', value: 'authorizationId' },
          { name: 'Correlation ID', value: 'correlationId' },
          { name: 'Queue Entry ID', value: 'queueEntryId' },
          { name: 'Workflow Run ID', value: 'workflowRunId' }
        ],
        displayOptions: { show: { operation: ['incidentReplay'] } }
      },
      {
        displayName: 'Replay Lookup Value',
        name: 'replayIdentifier',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['incidentReplay'] } },
        description:
          'Exactly one identifier is sent, preventing ambiguous replay lookups'
      },
      {
        displayName: 'From',
        name: 'from',
        type: 'dateTime',
        default: '',
        displayOptions: {
          show: { operation: ['listAuditEvents'] }
        }
      },
      {
        displayName: 'To',
        name: 'to',
        type: 'dateTime',
        default: '',
        displayOptions: {
          show: { operation: ['listAuditEvents'] }
        }
      },
      {
        displayName: 'Decision',
        name: 'decision',
        type: 'options',
        default: '',
        options: [
          { name: 'Allow', value: 'ALLOW' },
          { name: 'Any', value: '' },
          { name: 'Block', value: 'BLOCK' },
          { name: 'Modify', value: 'MODIFY' },
          { name: 'Queue', value: 'QUEUE' }
        ],
        displayOptions: { show: { operation: ['listAuditEvents'] } }
      },
      {
        displayName: 'Workflow Run ID',
        name: 'workflowRunId',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            operation: ['listActionEvidence', 'listAuditEvents']
          }
        }
      },
      {
        displayName: 'Authorization ID Filter',
        name: 'authorizationIdFilter',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['listActionEvidence'] } }
      },
      {
        displayName: 'Approval ID Filter',
        name: 'approvalIdFilter',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['listActionEvidence'] } }
      },
      {
        displayName: 'Page',
        name: 'page',
        type: 'number',
        default: 1,
        typeOptions: { minValue: 1 },
        displayOptions: { show: { operation: ['listAuditEvents'] } }
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        description: 'Max number of results to return',
        default: 50,
        typeOptions: { minValue: 1, maxValue: 200 },
        displayOptions: { show: { operation: ['listAuditEvents'] } }
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputs = this.getInputData();
    const resultItems: INodeExecutionData[] = [];
    const errorItems: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
      const input = inputs[itemIndex];
      try {
        const operation = this.getNodeParameter(
          'operation',
          itemIndex,
          'listAuditEvents'
        ) as EvidenceOperation;
        const request = buildRequest(this, operation, itemIndex);
        const data = await globiGuardRequest<unknown>(
          this,
          'controlPlane',
          request.method,
          request.path,
          { body: request.body, query: request.query }
        );
        resultItems.push({
          ...input,
          json: {
            ...input.json,
            globiguard: { operation, data: data as IDataObject }
          },
          pairedItem: { item: itemIndex }
        });
      } catch (error) {
        if (!this.continueOnFail()) {
          throw new NodeOperationError(this.getNode(), error as Error, {
            itemIndex
          });
        }
        errorItems.push({
          ...input,
          json: {
            ...input.json,
            globiguard: {
              safeToProceed: false,
              error:
                error instanceof Error ? error.message : 'Unknown evidence error'
            }
          },
          pairedItem: { item: itemIndex }
        });
      }
    }

    return [resultItems, errorItems];
  }
}

interface EvidenceRequest {
  method: 'GET' | 'POST';
  path: string;
  query?: IDataObject;
  body?: IDataObject;
}

function buildRequest(
  context: IExecuteFunctions,
  operation: EvidenceOperation,
  itemIndex: number
): EvidenceRequest {
  if (operation === 'getAuditEvent') {
    return {
      method: 'GET',
      path: `/v1/audit/${encodePathSegment(
        requiredParameter(context, 'auditEventId', itemIndex)
      )}`
    };
  }
  if (operation === 'getActionEvidence') {
    return {
      method: 'GET',
      path: `/v1/actions/evidence/${encodePathSegment(
        requiredParameter(context, 'actionEvidenceId', itemIndex)
      )}`
    };
  }
  if (operation === 'getAuthorization') {
    return {
      method: 'GET',
      path: `/v1/actions/authorizations/${encodePathSegment(
        requiredParameter(context, 'authorizationId', itemIndex)
      )}`
    };
  }
  if (operation === 'getEvidencePackage') {
    return {
      method: 'GET',
      path: `/v1/audit/evidence-packages/${encodePathSegment(
        requiredParameter(context, 'evidencePackageId', itemIndex)
      )}/summary`
    };
  }
  if (operation === 'incidentReplay') {
    const identifierType = context.getNodeParameter(
      'replayIdentifierType',
      itemIndex,
      'correlationId'
    ) as string;
    if (
      ![
        'auditEventId',
        'authorizationId',
        'correlationId',
        'queueEntryId',
        'workflowRunId'
      ].includes(identifierType)
    ) {
      throw new NodeOperationError(
        context.getNode(),
        'Unsupported incident replay identifier.',
        { itemIndex }
      );
    }
    return {
      method: 'GET',
      path: '/v1/audit/incident-replay',
      query: {
        [identifierType]: requiredParameter(
          context,
          'replayIdentifier',
          itemIndex
        )
      }
    };
  }
  if (operation === 'listActionEvidence') {
    return {
      method: 'GET',
      path: '/v1/actions/evidence',
      query: {
        authorizationId: optionalParameter(
          context,
          'authorizationIdFilter',
          itemIndex
        ),
        approvalId: optionalParameter(context, 'approvalIdFilter', itemIndex),
        workflowRunId: optionalParameter(context, 'workflowRunId', itemIndex)
      }
    };
  }
  if (operation === 'listAuditEvents') {
    return {
      method: 'GET',
      path: '/v1/audit',
      query: {
        from: optionalParameter(context, 'from', itemIndex),
        to: optionalParameter(context, 'to', itemIndex),
        decision: optionalParameter(context, 'decision', itemIndex),
        workflowRunId: optionalParameter(
          context,
          'workflowRunId',
          itemIndex
        ),
        page: context.getNodeParameter('page', itemIndex, 1) as number,
        limit: context.getNodeParameter('limit', itemIndex, 50) as number
      }
    };
  }
  throw new NodeOperationError(
    context.getNode(),
    `Unsupported GlobiGuard Evidence operation: ${operation}`,
    { itemIndex }
  );
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
