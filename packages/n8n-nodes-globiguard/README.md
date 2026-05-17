# n8n-nodes-globiguard

n8n community-node package for GlobiGuard install registration and
governed-action checkpoints.

## Included capabilities

- TypeScript source and shipped CJS credential definitions
- **Register Install**, **Governance Checkpoint**, **Wait for
  Approval**, **Export Evidence Package**, **Incident Replay Lookup**, and
  **Verify GlobiGuard Webhook** operations
- Runtime, install-identity, and credential rules aligned with the
  shared SDK/bootstrap contract
- n8n manifest wiring and source-authored CJS runtime artifacts copied into
  `dist/` on build
- Node.js `>=22`

## Runtime contract

- n8n is **server-side only**
- n8n is **control-plane-first** by default
- direct decision-engine access is **optional and explicit**
- install registration and heartbeat reuse the shared bootstrap profile contract
- the primary node surface is **Governance Checkpoint**, placed before risky email, CRM, Slack, webhook, database, or ticket nodes

## Credential policy

- allowed credential kinds:
  - `secret` in `sandbox` and `live`
  - `local` only in `local`
- Browser/publishable credentials are not supported
- hosted deployments require `globiguard_issued` bootstrap identity
- self-hosted and sovereign deployments require `customer_issued` bootstrap
  identity
- self-hosted and sovereign deployments must choose install reporting explicitly:
  `opt_in` or `disabled`
- webhook signing secrets are separate from API tokens and are used only by the
  Verify GlobiGuard Webhook operation

## Connection defaults

| Surface | Default | Optional |
| --- | --- | --- |
| Control plane | required | no |
| Decision engine | off | yes, only with trusted endpoint + matching secret/local credential |

## Entrypoint note

The root package import stays ESM-first for the helper/runtime surface, while
the n8n package manifest points n8n itself at the built `dist/**/*.cjs`
artifacts. The TypeScript and CJS node surfaces are both kept
aligned to the shared bootstrap helpers for:

- runtime creation
- credential-policy enforcement
- install registration
- optional heartbeat emission

## Governance Checkpoint

Place GlobiGuard immediately before the real action node and choose the matching governed action:

| Downstream action | Governed action | Destination type |
| --- | --- | --- |
| Email Send | `email.send` | `email` |
| CRM Update | `crm.update` | `crm` |
| Slack Post | `slack.post` | `slack` |
| Webhook Call | `webhook.call` | `webhook` |
| Database Write | `database.write` | `database` |
| Ticket Creation | `ticket.create` | `ticketing` |

The node sends a metadata-safe payload summary to `/v1/actions/authorize` using the server credential. It annotates items with `json.globiguard` and, by default, stops `BLOCK` and `QUEUE` decisions before downstream action nodes run. Use **Annotate Only** only for dry runs or migrations.

The node has separate branch outputs for allow, modified, blocked, queued, and
error visibility. Do not wire blocked or unresolved queued branches to the same
business-action node unless you are intentionally testing an unsafe override.

## Approval, evidence, replay, and webhooks

- **Wait for Approval** polls the queue entry and fails closed on rejected,
  expired, still-pending, or unavailable state.
- **Export Evidence Package** returns evidence package identifiers, checksums,
  summaries, and descriptors; large artifacts should be handled through
  metadata-safe pointers.
- **Incident Replay Lookup** returns the replay timeline and explicit gaps.
- **Verify GlobiGuard Webhook** checks signature, timestamp, delivery ID, event
  type, replay window, and the credential-scoped webhook signing secret before a
  workflow consumes approval/evidence events.

The sample insurance workflow template lives under `examples/n8n/`.

Compatibility: action checkpoint payloads use contract version
`2026-04-action-beta` and require a compatible GlobiGuard control plane or
action gateway. Browser/publishable credentials are never valid in n8n.
