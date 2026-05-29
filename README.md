# GlobiGuard Open

Open distribution-layer monorepo for GlobiGuard SDKs, React bindings, shared
contracts, and workflow-native integrations.

## Why this repo exists

GlobiGuard governs high-risk AI actions: policy decisions, human approval,
audit evidence, deployment identity, and trust-boundary enforcement.

This repository publishes the SDKs, React bindings, shared types, and workflow
integrations that connect applications and automation platforms to those
server-side controls.

## Packages

- `@globiguard/contracts` - action, approval, evidence, audit, workflow, and shared cross-package types
- `@globiguard/sdk` - server-first TypeScript SDK for action authorization, approvals, evidence, control-plane resources, and sidecar/gateway action routing
- `@globiguard/realtime` - optional websocket client for queue, workflow, transparency, and governed-action decision subscriptions
- `@globiguard/react` - browser-safe React provider, approval/evidence hooks, and governed-action UI helpers that submit through caller-owned server endpoints
- `n8n-nodes-globiguard` - public-ready n8n community-node package with install registration and Governance Checkpoint operation before risky workflow actions

## Ecosystem repositories

`globiguard-open` is the TypeScript/npm home. Other language SDKs live in
separate public repositories under the same GitHub organization and are tracked
in [`ecosystem/repositories.json`](./ecosystem/repositories.json).

| Language | Repository | Local umbrella path |
| --- | --- | --- |
| TypeScript / npm | [`globiguard-open`](https://github.com/globiguard/globiguard-open) | `D:\Dev\globiguard-libraries\typescript\globiguard-open` |
| JavaScript / vanilla | [`globiguard-js`](https://github.com/globiguard/globiguard-js) | `D:\Dev\globiguard-libraries\javascript\globiguard-js` |
| Python | [`globiguard-python`](https://github.com/globiguard/globiguard-python) | `D:\Dev\globiguard-libraries\python\globiguard-python` |
| Go | [`globiguard-go`](https://github.com/globiguard/globiguard-go) | `D:\Dev\globiguard-libraries\go\globiguard-go` |
| .NET | [`globiguard-dotnet`](https://github.com/globiguard/globiguard-dotnet) | `D:\Dev\globiguard-libraries\dotnet\globiguard-dotnet` |
| Java | [`globiguard-java`](https://github.com/globiguard/globiguard-java) | `D:\Dev\globiguard-libraries\java\globiguard-java` |
| PHP | [`globiguard-php`](https://github.com/globiguard/globiguard-php) | `D:\Dev\globiguard-libraries\php\globiguard-php` |
| Ruby | [`globiguard-ruby`](https://github.com/globiguard/globiguard-ruby) | `D:\Dev\globiguard-libraries\ruby\globiguard-ruby` |

## Connection model

The packages connect to GlobiGuard through the control plane and, for trusted
server-side runtimes, optional decision-engine endpoints:

| Surface | Control plane | Decision engine | Notes |
| --- | --- | --- | --- |
| SDK (server) | Direct | Optional direct | Trusted backends can authorize actions and create approvals; action calls may route through configured sidecar/gateway origins |
| SDK (browser) | Direct reads only | Never direct | Browser clients can read action/approval/evidence status but cannot authorize, approve, resume, or bypass |
| React | Browser reads + caller-owned server submitters | Never direct from browser | Governed-action components call an app-provided submitter rather than gaining client-side authority |
| n8n nodes | Direct via server SDK | Optional direct | Server-side Governance Checkpoint gates email, CRM, Slack, webhook, database, and ticket actions |

Server-held credentials, approval authority, resume/bypass controls, webhook
signing secrets, and evidence exports must stay in trusted backends or trusted
workflow runtimes. Browser and React surfaces can show status, approvals, and
evidence links, but they do not own the authority to approve, resume, bypass, or
verify webhooks.

## Standards

1. The main `globiguard` repo owns the canonical machine-readable public spec.
2. This repo consumes that spec through shared contracts instead of inventing a
   parallel API.
3. `local`, `sandbox`, and `live` are explicit environments.
4. Packages ship in lockstep so the SDK, React bindings, contracts, and n8n node
   stay compatible.

## Current package scope

The current release focuses on governed-action integrations and public
control-plane resource types.

- `@globiguard/contracts` holds cross-package invariants such as
  decisions, action contexts, destination systems, data classes, approval states, evidence references, environment identity, credential shape, service targeting, and the current control-plane resource shapes for installs, audit, queue, workflows, policies, org management, and realtime subscription envelopes.
- The public type surface is synchronized with the live control-plane code in
  the main `globiguard` repository.
- `n8n-nodes-globiguard` provides install registration and a Governance
  Checkpoint operation for high-risk workflow actions.

## Examples and package docs

- [`packages/contracts/README.md`](./packages/contracts/README.md) - shared type
  contracts.
- [`packages/sdk/README.md`](./packages/sdk/README.md) - server and browser SDK
  usage boundaries.
- `@globiguard/realtime` - optional websocket subscription package used by
  realtime-capable examples and apps.
- [`packages/react/README.md`](./packages/react/README.md) - browser-safe React
  bindings.
- [`packages/n8n-nodes-globiguard/README.md`](./packages/n8n-nodes-globiguard/README.md)
  - n8n community node usage and credential rules.
- `examples/react-simple` - runnable example app
- `examples/n8n` - n8n workflow templates with tokenized/sample data
