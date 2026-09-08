import type { GlobiguardDataClass } from "@globiguard/contracts";

import type { GlobiguardTransport } from "../client.js";
import { GlobiguardAuthorityError, GlobiguardConfigError } from "../errors.js";

export const GLOBIGUARD_BRAIN_INFERENCE_CONTRACT_VERSION = "1.0" as const;

export type GlobiguardDetectionDecision = "ALLOW" | "MODIFY" | "QUEUE" | "BLOCK";
export type GlobiguardInferenceStatus =
  | "complete"
  | "degraded"
  | "abstained"
  | "unavailable";
export type GlobiguardConfidenceBand =
  | "high"
  | "medium"
  | "low"
  | "not_applicable";

export interface GlobiguardDetectionEvaluateRequest {
  text: string;
  industry?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
}

export interface GlobiguardDetectedField {
  field_type: string;
  token?: string | null;
  confidence: number;
  method: string;
  start_pos?: number | null;
  end_pos?: number | null;
  rule_id?: string | null;
  sensitivity_tier: "PUBLIC" | "RESTRICTED" | "CONFIDENTIAL" | "BLOCKED";
  detector_provenance?: string[];
  corroboration_count?: number;
  fusion_confidence?: number | null;
  [key: string]: unknown;
}

export interface GlobiguardSpecialistInference {
  role: string;
  status: GlobiguardInferenceStatus;
  artifact_id?: string | null;
  artifact_sha256?: string | null;
  ontology_sha256?: string | null;
  confidence_band: GlobiguardConfidenceBand;
  latency_ms?: number | null;
  finding_count: number;
  [key: string]: unknown;
}

export interface GlobiguardInferenceMetadata {
  status: GlobiguardInferenceStatus;
  policy_authority: "control_plane";
  route: string;
  specialists: GlobiguardSpecialistInference[];
  deterministic_layers: string[];
  total_latency_ms?: number | null;
  provenance_digest: string;
  [key: string]: unknown;
}

export interface GlobiguardDetectionEvaluateResponse {
  brain_contract_version: typeof GLOBIGUARD_BRAIN_INFERENCE_CONTRACT_VERSION;
  trace_id: string;
  decision: GlobiguardDetectionDecision;
  masked_fields: GlobiguardDetectedField[];
  blocked_fields: GlobiguardDetectedField[];
  inference: GlobiguardInferenceMetadata;
  fallback_mode?: string | null;
  [key: string]: unknown;
}

export interface GlobiguardDetectionClient {
  evaluate(
    request: GlobiguardDetectionEvaluateRequest
  ): Promise<GlobiguardDetectionEvaluateResponse>;
}

export interface GlobiguardDetectionActionEvidence {
  dataClasses: GlobiguardDataClass[];
  fieldTypes: string[];
  fieldCount: number;
  metadata: Record<string, string | number | string[]>;
}

export interface GlobiguardSafeDetectedField {
  fieldType: string;
  sensitivityTier: GlobiguardDetectedField["sensitivity_tier"];
  confidence: number;
  method: string;
}

const DECISIONS = new Set<GlobiguardDetectionDecision>([
  "ALLOW",
  "MODIFY",
  "QUEUE",
  "BLOCK"
]);
const INFERENCE_STATUSES = new Set<GlobiguardInferenceStatus>([
  "complete",
  "degraded",
  "abstained",
  "unavailable"
]);
const CONFIDENCE_BANDS = new Set<GlobiguardConfidenceBand>([
  "high",
  "medium",
  "low",
  "not_applicable"
]);
const SENSITIVITY_TIERS = new Set([
  "PUBLIC",
  "RESTRICTED",
  "CONFIDENTIAL",
  "BLOCKED"
]);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const SAFE_LABEL = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_PROVENANCE_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;

export function createDetectionClient(
  transport: GlobiguardTransport
): GlobiguardDetectionClient {
  return {
    async evaluate(request) {
      validateDetectionRequest(request);
      const response = await transport.request<unknown>("/v1/detection/evaluate", {
        method: "POST",
        body: request
      });
      return validateDetectionResponse(response);
    }
  };
}

export function validateDetectionResponse(
  value: unknown
): GlobiguardDetectionEvaluateResponse {
  if (!isRecord(value)) {
    throw invalidDetectionResponse("GlobiGuard returned an invalid detection response.");
  }
  if (
    value.brain_contract_version !== GLOBIGUARD_BRAIN_INFERENCE_CONTRACT_VERSION ||
    typeof value.trace_id !== "string" ||
    value.trace_id.length < 1 ||
    value.trace_id.length > 128 ||
    !DECISIONS.has(value.decision as GlobiguardDetectionDecision) ||
    !Array.isArray(value.masked_fields) ||
    !Array.isArray(value.blocked_fields)
  ) {
    throw invalidDetectionResponse(
      "GlobiGuard returned an invalid detection decision envelope."
    );
  }

  for (const field of [...value.masked_fields, ...value.blocked_fields]) {
    validateDetectedField(field);
  }
  const inference = validateInferenceMetadata(value.inference);
  if (
    (inference.status === "abstained" || inference.status === "unavailable") &&
    (value.decision === "ALLOW" || value.decision === "MODIFY")
  ) {
    throw invalidDetectionResponse(
      "GlobiGuard returned a clean decision without usable Brain inference evidence.",
      "UNUSABLE_INFERENCE_AUTHORITY"
    );
  }

  return value as unknown as GlobiguardDetectionEvaluateResponse;
}

export function projectDetectionActionEvidence(
  response: GlobiguardDetectionEvaluateResponse
): GlobiguardDetectionActionEvidence {
  const fields = [...response.masked_fields, ...response.blocked_fields];
  const fieldTypes = new Set<string>();
  const dataClasses = new Set<GlobiguardDataClass>();

  for (const field of fields) {
    if (SAFE_LABEL.test(field.field_type)) fieldTypes.add(field.field_type);
    const mappedClass = mapSensitivityTier(field.sensitivity_tier);
    if (mappedClass !== "PUBLIC") dataClasses.add(mappedClass);
    if (fieldTypes.size >= 128) break;
  }

  const specialistStatuses = response.inference.specialists
    .map(({ role, status }) => `${role}:${status}`)
    .filter((value) => SAFE_PROVENANCE_NAME.test(value.replace(":", ".")))
    .slice(0, 32);
  const deterministicLayers = response.inference.deterministic_layers
    .filter((value) => SAFE_PROVENANCE_NAME.test(value))
    .slice(0, 32);
  const metadata: Record<string, string | number | string[]> = {
    detectionSource: "control_plane",
    brainContractVersion: response.brain_contract_version,
    detectionTraceId: response.trace_id,
    inferenceStatus: response.inference.status,
    detectionRoute: response.inference.route,
    detectionProvenanceDigest: response.inference.provenance_digest,
    detectedFieldCount: fields.length,
    detectionSpecialists: specialistStatuses,
    detectionDeterministicLayers: deterministicLayers
  };
  if (
    typeof response.fallback_mode === "string" &&
    SAFE_PROVENANCE_NAME.test(response.fallback_mode)
  ) {
    metadata.detectionFallbackMode = response.fallback_mode;
  }

  return {
    dataClasses: [...dataClasses].sort(),
    fieldTypes: [...fieldTypes].sort(),
    fieldCount: fields.length,
    metadata
  };
}

export function projectSafeDetectedFields(
  response: GlobiguardDetectionEvaluateResponse
): GlobiguardSafeDetectedField[] {
  return [...response.masked_fields, ...response.blocked_fields].map((field) => ({
    fieldType: SAFE_LABEL.test(field.field_type) ? field.field_type : "SENSITIVE",
    sensitivityTier: field.sensitivity_tier,
    confidence: field.confidence,
    method: SAFE_PROVENANCE_NAME.test(field.method) ? field.method : "UNKNOWN"
  }));
}

export function assertDetectionAllowsContinuation(
  response: GlobiguardDetectionEvaluateResponse,
  phase: "input" | "output",
  onBlock?: (decision: Record<string, unknown>) => void
): void {
  if (response.decision === "ALLOW") return;
  if (response.decision === "BLOCK") onBlock?.(response);

  const kind =
    response.decision === "BLOCK"
      ? "POLICY_BLOCKED"
      : response.decision === "QUEUE"
        ? "QUEUED_FOR_REVIEW"
        : "STEP_UP_REQUIRED";
  throw new GlobiguardAuthorityError({
    kind,
    message: `GlobiGuard detection returned ${response.decision}; the AI ${phase} was not released.`,
    safeDetails: {
      detectionDecision: response.decision,
      inferenceStatus: response.inference.status,
      traceId: response.trace_id,
      provenanceDigest: response.inference.provenance_digest
    }
  });
}

function validateDetectionRequest(request: GlobiguardDetectionEvaluateRequest): void {
  if (!isRecord(request) || typeof request.text !== "string") {
    throw new GlobiguardConfigError("Detection requires a text string.");
  }
  if (request.text.length < 1 || request.text.length > 100_000) {
    throw new GlobiguardConfigError(
      "Detection text must contain between 1 and 100,000 characters."
    );
  }
  if (
    request.industry !== undefined &&
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(request.industry)
  ) {
    throw new GlobiguardConfigError("Detection industry has an invalid format.");
  }
  if (
    request.sessionId !== undefined &&
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(request.sessionId)
  ) {
    throw new GlobiguardConfigError("Detection sessionId has an invalid format.");
  }
  if (request.context !== undefined && !isRecord(request.context)) {
    throw new GlobiguardConfigError("Detection context must be an object.");
  }
}

function validateInferenceMetadata(value: unknown): GlobiguardInferenceMetadata {
  if (!isRecord(value)) {
    throw invalidDetectionResponse("GlobiGuard omitted required Brain inference evidence.");
  }
  if (
    !INFERENCE_STATUSES.has(value.status as GlobiguardInferenceStatus) ||
    value.policy_authority !== "control_plane" ||
    typeof value.route !== "string" ||
    value.route.length < 1 ||
    value.route.length > 80 ||
    !Array.isArray(value.specialists) ||
    !Array.isArray(value.deterministic_layers) ||
    !value.deterministic_layers.every(
      (item) => typeof item === "string" && item.length > 0
    ) ||
    !SHA256_HEX.test(String(value.provenance_digest ?? "")) ||
    !isOptionalNonNegativeNumber(value.total_latency_ms)
  ) {
    throw invalidDetectionResponse("GlobiGuard returned invalid Brain inference provenance.");
  }
  for (const specialist of value.specialists) validateSpecialist(specialist);
  return value as unknown as GlobiguardInferenceMetadata;
}

function validateSpecialist(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.role !== "string" ||
    value.role.length < 1 ||
    value.role.length > 80 ||
    !INFERENCE_STATUSES.has(value.status as GlobiguardInferenceStatus) ||
    !isOptionalString(value.artifact_id, 256) ||
    !isOptionalSha(value.artifact_sha256) ||
    !isOptionalSha(value.ontology_sha256) ||
    !CONFIDENCE_BANDS.has(value.confidence_band as GlobiguardConfidenceBand) ||
    !isOptionalNonNegativeNumber(value.latency_ms) ||
    !Number.isInteger(value.finding_count) ||
    Number(value.finding_count) < 0
  ) {
    throw invalidDetectionResponse("GlobiGuard returned invalid Brain specialist provenance.");
  }
}

function validateDetectedField(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.field_type !== "string" ||
    value.field_type.length < 1 ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.method !== "string" ||
    !SENSITIVITY_TIERS.has(String(value.sensitivity_tier))
  ) {
    throw invalidDetectionResponse("GlobiGuard returned an invalid detected-field projection.");
  }
}

function mapSensitivityTier(tier: GlobiguardDetectedField["sensitivity_tier"]): GlobiguardDataClass {
  if (tier === "BLOCKED") return "SECRET";
  if (tier === "RESTRICTED") return "RESTRICTED";
  if (tier === "CONFIDENTIAL") return "CONFIDENTIAL";
  return "PUBLIC";
}

function invalidDetectionResponse(
  message: string,
  reason = "INVALID_DETECTION_RESPONSE"
): GlobiguardAuthorityError {
  return new GlobiguardAuthorityError({
    kind: "CONTROL_PLANE_UNAVAILABLE",
    message: `${message} The governed action remains stopped.`,
    safeDetails: { reason }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown, maxLength: number): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.length > 0 && value.length <= maxLength)
  );
}

function isOptionalSha(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && SHA256_HEX.test(value));
}

function isOptionalNonNegativeNumber(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}
