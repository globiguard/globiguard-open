# @globiguard/react

Browser-safe React bindings for GlobiGuard governance state.

## Dependency posture

`@globiguard/react` intentionally does not depend on UI kits, icon packs,
classnames helpers, date libraries, Tailwind runtime helpers, Radix primitives,
or CSS-in-JS packages. The styled surface is built locally with scoped CSS
classes, `data-globiguard-*` attributes, and CSS custom properties so host apps
can audit and override every visual layer.

## Boundary

React never owns approval, resume, bypass, webhook-signing, or secret-key
authority. Components display decisions, approval status, evidence summaries, and
incident replay metadata returned by the browser-safe SDK or by caller-owned
server endpoints.

## Styling and theming

`GlobiguardProvider` injects the default scoped stylesheet. Apps with strict CSPs
can pass `styleNonce`, render `GlobiguardStyleSheet` once near the app root, or
turn provider injection off with `styles="none"`.

```tsx
import {
  GlobiguardProvider,
  GlobiguardStyleSheet,
  createGlobiguardThemeStyle
} from "@globiguard/react";

<GlobiguardStyleSheet nonce={nonce} />;

<GlobiguardProvider
  client={client}
  styles="none"
  theme="system"
  style={createGlobiguardThemeStyle({
    accent: "#7c3aed",
    radius: "1rem",
    fontFamily: "Inter, sans-serif"
  })}
>
  <App />
</GlobiguardProvider>;
```

All visual components accept `className` and `style`. Stateful components keep
their semantic `data-globiguard-*` attributes even when you customize classes,
so automated tests and host-app styles can target governance state reliably.

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

The default layout is responsive without media-query dependencies: cards use
auto-fit grids, timelines collapse naturally, badges wrap on narrow screens, and
all selectors are scoped to GlobiGuard classes/data attributes.

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
