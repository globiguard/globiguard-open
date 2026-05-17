export interface GlobiguardRealtimeEvent<
  TPayload = Record<string, unknown>
> {
  channel: string;
  data: TPayload;
}

export interface GlobiguardRealtimeSubscription {
  channel: string;
  unsubscribe(): void;
}

export interface GlobiguardRealtimeSubscribeOptions<
  TPayload = Record<string, unknown>
> {
  onEvent(event: GlobiguardRealtimeEvent<TPayload>): void;
  onError?: (error: Error) => void;
}

export interface GlobiguardRealtimeBearerAuth {
  kind: "bearer";
  token: string;
}

export interface GlobiguardRealtimeApiKeyAuth {
  kind: "apiKey";
  token: string;
}

export type GlobiguardRealtimeAuth =
  | GlobiguardRealtimeBearerAuth
  | GlobiguardRealtimeApiKeyAuth;

export interface GlobiguardRealtimeConnectionConfig {
  auth: GlobiguardRealtimeAuth;
  path?: string;
}

export interface GlobiguardRealtimeClient {
  subscribeTransparency(
    sessionId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription;
  subscribeWorkflow(
    runId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription;
  subscribeQueue(
    orgId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription;
  subscribeDecision(
    authorizationId: string,
    options: GlobiguardRealtimeSubscribeOptions
  ): GlobiguardRealtimeSubscription;
  disconnect(): void;
}
