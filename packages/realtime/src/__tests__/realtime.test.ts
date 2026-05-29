import { describe, expect, it, vi } from "vitest";

import {
  createRealtimeClient,
  GlobiguardRealtimeConfigError
} from "../index.js";

class FakeRealtimeSocket {
  connected = false;
  readonly emitted: Array<{ event: string; payload?: unknown }> = [];
  readonly handlers = new Map<string, Set<(payload: unknown) => void>>();

  constructor(
    readonly baseUrl: string,
    readonly options: {
      path: string;
      auth: Record<string, string>;
    }
  ) {}

  on(event: string, listener: (payload: unknown) => void) {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(listener);
    this.handlers.set(event, listeners);
    return this;
  }

  off(event: string, listener: (payload: unknown) => void) {
    this.handlers.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }

  connect() {
    this.connected = true;
    return this;
  }

  disconnect() {
    this.connected = false;
    return this;
  }

  dispatch(event: string, payload?: unknown) {
    this.handlers.get(event)?.forEach((listener) => {
      listener(payload);
    });
  }
}

describe("@globiguard/realtime", () => {
  it("creates a realtime client with explicit websocket auth", () => {
    const orgId = "11111111-1111-1111-1111-111111111111";
    let socket: FakeRealtimeSocket | undefined;
    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "bearer",
        token: "ws_test_123"
      },
      socketFactory: ({ baseUrl, path, auth }) => {
        socket = new FakeRealtimeSocket(baseUrl, { path, auth });
        return socket;
      }
    });

    const received: unknown[] = [];
    const errors: string[] = [];
    const subscription = client.subscribeQueue(orgId, {
      onEvent: (event) => received.push(event),
      onError: (error) => errors.push(error.message)
    });

    expect(socket?.connected).toBe(true);
    expect(socket?.baseUrl).toBe("https://control.example.com");
    expect(socket?.options.path).toBe("/ws");
    expect(socket?.options.auth).toEqual({
      token: "Bearer ws_test_123"
    });
    expect(socket?.emitted).toContainEqual({
      event: "subscribe:queue",
      payload: {
        org_id: orgId
      }
    });

    socket?.dispatch("event", {
      channel: `queue:${orgId}`,
      data: {
        status: "PENDING"
      }
    });
    socket?.dispatch("connect_error", { message: "Unauthorized" });

    expect(received).toEqual([
      {
        channel: `queue:${orgId}`,
        data: {
          status: "PENDING"
        }
      }
    ]);
    expect(errors).toEqual(["Unauthorized"]);

    subscription.unsubscribe();
    expect(socket?.connected).toBe(false);
  });

  it("emits only one remote subscribe per channel while multiple listeners are attached", () => {
    let socket: FakeRealtimeSocket | undefined;
    const orgId = "7a890dc5-e9d2-4764-b7f4-6ce5f159f8c7";
    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "bearer",
        token: "ws_test_123"
      },
      socketFactory: ({ baseUrl, path, auth }) => {
        socket = new FakeRealtimeSocket(baseUrl, { path, auth });
        return socket;
      }
    });

    const first = client.subscribeQueue(orgId, {
      onEvent: vi.fn()
    });
    const second = client.subscribeQueue(orgId, {
      onEvent: vi.fn()
    });

    expect(socket?.emitted).toEqual([
      {
        event: "subscribe:queue",
        payload: {
          org_id: orgId
        }
      }
    ]);

    first.unsubscribe();
    expect(socket?.connected).toBe(true);
    expect(socket?.emitted).toHaveLength(1);

    second.unsubscribe();
    expect(socket?.connected).toBe(false);
  });

  it("replays active subscriptions after the realtime socket reconnects", () => {
    let socket: FakeRealtimeSocket | undefined;
    const orgId = "7a890dc5-e9d2-4764-b7f4-6ce5f159f8c7";
    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "bearer",
        token: "ws_test_123"
      },
      socketFactory: ({ baseUrl, path, auth }) => {
        socket = new FakeRealtimeSocket(baseUrl, { path, auth });
        return socket;
      }
    });

    const subscription = client.subscribeQueue(orgId, {
      onEvent: vi.fn()
    });

    expect(socket?.emitted).toEqual([
      {
        event: "subscribe:queue",
        payload: {
          org_id: orgId
        }
      }
    ]);

    socket?.dispatch("connect");
    socket?.disconnect();
    socket?.connect();
    socket?.dispatch("connect");

    expect(socket?.emitted).toEqual([
      {
        event: "subscribe:queue",
        payload: {
          org_id: orgId
        }
      },
      {
        event: "subscribe:queue",
        payload: {
          org_id: orgId
        }
      }
    ]);

    subscription.unsubscribe();
  });

  it("does not double-subscribe channels added while the socket is disconnected", () => {
    let socket: FakeRealtimeSocket | undefined;
    const firstOrgId = "7a890dc5-e9d2-4764-b7f4-6ce5f159f8c7";
    const secondOrgId = "d8a1e8af-cbe6-4eec-b4c0-f38e7d3bbef4";
    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "bearer",
        token: "ws_test_123"
      },
      socketFactory: ({ baseUrl, path, auth }) => {
        socket = new FakeRealtimeSocket(baseUrl, { path, auth });
        return socket;
      }
    });

    const firstSubscription = client.subscribeQueue(firstOrgId, {
      onEvent: vi.fn()
    });

    socket?.dispatch("connect");
    socket?.disconnect();

    const secondSubscription = client.subscribeQueue(secondOrgId, {
      onEvent: vi.fn()
    });

    expect(socket?.emitted).toEqual([
      {
        event: "subscribe:queue",
        payload: {
          org_id: firstOrgId
        }
      }
    ]);

    socket?.connect();
    socket?.dispatch("connect");

    expect(socket?.emitted).toEqual([
      {
        event: "subscribe:queue",
        payload: {
          org_id: firstOrgId
        }
      },
      {
        event: "subscribe:queue",
        payload: {
          org_id: firstOrgId
        }
      },
      {
        event: "subscribe:queue",
        payload: {
          org_id: secondOrgId
        }
      }
    ]);

    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it("reconnects with only remaining channels after unsubscribing one channel", () => {
    const sockets: FakeRealtimeSocket[] = [];
    const firstOrgId = "7a890dc5-e9d2-4764-b7f4-6ce5f159f8c7";
    const secondOrgId = "d8a1e8af-cbe6-4eec-b4c0-f38e7d3bbef4";
    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "bearer",
        token: "ws_test_123"
      },
      socketFactory: ({ baseUrl, path, auth }) => {
        const socket = new FakeRealtimeSocket(baseUrl, { path, auth });
        sockets.push(socket);
        return socket;
      }
    });

    const firstSubscription = client.subscribeQueue(firstOrgId, {
      onEvent: vi.fn()
    });
    const secondSubscription = client.subscribeQueue(secondOrgId, {
      onEvent: vi.fn()
    });

    expect(sockets).toHaveLength(1);
    sockets[0]?.dispatch("connect");

    firstSubscription.unsubscribe();

    expect(sockets).toHaveLength(2);
    expect(sockets[0]?.connected).toBe(false);
    expect(sockets[1]?.emitted).toEqual([]);

    sockets[1]?.dispatch("connect");

    expect(sockets[1]?.emitted).toEqual([
      {
        event: "subscribe:queue",
        payload: {
          org_id: secondOrgId
        }
      }
    ]);

    secondSubscription.unsubscribe();
    expect(sockets[1]?.connected).toBe(false);
  });

  it("validates explicit realtime auth and identifiers", () => {
    expect(() =>
      createRealtimeClient("https://control.example.com", {
        auth: {
          kind: "bearer",
          token: "   "
        }
      })
    ).toThrow(GlobiguardRealtimeConfigError);

    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "apiKey",
        token: "gg_admin_test"
      },
      path: "/ws"
    });

    expect(() =>
      client.subscribeWorkflow("not-a-uuid", {
        onEvent: vi.fn()
      })
    ).toThrow(GlobiguardRealtimeConfigError);
  });

  it("subscribes to governed-action decision updates by authorization id", () => {
    let socket: FakeRealtimeSocket | undefined;
    const client = createRealtimeClient("https://control.example.com", {
      auth: {
        kind: "bearer",
        token: "ws_test_123"
      },
      socketFactory: ({ baseUrl, path, auth }) => {
        socket = new FakeRealtimeSocket(baseUrl, { path, auth });
        return socket;
      }
    });

    const events: unknown[] = [];
    const subscription = client.subscribeDecision("auth_123", {
      onEvent: (event) => events.push(event)
    });

    expect(socket?.emitted).toContainEqual({
      event: "subscribe:decision",
      payload: {
        authorization_id: "auth_123"
      }
    });

    socket?.dispatch("event", {
      channel: "decision:auth_123",
      data: {
        decision: "ALLOW"
      }
    });

    expect(events).toEqual([
      {
        channel: "decision:auth_123",
        data: {
          decision: "ALLOW"
        }
      }
    ]);

    subscription.unsubscribe();
  });
});
