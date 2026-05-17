# @globiguard/sdk

Server-first TypeScript SDK for the GlobiGuard control plane and trusted
decision-engine connectivity.

## Runtime expectations

- Node.js **22+** for server usage
- standards-based `fetch`, `Headers`, `FormData`, and `Blob` support
- browser usage is supported only through the browser-safe client surface

## Trust-boundary rule

`createBrowserClient()` stops at the control plane.

Direct decision-engine access is reserved for `createServerClient()` in trusted
runtimes using secret or local credentials.

## Surface split

- Browser-safe control-plane access: action authorization status, approval status,
  evidence references/summaries, incident replay metadata, install
  registration/heartbeat plus audit, policy, queue, workflow reads, and optional
  realtime subscriptions when an explicit websocket bearer/API-key handshake is
  provided
- Trusted server management: governed action authorization, approval creation,
  approval wait/polling, queue approvals, workflow management/runs, policy
  management, org management, API-key administration, audit evidence exports,
  incident replay lookup, and trust webhook verification through
  `@globiguard/sdk/server`
- Realtime subscriptions use the control-plane websocket gateway and are
  intentionally configured separately from REST publishable/secret credentials
  because the websocket handshake trusts bearer/API-key auth, not the browser
  publishable-key header model
- Audit evidence exports return a typed evidence-package artifact with requested
  scope, control mappings, provenance references, review history, and summary
  metadata aligned to the live control-plane export shape

## Governed action quickstart

Authorize actions only from a trusted runtime:

```ts
const decision = await serverClient.governedActions.authorizeAction({
  context: {
    actionType: "email.send",
    destination: { type: "email", name: "customer-email" },
    dataClasses: ["PII"],
    payloadSummary: { topLevelKeys: ["recipient", "body"] },
    idempotencyKey: "claim-123:email-status"
  }
});

if (decision.decision === "ALLOW" || decision.decision === "MODIFY") {
  await sendClaimStatusEmail();
}
```

Use a stable persisted idempotency key. A fresh random key per retry can
duplicate queued/resumed business actions.

Use `actionGateway: { mode: "sidecar" }` with `services.sidecar`, or `mode: "gateway"` with `services.gateway`, to route authorization through a local sidecar or governed gateway. Browser clients expose only `client.actions.getAuthorization()`, `getApproval()`, evidence reads, and incident replay metadata.

## Webhook verification

```ts
import { verifyTrustWebhook } from "@globiguard/sdk/server";

const verification = await verifyTrustWebhook({
  headers,
  rawBody,
  signingSecret,
  seenDelivery: async (deliveryId) => alreadyProcessed(deliveryId)
});
```

The verifier checks signature, timestamp, event type, delivery ID, replay window,
and optional duplicate delivery state. It fails fast in browser runtimes.

Compatibility: governed-action payloads use contract version
`2026-04-action-beta` and require a GlobiGuard control plane or action gateway
that implements the same version.
