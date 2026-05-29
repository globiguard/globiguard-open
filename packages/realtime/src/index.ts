import type {
  GlobiguardRealtimeAuth,
  GlobiguardRealtimeClient,
  GlobiguardRealtimeConnectionConfig,
  GlobiguardRealtimeEvent,
  GlobiguardRealtimeSubscribeOptions,
  GlobiguardRealtimeSubscription
} from "@globiguard/contracts";
import { io, type Socket } from "socket.io-client";

export type {
  GlobiguardRealtimeAuth,
  GlobiguardRealtimeClient,
  GlobiguardRealtimeConnectionConfig,
  GlobiguardRealtimeEvent,
  GlobiguardRealtimeSubscribeOptions,
  GlobiguardRealtimeSubscription
} from "@globiguard/contracts";

export class GlobiguardRealtimeConfigError extends Error {
  readonly name = "GlobiguardRealtimeConfigError";
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GlobiguardRealtimeSocketLike {
  connected: boolean;
  on(event: string, listener: (payload: unknown) => void): this;
  off(event: string, listener: (payload: unknown) => void): this;
  emit(event: string, payload?: unknown): this;
  connect(): this;
  disconnect(): this;
}

export interface GlobiguardRealtimeSocketFactoryArgs {
  baseUrl: string;
  path: string;
  auth: Record<string, string>;
}

export type GlobiguardRealtimeSocketFactory = (
  args: GlobiguardRealtimeSocketFactoryArgs
) => GlobiguardRealtimeSocketLike;

export interface GlobiguardRealtimeClientConfig
  extends GlobiguardRealtimeConnectionConfig {
  socketFactory?: GlobiguardRealtimeSocketFactory;
}

interface SubscriptionDescriptor {
  subscribeEvent: string;
  channel: string;
  payload: Record<string, string>;
}

interface ListenerRecord {
  onEvent: GlobiguardRealtimeSubscribeOptions["onEvent"];
  onError?: GlobiguardRealtimeSubscribeOptions["onError"];
}

function defaultSocketFactory({
  baseUrl,
  path,
  auth
}: GlobiguardRealtimeSocketFactoryArgs): GlobiguardRealtimeSocketLike {
  return io(baseUrl, {
    path,
    transports: ["websocket"],
    autoConnect: false,
    auth
  }) as unknown as Socket;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload instanceof Error && payload.message.trim()) {
    return payload.message;
  }

  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.trim()
  ) {
    return payload.message;
  }

  return fallback;
}

function validateRealtimePath(path?: string): string {
  const normalizedPath = path?.trim() || "/ws";

  if (!normalizedPath.startsWith("/")) {
    throw new GlobiguardRealtimeConfigError("Realtime path must start with '/'.");
  }

  if (normalizedPath.includes("?") || normalizedPath.includes("#")) {
    throw new GlobiguardRealtimeConfigError(
      "Realtime path must not include query strings or fragments."
    );
  }

  return normalizedPath;
}

function buildRealtimeAuthHeaders(auth: GlobiguardRealtimeAuth): Record<string, string> {
  const token = auth.token?.trim();

  if (!token) {
    throw new GlobiguardRealtimeConfigError(
      "Realtime auth requires a non-empty token."
    );
  }

  switch (auth.kind) {
    case "bearer":
      return { token: `Bearer ${token}` };
    case "apiKey":
      if (!token.startsWith("gg_")) {
        throw new GlobiguardRealtimeConfigError(
          "Realtime API key auth requires a gg_ token."
        );
      }
      return { token };
    default:
      throw new GlobiguardRealtimeConfigError(
        "Realtime auth requires a recognized bearer or apiKey kind."
      );
  }
}

function assertNonEmptyRealtimeIdentifier(kind: string, value: string): string {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GlobiguardRealtimeConfigError(`${kind} must be a non-empty string.`);
  }

  if (
    normalizedValue.includes("/") ||
    normalizedValue.includes("?") ||
    normalizedValue.includes("#")
  ) {
    throw new GlobiguardRealtimeConfigError(
      `${kind} must not contain path or URL separators.`
    );
  }

  return normalizedValue;
}

function assertRealtimeIdentifier(kind: string, value: string): string {
  const normalizedValue = value.trim();

  if (!UUID_RE.test(normalizedValue)) {
    throw new GlobiguardRealtimeConfigError(`${kind} must be a valid UUID.`);
  }

  return normalizedValue;
}

class RealtimeClient implements GlobiguardRealtimeClient {
  private socket: GlobiguardRealtimeSocketLike | null = null;
  private readonly listeners = new Map<string, Set<ListenerRecord>>();
  private readonly subscriptions = new Map<string, SubscriptionDescriptor>();
  private hasEstablishedConnection = false;
  private awaitingReconnect = false;

  private readonly handleSocketEvent = (payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const eventPayload = payload as Partial<GlobiguardRealtimeEvent>;
    if (typeof eventPayload.channel !== "string") {
      return;
    }

    const listeners = this.listeners.get(eventPayload.channel);
    if (!listeners?.size) {
      return;
    }

    const event: GlobiguardRealtimeEvent = {
      channel: eventPayload.channel,
      data:
        eventPayload.data && typeof eventPayload.data === "object"
          ? (eventPayload.data as Record<string, unknown>)
          : {}
    };

    listeners.forEach((listener) => {
      listener.onEvent(event);
    });
  };

  private readonly handleSocketError = (payload: unknown) => {
    const error = new Error(
      extractErrorMessage(payload, "GlobiGuard realtime request failed.")
    );

    this.listeners.forEach((listeners) => {
      listeners.forEach((listener) => {
        listener.onError?.(error);
      });
    });
  };

  private readonly handleSocketConnect = () => {
    if (!this.socket) {
      return;
    }

    const shouldReplay = this.hasEstablishedConnection;
    this.hasEstablishedConnection = true;
    this.awaitingReconnect = false;

    if (!shouldReplay) {
      return;
    }

    this.subscriptions.forEach((descriptor) => {
      this.socket?.emit(descriptor.subscribeEvent, descriptor.payload);
    });
  };

  constructor(
    private readonly baseUrl: string,
    private readonly path: string,
    private readonly auth: Record<string, string>,
    private readonly socketFactory: GlobiguardRealtimeSocketFactory
  ) {}

  subscribeTransparency(
    sessionId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription {
    const normalizedSessionId = assertRealtimeIdentifier("sessionId", sessionId);

    return this.subscribe(
      {
        subscribeEvent: "subscribe:transparency",
        channel: `transparency:${normalizedSessionId}`,
        payload: {
          session_id: normalizedSessionId
        }
      },
      options
    );
  }

  subscribeWorkflow(
    runId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription {
    const normalizedRunId = assertRealtimeIdentifier("runId", runId);

    return this.subscribe(
      {
        subscribeEvent: "subscribe:workflow",
        channel: `workflow:${normalizedRunId}`,
        payload: {
          run_id: normalizedRunId
        }
      },
      options
    );
  }

  subscribeQueue(
    orgId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription {
    const normalizedOrgId = assertRealtimeIdentifier("orgId", orgId);

    return this.subscribe(
      {
        subscribeEvent: "subscribe:queue",
        channel: `queue:${normalizedOrgId}`,
        payload: {
          org_id: normalizedOrgId
        }
      },
      options
    );
  }

  subscribeDecision(
    authorizationId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription {
    const normalizedAuthorizationId = assertNonEmptyRealtimeIdentifier(
      "authorizationId",
      authorizationId
    );

    return this.subscribe(
      {
        subscribeEvent: "subscribe:decision",
        channel: `decision:${normalizedAuthorizationId}`,
        payload: {
          authorization_id: normalizedAuthorizationId
        }
      },
      options
    );
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.off("connect", this.handleSocketConnect);
      this.socket.off("event", this.handleSocketEvent);
      this.socket.off("error", this.handleSocketError);
      this.socket.off("connect_error", this.handleSocketError);
      this.socket.disconnect();
      this.socket = null;
    }

    this.listeners.clear();
    this.subscriptions.clear();
    this.hasEstablishedConnection = false;
    this.awaitingReconnect = false;
  }

  private rebuildSocket(): void {
    if (this.socket) {
      this.socket.off("connect", this.handleSocketConnect);
      this.socket.off("event", this.handleSocketEvent);
      this.socket.off("error", this.handleSocketError);
      this.socket.off("connect_error", this.handleSocketError);
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.listeners.size === 0) {
      this.hasEstablishedConnection = false;
      this.awaitingReconnect = false;
      return;
    }

    this.hasEstablishedConnection = true;
    this.awaitingReconnect = true;
    this.ensureSocket();
  }

  private subscribe(
    descriptor: SubscriptionDescriptor,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription {
    const socket = this.ensureSocket();
    const listener: ListenerRecord = {
      onEvent: options.onEvent,
      onError: options.onError
    };
    const channelListeners =
      this.listeners.get(descriptor.channel) ?? new Set<ListenerRecord>();
    const shouldEmitSubscribe = channelListeners.size === 0;

    channelListeners.add(listener);
    this.listeners.set(descriptor.channel, channelListeners);
    if (shouldEmitSubscribe) {
      this.subscriptions.set(descriptor.channel, descriptor);
      if (!this.awaitingReconnect && (socket.connected || !this.hasEstablishedConnection)) {
        socket.emit(descriptor.subscribeEvent, descriptor.payload);
      }
    }

    return {
      channel: descriptor.channel,
      unsubscribe: () => {
        const listeners = this.listeners.get(descriptor.channel);
        if (!listeners) {
          return;
        }

        listeners.delete(listener);
        if (listeners.size === 0) {
          this.listeners.delete(descriptor.channel);
          this.subscriptions.delete(descriptor.channel);
        }

        if (this.listeners.size === 0) {
          this.disconnect();
        } else if (listeners.size === 0) {
          this.rebuildSocket();
        }
      }
    };
  }

  private ensureSocket(): GlobiguardRealtimeSocketLike {
    if (this.socket) {
      if (!this.socket.connected) {
        if (this.hasEstablishedConnection) {
          this.awaitingReconnect = true;
        }
        this.socket.connect();
      }

      return this.socket;
    }

    const socket = this.socketFactory({
      baseUrl: this.baseUrl,
      path: this.path,
      auth: this.auth
    });

    this.socket = socket;
    socket.on("connect", this.handleSocketConnect);
    socket.on("event", this.handleSocketEvent);
    socket.on("error", this.handleSocketError);
    socket.on("connect_error", this.handleSocketError);
    socket.connect();

    return socket;
  }
}

export function createRealtimeClient(
  baseUrl: string,
  config: GlobiguardRealtimeClientConfig
): GlobiguardRealtimeClient {
  return new RealtimeClient(
    baseUrl,
    validateRealtimePath(config.path),
    buildRealtimeAuthHeaders(config.auth),
    config.socketFactory ?? defaultSocketFactory
  );
}
