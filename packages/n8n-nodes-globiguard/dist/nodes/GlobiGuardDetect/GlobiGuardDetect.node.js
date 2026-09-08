"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobiGuardDetect = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const transport_1 = require("../../src/transport");
const DETECTION_DECISIONS = ['ALLOW', 'MODIFY', 'BLOCK', 'QUEUE'];
const INFERENCE_STATUSES = ['complete', 'degraded', 'abstained', 'unavailable'];
const CONFIDENCE_BANDS = ['high', 'medium', 'low', 'not_applicable'];
const SHA256_HEX = /^[a-f0-9]{64}$/;
class GlobiGuardDetect {
    constructor() {
        this.description = {
            displayName: 'GlobiGuard Detect',
            name: 'globiGuardDetect',
            icon: {
                light: 'file:globiguard.light.svg',
                dark: 'file:globiguard.dark.svg'
            },
            group: ['transform'],
            version: 2,
            subtitle: '={{$parameter["redactionStrategy"]}}',
            description: 'Detect and optionally redact sensitive data before it reaches models or external systems',
            defaults: { name: 'GlobiGuard Detect' },
            usableAsTool: true,
            inputs: [n8n_workflow_1.NodeConnectionTypes.Main],
            outputs: [
                n8n_workflow_1.NodeConnectionTypes.Main,
                n8n_workflow_1.NodeConnectionTypes.Main,
                n8n_workflow_1.NodeConnectionTypes.Main
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
                    description: 'Text sent to the configured GlobiGuard detection service for classification'
                },
                {
                    displayName: 'Industry',
                    name: 'industry',
                    type: 'string',
                    default: 'GENERAL',
                    required: true,
                    placeholder: 'INSURANCE',
                    description: 'Domain profile used by the calibrated detection policy, such as INSURANCE or HEALTHCARE'
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
    }
    async execute() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
        const inputs = this.getInputData();
        const sensitive = [];
        const clean = [];
        const errors = [];
        for (let itemIndex = 0; itemIndex < inputs.length; itemIndex += 1) {
            const input = inputs[itemIndex];
            let sourceText;
            try {
                const text = this.getNodeParameter('text', itemIndex, '');
                sourceText = text;
                const industry = this.getNodeParameter('industry', itemIndex, 'GENERAL');
                const redactionStrategy = this.getNodeParameter('redactionStrategy', itemIndex, 'none');
                const normalizedIndustry = normalizeIndustry(this, industry, itemIndex);
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
                if (text.length > 100000) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'GlobiGuard Detect rejects text longer than 100,000 characters.', { itemIndex });
                }
                const body = {
                    text,
                    industry: normalizedIndustry
                };
                const result = await (0, transport_1.globiGuardRequest)(this, 'controlPlane', 'POST', '/v1/detection/evaluate', { body });
                if (!Array.isArray(result.masked_fields) ||
                    !Array.isArray(result.blocked_fields)) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'GlobiGuard returned invalid detection field collections.', { itemIndex });
                }
                const maskedFields = result.masked_fields;
                const blockedFields = result.blocked_fields;
                const entities = [...maskedFields, ...blockedFields];
                if (!DETECTION_DECISIONS.includes(result.decision)) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'GlobiGuard returned an invalid detection decision.', { itemIndex });
                }
                validateInferenceMetadata(this, result, itemIndex);
                const hasSensitiveData = entities.length > 0 || result.decision !== 'ALLOW';
                if (redactionStrategy !== 'none' &&
                    hasSensitiveData &&
                    entities.length === 0) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'GlobiGuard reported sensitive data without redactable spans; redaction failed closed.', { itemIndex });
                }
                const redactedText = redactionStrategy === 'none'
                    ? null
                    : redactByOffsets(this, text, entities, redactionStrategy, itemIndex);
                const output = {
                    ...input,
                    json: {
                        ...input.json,
                        globiguard: {
                            scanned: true,
                            hasSensitiveData,
                            safeToProceed: result.decision === 'ALLOW',
                            decision: result.decision,
                            decisionBand: (_a = result.decision_band) !== null && _a !== void 0 ? _a : null,
                            confidence: (_b = result.confidence) !== null && _b !== void 0 ? _b : null,
                            riskScore: (_c = result.risk_score) !== null && _c !== void 0 ? _c : null,
                            reasonCodes: (_d = result.reason_codes) !== null && _d !== void 0 ? _d : [],
                            recommendedAction: (_e = result.recommended_action) !== null && _e !== void 0 ? _e : null,
                            fallbackMode: (_f = result.fallback_mode) !== null && _f !== void 0 ? _f : null,
                            brainContractVersion: (_g = result.brain_contract_version) !== null && _g !== void 0 ? _g : null,
                            traceId: (_h = result.trace_id) !== null && _h !== void 0 ? _h : null,
                            inferenceStatus: (_k = (_j = result.inference) === null || _j === void 0 ? void 0 : _j.status) !== null && _k !== void 0 ? _k : null,
                            policyAuthority: (_m = (_l = result.inference) === null || _l === void 0 ? void 0 : _l.policy_authority) !== null && _m !== void 0 ? _m : null,
                            provenanceDigest: (_p = (_o = result.inference) === null || _o === void 0 ? void 0 : _o.provenance_digest) !== null && _p !== void 0 ? _p : null,
                            totalLatencyMs: (_r = (_q = result.inference) === null || _q === void 0 ? void 0 : _q.total_latency_ms) !== null && _r !== void 0 ? _r : null,
                            deterministicLayers: (_t = (_s = result.inference) === null || _s === void 0 ? void 0 : _s.deterministic_layers) !== null && _t !== void 0 ? _t : [],
                            specialists: projectSpecialists((_u = result.inference) === null || _u === void 0 ? void 0 : _u.specialists),
                            fieldCountByTier: (_v = result.field_count_by_tier) !== null && _v !== void 0 ? _v : {},
                            entities,
                            redactedText,
                            redactionComplete: redactionStrategy === 'none' ? null : true,
                            industry: normalizedIndustry,
                            redactionStrategy
                        }
                    },
                    pairedItem: { item: itemIndex }
                };
                (hasSensitiveData ? sensitive : clean).push(output);
            }
            catch (error) {
                if (!this.continueOnFail()) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), error, {
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
exports.GlobiGuardDetect = GlobiGuardDetect;
function validateInferenceMetadata(context, result, itemIndex) {
    const inference = result.inference;
    if (inference === undefined)
        return;
    const validStatus = INFERENCE_STATUSES.includes(inference.status);
    if (result.brain_contract_version !== '1.0' ||
        typeof result.trace_id !== 'string' ||
        result.trace_id.length === 0 ||
        result.trace_id.length > 128 ||
        !validStatus ||
        inference.policy_authority !== 'control_plane' ||
        typeof inference.route !== 'string' ||
        inference.route.length === 0 ||
        !Array.isArray(inference.specialists) ||
        !Array.isArray(inference.deterministic_layers) ||
        !SHA256_HEX.test(inference.provenance_digest)) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'GlobiGuard returned invalid Brain inference provenance.', { itemIndex });
    }
    for (const specialist of inference.specialists) {
        validateSpecialistInference(context, specialist, itemIndex);
    }
    if ((inference.status === 'unavailable' || inference.status === 'abstained') &&
        (result.decision === 'ALLOW' || result.decision === 'MODIFY')) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'GlobiGuard returned a clean decision without usable Brain inference evidence.', { itemIndex });
    }
}
function validateSpecialistInference(context, specialist, itemIndex) {
    var _a;
    const validOptionalSha = (value) => value === null ||
        value === undefined ||
        (typeof value === 'string' && SHA256_HEX.test(value));
    if (!specialist ||
        typeof specialist !== 'object' ||
        Array.isArray(specialist) ||
        typeof specialist.role !== 'string' ||
        specialist.role.length === 0 ||
        specialist.role.length > 80 ||
        !INFERENCE_STATUSES.includes(specialist.status) ||
        (specialist.artifact_id !== null &&
            specialist.artifact_id !== undefined &&
            (typeof specialist.artifact_id !== 'string' ||
                specialist.artifact_id.length === 0 ||
                specialist.artifact_id.length > 256)) ||
        !validOptionalSha(specialist.artifact_sha256) ||
        !validOptionalSha(specialist.ontology_sha256) ||
        !CONFIDENCE_BANDS.includes(specialist.confidence_band) ||
        (specialist.latency_ms !== null &&
            specialist.latency_ms !== undefined &&
            (typeof specialist.latency_ms !== 'number' ||
                !Number.isFinite(specialist.latency_ms) ||
                specialist.latency_ms < 0)) ||
        !Number.isInteger(specialist.finding_count) ||
        ((_a = specialist.finding_count) !== null && _a !== void 0 ? _a : -1) < 0) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'GlobiGuard returned invalid Brain specialist provenance.', { itemIndex });
    }
}
function projectSpecialists(specialists) {
    return (specialists !== null && specialists !== void 0 ? specialists : []).map((specialist) => {
        var _a, _b, _c, _d;
        return ({
            role: specialist.role,
            status: specialist.status,
            artifact_id: (_a = specialist.artifact_id) !== null && _a !== void 0 ? _a : null,
            artifact_sha256: (_b = specialist.artifact_sha256) !== null && _b !== void 0 ? _b : null,
            ontology_sha256: (_c = specialist.ontology_sha256) !== null && _c !== void 0 ? _c : null,
            confidence_band: specialist.confidence_band,
            latency_ms: (_d = specialist.latency_ms) !== null && _d !== void 0 ? _d : null,
            finding_count: specialist.finding_count
        });
    });
}
function normalizeIndustry(context, value, itemIndex) {
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]{0,63}$/.test(normalized)) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'Industry must start with a letter and contain only letters, numbers, underscores, or hyphens.', { itemIndex });
    }
    return normalized;
}
function redactByOffsets(context, text, fields, strategy, itemIndex) {
    const codePoints = Array.from(text);
    const spans = fields
        .map((field) => {
        const start = field.start_pos;
        const end = field.end_pos;
        if (typeof start !== 'number' ||
            typeof end !== 'number' ||
            !Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < 0 ||
            end <= start ||
            end > codePoints.length) {
            throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'GlobiGuard returned a detected field without a valid redaction span; redaction failed closed.', { itemIndex });
        }
        return {
            start,
            end,
            label: normalizeFieldLabel(field.field_type)
        };
    })
        .sort((left, right) => left.start - right.start || left.end - right.end);
    const merged = [];
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
        const replacement = strategy === 'drop'
            ? []
            : strategy === 'mask'
                ? Array(span.end - span.start).fill('*')
                : Array.from(`[${span.label}]`);
        codePoints.splice(span.start, span.end - span.start, ...replacement);
    }
    return codePoints.join('');
}
function normalizeFieldLabel(value) {
    if (typeof value !== 'string')
        return 'SENSITIVE';
    const normalized = value.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
    return normalized.slice(0, 64) || 'SENSITIVE';
}
function safeDetectionError(error, sourceText) {
    let message = error instanceof Error ? error.message : 'Unknown GlobiGuard detection error';
    if (sourceText) {
        message = message.split(sourceText).join('[REDACTED_INPUT]');
    }
    return message
        .replace(/\b(?:ggsk|sk|pk)_(?:test_|live_)?[A-Za-z0-9_-]+\b/g, '[REDACTED_KEY]')
        .replace(/(?:authorization|cookie|x-api-key|x-globiguard-secret-key)\s*[:=]\s*(?:bearer\s+)?\S+/gi, '[REDACTED_CREDENTIAL]')
        .slice(0, 512);
}
//# sourceMappingURL=GlobiGuardDetect.node.js.map