import type {
  GlobiguardCredential,
  GlobiguardEnvironment
} from "@globiguard/contracts";

import { GlobiguardConfigError, GlobiguardHttpError } from "./errors.js";

type QueryValue = string | number | boolean | null | undefined;

export interface GlobiguardRequestOptions {
  method?: string;
  headers?: HeadersInit;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
  /** Override the client request deadline for this call. */
  timeoutMs?: number;
}

interface RequestJsonArgs {
  baseUrl: string;
  clientName: string;
  credential: GlobiguardCredential;
  environment: GlobiguardEnvironment;
  fetchImpl: typeof fetch;
  path: string;
  options?: GlobiguardRequestOptions;
  requestTimeoutMs: number;
}

function joinUrl(baseUrl: string, path: string): URL {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path) || path.startsWith("//")) {
    throw new GlobiguardConfigError(
      "Request paths must be relative to the configured GlobiGuard service."
    );
  }

  if (!path.startsWith("/")) {
    throw new GlobiguardConfigError("Request paths must start with '/'.");
  }

  if (path.includes("?") || path.includes("#")) {
    throw new GlobiguardConfigError(
      "Request paths must not include query strings or fragments."
    );
  }

  if (path.includes("\\")) {
    throw new GlobiguardConfigError(
      "Request paths must not contain backslashes."
    );
  }

  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const base = new URL(normalizedBase);
  const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
  const segments = trimmedPath.split("/").filter(Boolean);

  for (const segment of segments) {
    let decodedSegment: string;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new GlobiguardConfigError(
        "Request paths must contain valid percent-encoding."
      );
    }

    if (decodedSegment === "." || decodedSegment === "..") {
      throw new GlobiguardConfigError(
        "Request paths must not contain dot segments."
      );
    }
  }

  const url = new URL(trimmedPath, base);

  if (url.origin !== base.origin) {
    throw new GlobiguardConfigError(
      "Resolved request URL must stay on the configured GlobiGuard origin."
    );
  }

  if (!url.pathname.startsWith(base.pathname)) {
    throw new GlobiguardConfigError(
      "Resolved request URL must stay under the configured GlobiGuard base path."
    );
  }

  return url;
}

function applyQuery(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

function buildCredentialHeaders(credential: GlobiguardCredential): Headers {
  const headers = new Headers();

  if (credential.projectId) {
    headers.set("x-globiguard-project-id", credential.projectId);
  }

  switch (credential.kind) {
    case "publishable":
      headers.set("x-globiguard-publishable-key", credential.token);
      break;
    case "secret":
      headers.set("x-globiguard-secret-key", credential.token);
      break;
    case "local":
      headers.set("x-globiguard-local-mode", "true");
      if (credential.token) {
        headers.set("x-globiguard-local-token", credential.token);
      }
      break;
    default:
      throw new GlobiguardConfigError(
        "Unrecognized GlobiGuard credential kind."
      );
  }

  return headers;
}

function isReservedHeader(name: string): boolean {
  const normalized = name.toLowerCase();

  return (
    normalized === "x-globiguard-client" ||
    normalized === "x-globiguard-environment" ||
    normalized === "x-globiguard-project-id" ||
    normalized === "x-globiguard-publishable-key" ||
    normalized === "x-globiguard-secret-key" ||
    normalized === "x-globiguard-local-mode" ||
    normalized === "x-globiguard-local-token"
  );
}

function buildBody(body: unknown): {
  body: BodyInit | undefined;
  setJsonContentType: boolean;
} {
  if (body === undefined) {
    return {
      body: undefined,
      setJsonContentType: false
    };
  }

  if (ArrayBuffer.isView(body)) {
    const bytes = new Uint8Array(
      body.buffer as ArrayBuffer,
      body.byteOffset,
      body.byteLength
    );

    return {
      body: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ),
      setJsonContentType: false
    };
  }

  if (
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  ) {
    return {
      body,
      setJsonContentType: false
    };
  }

  return {
    body: JSON.stringify(body),
    setJsonContentType: true
  };
}

export async function requestJson<TResponse>({
  baseUrl,
  clientName,
  credential,
  environment,
  fetchImpl,
  path,
  options,
  requestTimeoutMs
}: RequestJsonArgs): Promise<TResponse> {
  const url = joinUrl(baseUrl, path);
  applyQuery(url, options?.query);

  const callerHeaders = new Headers(options?.headers);
  const headers = buildCredentialHeaders(credential);

  callerHeaders.forEach((value, key) => {
    if (!isReservedHeader(key)) {
      headers.set(key, value);
    }
  });

  headers.set("x-globiguard-client", clientName);
  headers.set("x-globiguard-environment", environment);

  const requestBody = buildBody(options?.body);
  if (
    requestBody.setJsonContentType &&
    !headers.has("content-type") &&
    !(requestBody.body instanceof FormData)
  ) {
    headers.set("content-type", "application/json");
  }

  const timeoutMs = options?.timeoutMs ?? requestTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300_000) {
    throw new GlobiguardConfigError(
      "timeoutMs must be greater than 0 and at most 300000."
    );
  }
  const requestSignal = boundedSignal(options?.signal, timeoutMs);

  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, {
          method: options?.method ?? "GET",
          headers,
          body: requestBody.body,
          signal: requestSignal.signal
        });

        const hasNoContent =
          response.status === 204 ||
          response.status === 205 ||
          response.headers.get("content-length") === "0";
        const contentType = response.headers.get("content-type") ?? "";
        const responseBody = hasNoContent
          ? undefined
          : contentType.includes("application/json")
            ? await response.json()
            : await response.text();

        if (!response.ok) {
          throw new GlobiguardHttpError(
            `GlobiGuard request failed with status ${response.status}.`,
            response.status,
            responseBody
          );
        }
        return responseBody as TResponse;
      })(),
      requestSignal.aborted
    ]);
  } finally {
    requestSignal.dispose();
  }
}

function boundedSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; aborted: Promise<never>; dispose(): void } {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeout = setTimeout(
    () => controller.abort(
      new DOMException("GlobiGuard request timed out.", "TimeoutError")
    ),
    timeoutMs
  );
  let rejectAbort: (reason?: unknown) => void = () => undefined;
  const abortRejected = () => rejectAbort(
    controller.signal.reason ??
      new DOMException("GlobiGuard request was aborted.", "AbortError")
  );
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
    if (controller.signal.aborted) {
      abortRejected();
    } else {
      controller.signal.addEventListener("abort", abortRejected, { once: true });
    }
  });

  return {
    signal: controller.signal,
    aborted,
    dispose() {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
      controller.signal.removeEventListener("abort", abortRejected);
    }
  };
}

