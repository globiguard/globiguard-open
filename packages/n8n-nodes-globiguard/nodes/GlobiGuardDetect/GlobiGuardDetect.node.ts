import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { globiGuardRequest } from '../../src/transport';

interface DetectionField extends IDataObject {
  field_type?: string;
  sensitivity_tier?: string;
  start_pos?: number;
  end_pos?: number;
}

interface SpecialistInference extends IDataObject {
  role: string;
  status: string;
  artifact_id?: string | null;
  artifact_sha256?: string | null;
  ontology_sha256?: string | null;
  confidence_band?: string;
  latency_ms?: number | null;
  finding_count?: number;
}

interface InferenceMetadata extends IDataObject {
  status: string;
  policy_authority: string;
  route: string;
  specialists: SpecialistInference[];
  deterministic_layers: string[];
  total_latency_ms?: number;
  provenance_digest: string;
}

interface DetectionResponse extends IDataObject {
  brain_contract_version?: string;
  trace_id?: string;
  decision: string;
  decision_band?: string;
  confidence?: number;
  masked_fields?: DetectionField[];
  blocked_fields?: DetectionField[];
  risk_score?: number;
  reason_codes?: string[];
  recommended_action?: string;
  fallback_mode?: string;
  field_count_by_tier?: IDataObject;
  inference?: InferenceMetadata;
}

const DETECTION_DECISIONS = ['ALLOW', 'MODIFY', 'BLOCK', 'QUEUE'] as const;
const INFERENCE_STATUSES = ['complete', 'degraded', 'abstained', 'unavailable'] as const;
const CONFIDENCE_BANDS = ['high', 'medium', 'low', 'not_applicable'] as const;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export class GlobiGuardDetect implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'GlobiGuard Detect',
    name: 'globiGuardDetect',
    icon: {
      light: 'file:globiguard.light.svg',
      dark: 'file:globiguard.dark.svg'
    },
    group: ['transform'],
    version: 2,
    subtitle: '={{$parameter["redactionStrategy"]}}',
    description:
      'Detect and optionally redact sensitive data before it reaches models or external systems',
    defaults: { name: 'GlobiGuard Detect' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main,
      NodeConnectionTypes.Main
    ],
    outputNames: ['sensitive', 'clean', 'error'],
    credentials: [{ name: 'globiGuardApi', required: true }],
    properties: [
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        default: '={{$json.text}}',
        required: true,
        typeOptions: { rows: 4 },
        description:
          'Text sent to the configured GlobiGuard detection service for classification'
      },
      {
        displayName: 'Industry',
        name: 'industry',
        type: 'string',
        default: 'GENERAL',
        required: true,
        placeholder: 'INSURANCE',
        description:
          'Domain profile used by the calibrated detection policy, such as INSURANCE or HEALTHCARE'
      },
      {
        displayName: 'Redaction Strategy',
        name: 'redactionStrategy',
        type: 'options',
        default: 'none',
        options: [
          { name: 'Detect Only', value: 'none' },
          { name: 'Drop', value: 'drop' },
          { name: 'Mask', value: 'mask' },
          { name: 'Replace', value: 'replace' }
        ]
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputs = this.getInputData();
    const sensitive: INodeExecutionData[] = [];
    const clean: INodeExecutionData[] = [];
    const errors: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
      const input = inputs[itemIndex];
      let sourceText: string | undefined;
      try {
        const text = this.getNodeParameter('text', itemIndex, '') as string;
        sourceText = text;
        const industry = this.getNodeParameter(
          'industry',
          itemIndex,
          'GENERAL'
        ) as string;
        const redactionStrategy = this.getNodeParameter(
          'redactionStrategy',
          itemIndex,
          'none'
        ) as string;
        const normalizedIndustry = normalizeIndustry(
          this,
          industry,
          itemIndex
        );

        if (!text.trim()) {
          clean.push({
            ...input,
            json: {
              ...input.json,
              globiguard: {
                scanned: false,
                hasSensitiveData: false,
                reason: 'empty_text'
              }
            },
            pairedItem: { item: itemIndex }
          });
          continue;
        }
        if (text.length > 100_000) {
          throw new NodeOperationError(
            this.getNode(),
            'GlobiGuard Detect rejects text longer than 100,000 characters.',
            { itemIndex }
          );
        }

        const body: IDataObject = {
          text,
          industry: normalizedIndustry
        };
        const result = await globiGuardRequest<DetectionResponse>(
          this,
          'controlPlane',
          'POST',
          '/v1/detection/evaluate',
          { body }
        );
        if (
          !Array.isArray(result.masked_fields) ||
          !Array.isArray(result.blocked_fields)
        ) {
          throw new NodeOperationError(
            this.getNode(),
            'GlobiGuard returned invalid detection field collections.',
            { itemIndex }
          );
        }
        const maskedFields = result.masked_fields;
        const blockedFields = result.blocked_fields;
        const entities = [...maskedFields, ...blockedFields];
        if (
          !DETECTION_DECISIONS.includes(
            result.decision as (typeof DETECTION_DECISIONS)[number]
          )
        ) {
          throw new NodeOperationError(
            this.getNode(),
            'GlobiGuard returned an invalid detection decision.',
            { itemIndex }
          );
        }
        validateInferenceMetadata(this, result, itemIndex);
        const hasSensitiveData =
          entities.length > 0 || result.decision !== 'ALLOW';
        if (
          redactionStrategy !== 'none' &&
          hasSensitiveData &&
          entities.length === 0
        ) {
          throw new NodeOperationError(
            this.getNode(),
            'GlobiGuard reported sensitive data without redactable spans; redaction failed closed.',
            { itemIndex }
          );
        }
        const redactedText =
          redactionStrategy === 'none'
            ? null
            : redactByOffsets(
                this,
                text,
                entities,
                redactionStrategy,
                itemIndex
              );
        const output: INodeExecutionData = {
          ...input,
          json: {
            ...input.json,
            globiguard: {
              scanned: true,
              hasSensitiveData,
              safeToProceed: result.decision === 'ALLOW',
              decision: result.decision,
              decisionBand: result.decision_band ?? null,
              confidence: result.confidence ?? null,
              riskScore: result.risk_score ?? null,
              reasonCodes: result.reason_codes ?? [],
              recommendedAction: result.recommended_action ?? null,
              fallbackMode: result.fallback_mode ?? null,
              brainContractVersion: result.brain_contract_version ?? null,
              traceId: result.trace_id ?? null,
              inferenceStatus: result.inference?.status ?? null,
              policyAuthority: result.inference?.policy_authority ?? null,
              provenanceDigest: result.inference?.provenance_digest ?? null,
              totalLatencyMs: result.inference?.total_latency_ms ?? null,
              deterministicLayers: result.inference?.deterministic_layers ?? [],
              specialists: projectSpecialists(result.inference?.specialists),
              fieldCountByTier: result.field_count_by_tier ?? {},
              entities,
              redactedText,
              redactionComplete:
                redactionStrategy === 'none' ? null : true,
              industry: normalizedIndustry,
              redactionStrategy
            }
          },
          pairedItem: { item: itemIndex }
        };

        (hasSensitiveData ? sensitive : clean).push(output);
      } catch (error) {
        if (!this.continueOnFail()) {
          throw new NodeOperationError(this.getNode(), error as Error, {
            itemIndex
          });
        }
        errors.push({
          json: {
            globiguard: {
              scanned: false,
              hasSensitiveData: null,
              safeToProceed: false,
              redactionComplete: false,
              error: safeDetectionError(error, sourceText)
            }
          },
          pairedItem: { item: itemIndex }
        });
      }
    }

    return [sensitive, clean, errors];
  }
}

function validateInferenceMetadata(
  context: IExecuteFunctions,
  result: DetectionResponse,
  itemIndex: number
): void {
  const inference = result.inference;
  if (inference === undefined) return;
  const validStatus = INFERENCE_STATUSES.includes(
    inference.status as (typeof INFERENCE_STATUSES)[number]
  );
  if (
    result.brain_contract_version !== '1.0' ||
    typeof result.trace_id !== 'string' ||
    result.trace_id.length === 0 ||
    result.trace_id.length > 128 ||
    !validStatus ||
    inference.policy_authority !== 'control_plane' ||
    typeof inference.route !== 'string' ||
    inference.route.length === 0 ||
    !Array.isArray(inference.specialists) ||
    !Array.isArray(inference.deterministic_layers) ||
    !SHA256_HEX.test(inference.provenance_digest)
  ) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard returned invalid Brain inference provenance.',
      { itemIndex }
    );
  }
  for (const specialist of inference.specialists) {
    validateSpecialistInference(context, specialist, itemIndex);
  }
  if (
    (inference.status === 'unavailable' || inference.status === 'abstained') &&
    (result.decision === 'ALLOW' || result.decision === 'MODIFY')
  ) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard returned a clean decision without usable Brain inference evidence.',
      { itemIndex }
    );
  }
}

function validateSpecialistInference(
  context: IExecuteFunctions,
  specialist: SpecialistInference,
  itemIndex: number
): void {
  const validOptionalSha = (value: unknown): boolean =>
    value === null ||
    value === undefined ||
    (typeof value === 'string' && SHA256_HEX.test(value));
  if (
    !specialist ||
    typeof specialist !== 'object' ||
    Array.isArray(specialist) ||
    typeof specialist.role !== 'string' ||
    specialist.role.length === 0 ||
    specialist.role.length > 80 ||
    !INFERENCE_STATUSES.includes(
      specialist.status as (typeof INFERENCE_STATUSES)[number]
    ) ||
    (specialist.artifact_id !== null &&
      specialist.artifact_id !== undefined &&
      (typeof specialist.artifact_id !== 'string' ||
        specialist.artifact_id.length === 0 ||
        specialist.artifact_id.length > 256)) ||
    !validOptionalSha(specialist.artifact_sha256) ||
    !validOptionalSha(specialist.ontology_sha256) ||
    !CONFIDENCE_BANDS.includes(
      specialist.confidence_band as (typeof CONFIDENCE_BANDS)[number]
    ) ||
    (specialist.latency_ms !== null &&
      specialist.latency_ms !== undefined &&
      (typeof specialist.latency_ms !== 'number' ||
        !Number.isFinite(specialist.latency_ms) ||
        specialist.latency_ms < 0)) ||
    !Number.isInteger(specialist.finding_count) ||
    (specialist.finding_count ?? -1) < 0
  ) {
    throw new NodeOperationError(
      context.getNode(),
      'GlobiGuard returned invalid Brain specialist provenance.',
      { itemIndex }
    );
  }
}

function projectSpecialists(
  specialists: SpecialistInference[] | undefined
): SpecialistInference[] {
  return (specialists ?? []).map((specialist) => ({
    role: specialist.role,
    status: specialist.status,
    artifact_id: specialist.artifact_id ?? null,
    artifact_sha256: specialist.artifact_sha256 ?? null,
    ontology_sha256: specialist.ontology_sha256 ?? null,
    confidence_band: specialist.confidence_band,
    latency_ms: specialist.latency_ms ?? null,
    finding_count: specialist.finding_count
  }));
}

function normalizeIndustry(
  context: IExecuteFunctions,
  value: string,
  itemIndex: number
): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]{0,63}$/.test(normalized)) {
    throw new NodeOperationError(
      context.getNode(),
      'Industry must start with a letter and contain only letters, numbers, underscores, or hyphens.',
      { itemIndex }
    );
  }
  return normalized;
}

function redactByOffsets(
  context: IExecuteFunctions,
  text: string,
  fields: DetectionField[],
  strategy: string,
  itemIndex: number
): string {
  const codePoints = Array.from(text);
  const spans = fields
    .map((field) => {
      const start = field.start_pos;
      const end = field.end_pos;
      if (
        typeof start !== 'number' ||
        typeof end !== 'number' ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > codePoints.length
      ) {
        throw new NodeOperationError(
          context.getNode(),
          'GlobiGuard returned a detected field without a valid redaction span; redaction failed closed.',
          { itemIndex }
        );
      }
      return {
        start,
        end,
        label: normalizeFieldLabel(field.field_type)
      };
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: typeof spans = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (!previous || span.start > previous.end) {
      merged.push({ ...span });
      continue;
    }
    previous.end = Math.max(previous.end, span.end);
    if (previous.label !== span.label) {
      previous.label = 'SENSITIVE';
    }
  }

  for (const span of merged.reverse()) {
    const replacement =
      strategy === 'drop'
        ? []
        : strategy === 'mask'
          ? Array<string>(span.end - span.start).fill('*')
          : Array.from(`[${span.label}]`);
    codePoints.splice(span.start, span.end - span.start, ...replacement);
  }
  return codePoints.join('');
}

function normalizeFieldLabel(value: unknown): string {
  if (typeof value !== 'string') return 'SENSITIVE';
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  return normalized.slice(0, 64) || 'SENSITIVE';
}

function safeDetectionError(error: unknown, sourceText?: string): string {
  let message =
    error instanceof Error ? error.message : 'Unknown GlobiGuard detection error';
  if (sourceText) {
    message = message.split(sourceText).join('[REDACTED_INPUT]');
  }
  return message
    .replace(/\b(?:ggsk|sk|pk)_(?:test_|live_)?[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
    .replace(
      /(?:authorization|cookie|x-api-key|x-globiguard-secret-key)\s*[:=]\s*(?:bearer\s+)?\S+/gi,
      '[REDACTED_CREDENTIAL]'
    )
    .slice(0, 512);
}
