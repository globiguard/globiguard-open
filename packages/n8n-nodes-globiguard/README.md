# n8n-nodes-globiguard

n8n community-node package for GlobiGuard governance, AI oversight, and observability.

## Nodes

| Node | Purpose |
| --- | --- |
| **GlobiGuard** | Governance checkpoint before any action (email, CRM, Slack, database, webhook, etc.) |
| **GlobiGuardDetect** | Scan text for sensitive entities and PII before it reaches AI models or external services |
| **GlobiGuardAiAgent** | Governed AI agent: scans input, governs every tool call, scans output, and captures evidence |
| **GlobiGuardObserve** | Query scan evidence, governance traces, and metrics from inside a workflow using your API token |

## Install

In n8n: **Settings → Community Nodes → Install** → enter `n8n-nodes-globiguard`.

## GlobiGuardDetect

Scans a text field for sensitive entities before it reaches an AI model, database, or external service. Routes items with detected entities to the **detected** output and clean items to the **clean** output. Supports redaction strategies: none, mask, replace, drop.

```
[HTTP Request] → [GlobiGuardDetect] → detected → [Stop / Alert]
                                    → clean    → [AI Model]
```

## GlobiGuardAiAgent

A governed AI agent node. Connects to any n8n-compatible AI model via the **AI Model** sub-input. On each item:
1. Scans the user message with Brain
2. Runs a governance checkpoint (routes to **blocked** or **awaiting_approval** if sensitive)
3. Calls the AI model
4. Governs tool calls if tools are connected
5. Scans the AI response

Outputs: **completed**, **blocked**, **awaiting_approval**, **error**.

## GlobiGuardObserve

Queries the GlobiGuard observability API from inside a workflow. Use this to build audit dashboards, compliance reports, or alert workflows triggered by governance metrics.

| Operation | Description |
| --- | --- |
| Get Dashboard | Summary metrics and activity |
| Get Traces | List governance traces with optional from/to/correlationId filters |
| Get Trace | Single trace by ID |
| Get Evidence Detail | Full evidence package by ID |
| Get Metrics | Aggregated governance metrics for a time window |

```
[Schedule Trigger] → [GlobiGuardObserve (Get Metrics)] → [IF block_rate > 0.1] → [Slack Alert]
```

## Included capabilities

- TypeScript source and shipped CJS credential definitions
- **Register Install**, **Governance Checkpoint**, **Wait for
  Approval**, **Export Evidence Package**, **Incident Replay Lookup**, and
  **Verify GlobiGuard Webhook** operations
- Runtime, install-identity, and credential rules aligned with the
  shared SDK/bootstrap contract
- n8n manifest wiring with generated bundled CJS runtime artifacts in `dist/`
- Custom GlobiGuard SVG node icon
- Importable starter workflow templates under `examples/n8n/`
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

The node sends a metadata-safe payload summary to `/v1/actions/authorize`
using the server credential. It annotates items with `json.globiguard` and
routes every item to exactly one decision output by default. Connect only the
ALLOW output to the unmodified business action. Connect MODIFY to a payload
rebuild and fresh authorization step, QUEUE to Wait for Approval, and BLOCK to
an explicit stopped path. Optional fail-fast modes can turn BLOCK, or BLOCK and
QUEUE, into a node error when a workflow requires exception semantics.

The node has separate branch outputs for allow, modified, blocked, queued, and
error visibility. Do not wire blocked or unresolved queued branches to the same
business-action node unless you are intentionally testing an unsafe override.

## One-click starter workflow

Install the community node in n8n with package name `n8n-nodes-globiguard`, then
import the starter workflow from the GitHub raw URL:

```text
https://raw.githubusercontent.com/globiguard/globiguard-open/main/examples/n8n/globiguard-governed-email-starter.json
```

In n8n, use **Import from URL** or download the JSON and use **Import from
File**. The template wires a Manual Trigger into a GlobiGuard Governance
Checkpoint, routes ALLOW decisions to a downstream action placeholder, routes
QUEUE decisions to Wait for Approval, and keeps BLOCK decisions isolated.

## Approval, evidence, replay, and webhooks

- **Wait for Approval** polls the queue entry, accepts approved, auto-approved,
  or resumed state, continues through escalated review, and fails closed on
  rejected, expired, failed, modified-without-reauthorization, still-pending,
  unknown, or unavailable state.
- **Export Evidence Package** returns evidence package identifiers, checksums,
  summaries, and descriptors; large artifacts should be handled through
  metadata-safe pointers.
- **Incident Replay Lookup** returns the replay timeline and explicit gaps.
- **Verify GlobiGuard Webhook** checks signature, timestamp, delivery ID, event
  type, replay window, and the credential-scoped webhook signing secret before a
  workflow consumes approval/evidence events.

Sample workflow templates live under `examples/n8n/`.

Compatibility: action checkpoint payloads use contract version
`2026-04-action-beta` and require a compatible GlobiGuard control plane or
action gateway. Browser/publishable credentials are never valid in n8n.
