import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { GovernedMcpGateway } from "./gateway.js";

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REQUESTS_PER_MINUTE = 600;
const DEFAULT_UNAUTHENTICATED_REQUESTS_PER_MINUTE = 60;
const MAX_RATE_WINDOWS = 10_000;
const HEADERS_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const MAX_REQUESTS_PER_SOCKET = 1_000;
const MAX_HEADERS_COUNT = 64;

export interface GovernedHttpGatewayOptions {
  createGateway: () => Promise<GovernedMcpGateway>;
  bearerToken: string;
  host?: string;
  port?: number;
  path?: string;
  allowedHosts: string[];
  allowedOrigins?: string[];
  maxBodyBytes?: number;
  maxSessions?: number;
  sessionTtlMs?: number;
  requestsPerMinute?: number;
  onError?: (error: unknown) => void;
}

export interface GovernedHttpGatewayAddress {
  host: string;
  port: number;
  path: string;
}

interface Session {
  gateway: GovernedMcpGateway;
  transport: StreamableHTTPServerTransport;
  lastSeenAt: number;
  activeRequests: number;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

export class GovernedHttpGateway {
  private readonly sessions = new Map<string, Session>();
  private readonly rateWindows = new Map<string, RateWindow>();
  private readonly server: HttpServer;
  private cleanupTimer?: NodeJS.Timeout;
  private pendingSessions = 0;
  private closing = false;

  constructor(private readonly options: GovernedHttpGatewayOptions) {
    assertHttpOptions(options);
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error: unknown) => {
        this.options.onError?.(error);
        if (!response.headersSent) {
          if (error instanceof HttpRequestError) {
            jsonError(response, error.status, error.code, error.message);
          } else {
            jsonError(
              response,
              500,
              "internal_error",
              "Request failed closed.",
            );
          }
        } else {
          response.destroy();
        }
      });
    });
    this.server.headersTimeout = HEADERS_TIMEOUT_MS;
    this.server.requestTimeout = REQUEST_TIMEOUT_MS;
    this.server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
    this.server.maxRequestsPerSocket = MAX_REQUESTS_PER_SOCKET;
    this.server.maxHeadersCount = MAX_HEADERS_COUNT;
  }

  async start(): Promise<GovernedHttpGatewayAddress> {
    if (this.closing) {
      throw new Error("HTTP gateway cannot start after shutdown");
    }
    const host = this.options.host ?? "127.0.0.1";
    const port = this.options.port ?? 3001;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(port, host);
    });

    const cleanupInterval = Math.max(
      30_000,
      Math.min(this.sessionTtlMs, 5 * 60_000),
    );
    this.cleanupTimer = setInterval(() => {
      void this.removeExpiredSessions();
    }, cleanupInterval);
    this.cleanupTimer.unref();

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("HTTP gateway did not bind to a TCP address");
    }
    return { host, port: address.port, path: this.path };
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(
      sessions.map(({ gateway }) => gateway.server.close()),
    );
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
      this.server.closeAllConnections();
    });
  }

  private get path(): string {
    const value = this.options.path ?? "/mcp";
    return value.startsWith("/") ? value : `/${value}`;
  }

  private get maxBodyBytes(): number {
    return this.options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  }

  private get maxSessions(): number {
    return this.options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  }

  private get sessionTtlMs(): number {
    return this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    setSecurityHeaders(response);
    const url = new URL(request.url ?? "/", "http://gateway.invalid");
    if (!this.validHostAndOrigin(request)) {
      jsonError(response, 403, "forbidden", "Host or Origin is not allowed.");
      return;
    }
    if (url.pathname === "/healthz" && request.method === "GET") {
      json(response, 200, { status: "ok" });
      return;
    }
    if (url.pathname !== this.path) {
      jsonError(response, 404, "not_found", "Route not found.");
      return;
    }
    const authorized = this.authorized(request);
    if (!this.withinRateLimit(request, authorized)) {
      response.setHeader("retry-after", "60");
      jsonError(response, 429, "rate_limited", "Request rate limit exceeded.");
      return;
    }
    if (!authorized) {
      response.setHeader("www-authenticate", 'Bearer realm="globiguard-mcp"');
      jsonError(
        response,
        401,
        "unauthorized",
        "Bearer authentication required.",
      );
      return;
    }
    if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) {
      response.setHeader("allow", "GET, POST, DELETE");
      jsonError(response, 405, "method_not_allowed", "Method not allowed.");
      return;
    }

    const sessionId = headerValue(request, "mcp-session-id");
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        jsonError(
          response,
          404,
          "unknown_session",
          "MCP session was not found.",
        );
        return;
      }
      session.lastSeenAt = Date.now();
      session.activeRequests += 1;
      try {
        const body =
          request.method === "POST"
            ? await readJsonBody(request, this.maxBodyBytes)
            : undefined;
        await session.transport.handleRequest(request, response, body);
      } finally {
        session.activeRequests -= 1;
      }
      return;
    }

    if (request.method !== "POST") {
      jsonError(
        response,
        400,
        "session_required",
        "Initialize an MCP session before this request.",
      );
      return;
    }
    const body = await readJsonBody(request, this.maxBodyBytes);
    if (!isInitializeRequest(body)) {
      jsonError(
        response,
        400,
        "initialization_required",
        "The first request must be MCP initialize.",
      );
      return;
    }
    if (this.sessions.size + this.pendingSessions >= this.maxSessions) {
      jsonError(response, 503, "session_capacity", "Session capacity reached.");
      return;
    }

    await this.handleInitialization(request, response, body);
  }

  private async handleInitialization(
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ): Promise<void> {
    this.pendingSessions += 1;
    let initializedSessionId: string | undefined;
    let gateway: GovernedMcpGateway | undefined;
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: false,
        allowedHosts: this.options.allowedHosts,
        allowedOrigins: this.options.allowedOrigins,
        enableDnsRebindingProtection: true,
        onsessioninitialized: (sessionId) => {
          initializedSessionId = sessionId;
          if (!gateway) {
            throw new Error(
              "Gateway was unavailable during session initialization",
            );
          }
          this.sessions.set(sessionId, {
            gateway,
            transport,
            lastSeenAt: Date.now(),
            activeRequests: 1,
          });
        },
        onsessionclosed: (sessionId) => {
          this.sessions.delete(sessionId);
        },
      });
      gateway = await this.options.createGateway();
      transport.onerror = (error) => this.options.onError?.(error);
      await gateway.server.connect(transport);
      await transport.handleRequest(request, response, body);
      const session = initializedSessionId
        ? this.sessions.get(initializedSessionId)
        : undefined;
      if (session) session.activeRequests = 0;
      if (!initializedSessionId) {
        await gateway.server.close();
      }
    } catch (error) {
      if (initializedSessionId) this.sessions.delete(initializedSessionId);
      if (gateway) await gateway.server.close().catch(() => undefined);
      throw error;
    } finally {
      this.pendingSessions -= 1;
    }
  }

  private authorized(request: IncomingMessage): boolean {
    const authorization = headerValue(request, "authorization");
    if (!authorization?.startsWith("Bearer ")) return false;
    const candidate = authorization.slice("Bearer ".length).trim();
    const expectedDigest = createHash("sha256")
      .update(this.options.bearerToken)
      .digest();
    const candidateDigest = createHash("sha256").update(candidate).digest();
    return timingSafeEqual(expectedDigest, candidateDigest);
  }

  private validHostAndOrigin(request: IncomingMessage): boolean {
    const host = headerValue(request, "host");
    if (!host || !this.options.allowedHosts.includes(host)) return false;
    const origin = headerValue(request, "origin");
    if (!origin) return true;
    return this.options.allowedOrigins?.includes(origin) ?? false;
  }

  private withinRateLimit(
    request: IncomingMessage,
    authenticated: boolean,
  ): boolean {
    const key = `${authenticated ? "authenticated" : "unauthenticated"}:${
      request.socket.remoteAddress ?? "unknown"
    }`;
    const now = Date.now();
    const configuredLimit =
      this.options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
    const limit = authenticated
      ? configuredLimit
      : Math.min(configuredLimit, DEFAULT_UNAUTHENTICATED_REQUESTS_PER_MINUTE);
    const current = this.rateWindows.get(key);
    if (!current || now - current.startedAt >= 60_000) {
      if (!current && this.rateWindows.size >= MAX_RATE_WINDOWS) {
        return false;
      }
      this.rateWindows.set(key, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  }

  private async removeExpiredSessions(): Promise<void> {
    const threshold = Date.now() - this.sessionTtlMs;
    const expired = [...this.sessions.entries()].filter(
      ([, session]) =>
        session.activeRequests === 0 && session.lastSeenAt < threshold,
    );
    for (const [sessionId, session] of expired) {
      this.sessions.delete(sessionId);
      await session.gateway.server.close().catch((error: unknown) => {
        this.options.onError?.(error);
      });
    }
    for (const [key, window] of this.rateWindows) {
      if (Date.now() - window.startedAt >= 120_000) {
        this.rateWindows.delete(key);
      }
    }
  }
}

function assertHttpOptions(options: GovernedHttpGatewayOptions): void {
  if (options.bearerToken.length < 32) {
    throw new Error(
      "HTTP gateway bearer token must contain at least 32 characters",
    );
  }
  if (options.allowedHosts.length === 0) {
    throw new Error("HTTP gateway requires at least one allowed Host value");
  }
  for (const [name, value, maximum] of [
    ["maxBodyBytes", options.maxBodyBytes, 10 * 1024 * 1024],
    ["maxSessions", options.maxSessions, 10_000],
    ["sessionTtlMs", options.sessionTtlMs, 7 * 24 * 60 * 60 * 1000],
    ["requestsPerMinute", options.requestsPerMinute, 100_000],
  ] as const) {
    if (
      value !== undefined &&
      (!Number.isInteger(value) || value <= 0 || value > maximum)
    ) {
      throw new Error(
        `${name} must be a positive integer no greater than ${maximum}`,
      );
    }
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<unknown> {
  const contentType = headerValue(request, "content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpRequestError(
      415,
      "content_type",
      "Content-Type must be application/json.",
    );
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBodyBytes) {
      throw new HttpRequestError(
        413,
        "body_too_large",
        "Request body is too large.",
      );
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpRequestError(
      400,
      "invalid_json",
      "Request body must be valid JSON.",
    );
  }
}

function isInitializeRequest(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { method?: unknown }).method === "initialize"
  );
}

function headerValue(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
}

function json(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  if (response.headersSent) return;
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function jsonError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  json(response, status, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

class HttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
