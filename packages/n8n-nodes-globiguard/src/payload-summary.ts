import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData
} from 'n8n-workflow';

const MAX_SUMMARY_BYTES = 10 * 1024 * 1024;
const MAX_BINARY_BYTES = 100 * 1024 * 1024;
const MAX_BINARY_PROPERTIES = 128;
const SAFE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

export interface PayloadSummary {
  sha256: string;
  approxBytes: number;
  topLevelKeys: string[];
  topLevelValueKinds: IDataObject;
  recordCount?: number;
  binaryCount?: number;
  binaryBytes?: number;
  binaryProperties?: string[];
}

export async function summarizeN8nPayload(
  value: INodeExecutionData['json']
): Promise<PayloadSummary> {
  const canonical = canonicalJson(value);
  const encoded = new TextEncoder().encode(canonical);
  if (encoded.byteLength > MAX_SUMMARY_BYTES) {
    throw new Error(
      `GlobiGuard will not summarize payloads larger than ${MAX_SUMMARY_BYTES} bytes.`
    );
  }

  const keys = Object.keys(value).sort();
  const safeKeys = await Promise.all(keys.map(safeFieldName));
  const topLevelValueKinds = Object.fromEntries(
    safeKeys.map((key, index) => [key, valueKind(value[keys[index]])])
  ) as IDataObject;

  return {
    sha256: await sha256Hex(encoded),
    approxBytes: encoded.byteLength,
    topLevelKeys: safeKeys,
    topLevelValueKinds,
    ...(Array.isArray(value) ? { recordCount: value.length } : {})
  };
}

export async function summarizeN8nItem(
  context: IExecuteFunctions,
  itemIndex: number,
  item: INodeExecutionData
): Promise<PayloadSummary> {
  const jsonSummary = await summarizeN8nPayload(item.json);
  const binaryEntries = Object.entries(item.binary ?? {}).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (binaryEntries.length === 0) return jsonSummary;
  if (binaryEntries.length > MAX_BINARY_PROPERTIES) {
    throw new Error(
      `GlobiGuard will not authorize more than ${MAX_BINARY_PROPERTIES} binary properties in one item.`
    );
  }

  let binaryBytes = 0;
  const binaryDescriptors = await Promise.all(
    binaryEntries.map(async ([propertyName, metadata]) => {
      const value = await context.helpers.getBinaryDataBuffer(
        itemIndex,
        propertyName
      );
      binaryBytes += value.byteLength;
      if (binaryBytes > MAX_BINARY_BYTES) {
        throw new Error(
          `GlobiGuard will not authorize more than ${MAX_BINARY_BYTES} binary bytes in one item.`
        );
      }
      return {
        propertyName,
        byteLength: value.byteLength,
        sha256: await sha256Hex(value),
        fileName: metadata.fileName ?? null,
        fileExtension: metadata.fileExtension ?? null,
        mimeType: metadata.mimeType ?? null
      };
    })
  );
  const digestInput = new TextEncoder().encode(
    canonicalJson({
      jsonSha256: jsonSummary.sha256,
      binary: binaryDescriptors
    })
  );

  return {
    ...jsonSummary,
    sha256: await sha256Hex(digestInput),
    approxBytes: jsonSummary.approxBytes + binaryBytes,
    binaryCount: binaryDescriptors.length,
    binaryBytes,
    binaryProperties: await Promise.all(
      binaryEntries.map(([propertyName]) => safeFieldName(propertyName))
    )
  };
}

export function canonicalJson(value: unknown): string {
  const stack = new Set<object>();

  const visit = (current: unknown): string => {
    if (current === null) return 'null';
    if (typeof current === 'string') return JSON.stringify(current);
    if (typeof current === 'boolean') return current ? 'true' : 'false';
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new Error('GlobiGuard cannot summarize non-finite numbers.');
      }
      return JSON.stringify(current);
    }
    if (typeof current === 'bigint') {
      throw new Error('GlobiGuard cannot summarize bigint values.');
    }
    if (typeof current === 'undefined') return 'null';
    if (typeof current !== 'object') {
      throw new Error(`GlobiGuard cannot summarize ${typeof current} values.`);
    }
    if (stack.has(current)) {
      throw new Error('GlobiGuard cannot summarize circular payloads.');
    }

    stack.add(current);
    let result: string;
    if (Array.isArray(current)) {
      result = `[${current.map(visit).join(',')}]`;
    } else {
      result = `{${Object.keys(current)
        .filter((key) => (current as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${visit(
              (current as Record<string, unknown>)[key]
            )}`
        )
        .join(',')}}`;
    }
    stack.delete(current);
    return result;
  };

  return visit(value);
}

async function safeFieldName(value: string): Promise<string> {
  if (SAFE_FIELD_NAME.test(value) && !/\d{4,}/.test(value)) {
    return value;
  }
  return `field_sha256:${(await sha256Hex(new TextEncoder().encode(value))).slice(0, 16)}`;
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  // Copy into an ArrayBuffer-backed view. TypeScript 5.9 correctly permits a
  // Uint8Array to wrap SharedArrayBuffer, while WebCrypto's BufferSource
  // contract does not; the explicit copy keeps both runtimes and types safe.
  const bytes = new Uint8Array(value.byteLength);
  bytes.set(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function valueKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
