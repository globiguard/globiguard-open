# @globiguard/contracts

This package contains the shared public TypeScript contracts used by the
GlobiGuard SDK, React bindings, and workflow integrations.

## Current scope

This package defines the public type surface used by the packages in this
repository:

- action authorization, approval state, evidence reference, destination system, and data-class contracts
- decision enums
- environment identity
- credential shapes
- service target shape, including optional action sidecar/gateway targets
- install registration and heartbeat shapes
- audit event and evidence export shapes
- queue entry, lookup, and approval decision shapes
- metadata-safe evidence package summaries with checksums, source refs, redaction
  mode, and artifact delivery hints
- versioned incident replay timelines with explicit missing/redacted/unverified
  segments
- trust webhook envelopes, signature header names, delivery IDs, timestamps, and
  replay-window verification inputs
- authority-boundary markers that distinguish browser-readable display contracts
  from server-secret authority contracts
- workflow management and run shapes
- realtime subscription auth, channel, and event-envelope shapes
- policy management shapes
- org and API-key management shapes

The canonical machine-readable API specification remains owned by the main
`globiguard` repository. This package exposes the supported contracts required
by the open SDKs and integrations.

## Authority boundaries

Browser-safe contracts use `GLOBIGUARD_BROWSER_READ_BOUNDARY`; they are metadata
surfaces for status, summaries, evidence links, and replay timelines. They never
include server secrets, approval/resume authority, bypass controls, or raw
customer payloads.

Server-authority contracts use `GLOBIGUARD_SERVER_AUTHORITY_BOUNDARY`; SDKs and
integrations must keep those behind server-only package entrypoints and runtime
guards. Trust webhook verification signs the canonical body plus delivery ID,
event type, and timestamp, then receivers enforce a replay window and duplicate
delivery detection.
