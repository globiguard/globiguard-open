"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobiGuardObserve = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const transport_1 = require("../../src/transport");
class GlobiGuardObserve {
    constructor() {
        this.description = {
            displayName: 'GlobiGuard Evidence',
            name: 'globiGuardObserve',
            icon: {
                light: 'file:globiguard.light.svg',
                dark: 'file:globiguard.dark.svg'
            },
            group: ['transform'],
            version: 2,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Read authorization evidence, audit events, incident replays, and evidence-package summaries',
            defaults: { name: 'GlobiGuard Evidence' },
            usableAsTool: true,
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [n8n_workflow_1.NodeConnectionTypes.Main, n8n_workflow_1.NodeConnectionTypes.Main],
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
                    description: 'Exactly one identifier is sent, preventing ambiguous replay lookups'
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
    }
    async execute() {
        const inputs = this.getInputData();
        const resultItems = [];
        const errorItems = [];
        for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
            const input = inputs[itemIndex];
            try {
                const operation = this.getNodeParameter('operation', itemIndex, 'listAuditEvents');
                const request = buildRequest(this, operation, itemIndex);
                const data = await (0, transport_1.globiGuardRequest)(this, 'controlPlane', request.method, request.path, { body: request.body, query: request.query });
                resultItems.push({
                    ...input,
                    json: {
                        ...input.json,
                        globiguard: { operation, data: data }
                    },
                    pairedItem: { item: itemIndex }
                });
            }
            catch (error) {
                if (!this.continueOnFail()) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, {
                        itemIndex
                    });
                }
                errorItems.push({
                    ...input,
                    json: {
                        ...input.json,
                        globiguard: {
                            safeToProceed: false,
                            error: error instanceof Error ? error.message : 'Unknown evidence error'
                        }
                    },
                    pairedItem: { item: itemIndex }
                });
            }
        }
        return [resultItems, errorItems];
    }
}
exports.GlobiGuardObserve = GlobiGuardObserve;
function buildRequest(context, operation, itemIndex) {
    if (operation === 'getAuditEvent') {
        return {
            method: 'GET',
            path: `/v1/audit/${(0, transport_1.encodePathSegment)(requiredParameter(context, 'auditEventId', itemIndex))}`
        };
    }
    if (operation === 'getActionEvidence') {
        return {
            method: 'GET',
            path: `/v1/actions/evidence/${(0, transport_1.encodePathSegment)(requiredParameter(context, 'actionEvidenceId', itemIndex))}`
        };
    }
    if (operation === 'getAuthorization') {
        return {
            method: 'GET',
            path: `/v1/actions/authorizations/${(0, transport_1.encodePathSegment)(requiredParameter(context, 'authorizationId', itemIndex))}`
        };
    }
    if (operation === 'getEvidencePackage') {
        return {
            method: 'GET',
            path: `/v1/audit/evidence-packages/${(0, transport_1.encodePathSegment)(requiredParameter(context, 'evidencePackageId', itemIndex))}/summary`
        };
    }
    if (operation === 'incidentReplay') {
        const identifierType = context.getNodeParameter('replayIdentifierType', itemIndex, 'correlationId');
        if (![
            'auditEventId',
            'authorizationId',
            'correlationId',
            'queueEntryId',
            'workflowRunId'
        ].includes(identifierType)) {
            throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'Unsupported incident replay identifier.', { itemIndex });
        }
        return {
            method: 'GET',
            path: '/v1/audit/incident-replay',
            query: {
                [identifierType]: requiredParameter(context, 'replayIdentifier', itemIndex)
            }
        };
    }
    if (operation === 'listActionEvidence') {
        return {
            method: 'GET',
            path: '/v1/actions/evidence',
            query: {
                authorizationId: optionalParameter(context, 'authorizationIdFilter', itemIndex),
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
                workflowRunId: optionalParameter(context, 'workflowRunId', itemIndex),
                page: context.getNodeParameter('page', itemIndex, 1),
                limit: context.getNodeParameter('limit', itemIndex, 50)
            }
        };
    }
    throw new n8n_workflow_1.NodeOperationError(context.getNode(), `Unsupported GlobiGuard Evidence operation: ${operation}`, { itemIndex });
}
function requiredParameter(context, name, itemIndex) {
    const value = optionalParameter(context, name, itemIndex);
    if (!value) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), `${name} is required.`, {
            itemIndex
        });
    }
    return value;
}
function optionalParameter(context, name, itemIndex) {
    const value = context.getNodeParameter(name, itemIndex, '');
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
//# sourceMappingURL=GlobiGuardObserve.node.js.map