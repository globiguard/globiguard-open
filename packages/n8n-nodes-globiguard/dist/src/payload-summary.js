"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeN8nPayload = summarizeN8nPayload;
exports.summarizeN8nItem = summarizeN8nItem;
exports.canonicalJson = canonicalJson;
const MAX_SUMMARY_BYTES = 10 * 1024 * 1024;
const MAX_BINARY_BYTES = 100 * 1024 * 1024;
const MAX_BINARY_PROPERTIES = 128;
const SAFE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
async function summarizeN8nPayload(value) {
    const canonical = canonicalJson(value);
    const encoded = new TextEncoder().encode(canonical);
    if (encoded.byteLength > MAX_SUMMARY_BYTES) {
        throw new Error(`GlobiGuard will not summarize payloads larger than ${MAX_SUMMARY_BYTES} bytes.`);
    }
    const keys = Object.keys(value).sort();
    const safeKeys = await Promise.all(keys.map(safeFieldName));
    const topLevelValueKinds = Object.fromEntries(safeKeys.map((key, index) => [key, valueKind(value[keys[index]])]));
    return {
        sha256: await sha256Hex(encoded),
        approxBytes: encoded.byteLength,
        topLevelKeys: safeKeys,
        topLevelValueKinds,
        ...(Array.isArray(value) ? { recordCount: value.length } : {})
    };
}
async function summarizeN8nItem(context, itemIndex, item) {
    var _a;
    const jsonSummary = await summarizeN8nPayload(item.json);
    const binaryEntries = Object.entries((_a = item.binary) !== null && _a !== void 0 ? _a : {}).sort(([left], [right]) => left.localeCompare(right));
    if (binaryEntries.length === 0)
        return jsonSummary;
    if (binaryEntries.length > MAX_BINARY_PROPERTIES) {
        throw new Error(`GlobiGuard will not authorize more than ${MAX_BINARY_PROPERTIES} binary properties in one item.`);
    }
    let binaryBytes = 0;
    const binaryDescriptors = await Promise.all(binaryEntries.map(async ([propertyName, metadata]) => {
        var _a, _b, _c;
        const value = await context.helpers.getBinaryDataBuffer(itemIndex, propertyName);
        binaryBytes += value.byteLength;
        if (binaryBytes > MAX_BINARY_BYTES) {
            throw new Error(`GlobiGuard will not authorize more than ${MAX_BINARY_BYTES} binary bytes in one item.`);
        }
        return {
            propertyName,
            byteLength: value.byteLength,
            sha256: await sha256Hex(value),
            fileName: (_a = metadata.fileName) !== null && _a !== void 0 ? _a : null,
            fileExtension: (_b = metadata.fileExtension) !== null && _b !== void 0 ? _b : null,
            mimeType: (_c = metadata.mimeType) !== null && _c !== void 0 ? _c : null
        };
    }));
    const digestInput = new TextEncoder().encode(canonicalJson({
        jsonSha256: jsonSummary.sha256,
        binary: binaryDescriptors
    }));
    return {
        ...jsonSummary,
        sha256: await sha256Hex(digestInput),
        approxBytes: jsonSummary.approxBytes + binaryBytes,
        binaryCount: binaryDescriptors.length,
        binaryBytes,
        binaryProperties: await Promise.all(binaryEntries.map(([propertyName]) => safeFieldName(propertyName)))
    };
}
function canonicalJson(value) {
    const stack = new Set();
    const visit = (current) => {
        if (current === null)
            return 'null';
        if (typeof current === 'string')
            return JSON.stringify(current);
        if (typeof current === 'boolean')
            return current ? 'true' : 'false';
        if (typeof current === 'number') {
            if (!Number.isFinite(current)) {
                throw new Error('GlobiGuard cannot summarize non-finite numbers.');
            }
            return JSON.stringify(current);
        }
        if (typeof current === 'bigint') {
            throw new Error('GlobiGuard cannot summarize bigint values.');
        }
        if (typeof current === 'undefined')
            return 'null';
        if (typeof current !== 'object') {
            throw new Error(`GlobiGuard cannot summarize ${typeof current} values.`);
        }
        if (stack.has(current)) {
            throw new Error('GlobiGuard cannot summarize circular payloads.');
        }
        stack.add(current);
        let result;
        if (Array.isArray(current)) {
            result = `[${current.map(visit).join(',')}]`;
        }
        else {
            result = `{${Object.keys(current)
                .filter((key) => current[key] !== undefined)
                .sort()
                .map((key) => `${JSON.stringify(key)}:${visit(current[key])}`)
                .join(',')}}`;
        }
        stack.delete(current);
        return result;
    };
    return visit(value);
}
async function safeFieldName(value) {
    if (SAFE_FIELD_NAME.test(value) && !/\d{4,}/.test(value)) {
        return value;
    }
    return `field_sha256:${(await sha256Hex(new TextEncoder().encode(value))).slice(0, 16)}`;
}
async function sha256Hex(value) {
    const bytes = new Uint8Array(value.byteLength);
    bytes.set(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function valueKind(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return 'array';
    return typeof value;
}
//# sourceMappingURL=payload-summary.js.map