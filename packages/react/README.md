# @globiguard/react

Browser-safe React bindings for GlobiGuard governance state.

## Boundary

React never owns approval, resume, bypass, webhook-signing, or secret-key
authority. Components display decisions, approval status, evidence summaries, and
incident replay metadata returned by the browser-safe SDK or by caller-owned
server endpoints.

## Components

- `PolicyDecisionBadge`
- `ApprovalStatusCard`
- `EvidencePackageSummary`
- `IncidentReplayTimeline`
- `GovernedActionBoundary`
- `QueuedActionNotice`
- `GovernedActionSubmitButton`

`GovernedActionBoundary` fails closed on missing decisions, loading failures,
stale state, unresolved queue state, and blocked decisions. It renders protected
children only for `ALLOW`.

## Hooks

- `useActionDecision`
- `useApprovalStatus`
- `useEvidenceRefs`
- `useEvidencePackage`
- `useIncidentReplay`
- `useTrustWebhookVerificationResult`

Webhook verification results should be produced by server code using
`@globiguard/sdk/server`; React can display the result but must not verify
signing secrets itself.

