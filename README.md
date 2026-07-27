# GlobiGuard Open

Open distribution-layer monorepo for GlobiGuard SDKs, MCP server, React bindings, shared
contracts, and workflow-native integrations.

## For AI agents

GlobiGuard governs AI agent actions. Agents call GlobiGuard before executing
high-risk operations — the server returns ALLOW, BLOCK, MODIFY, or QUEUE
based on active policies, with full audit evidence.

### MCP server (Claude, Cursor, Windsurf, Cline, ...)

```json
{
  "mcpServers": {
    "globiguard": {
      "command": "npx",
      "args": ["-y", "@globiguard/mcp-server", "authority"],
      "env": {
        "GLOBIGUARD_PROJECT_ID": "project_...",
        "GLOBIGUARD_SECRET_KEY": "ggsk_...",
        "GLOBIGUARD_ENVIRONMENT": "sandbox"
      }
    }
  }
}
```

Get credentials at [globiguard.com](https://globiguard.com). MCP schema: [`packages/mcp-server/server.json`](./packages/mcp-server/server.json).

## Why this repo exists

GlobiGuard governs high-risk AI actions: policy decisions, human approval,
audit evidence, deployment identity, and trust-boundary enforcement.

This repository publishes the SDKs, MCP server, React bindings, shared types,
and workflow integrations that connect applications and automation platforms to
those server-side controls.

## Packages

- `@globiguard/mcp-server` — MCP authority server for AI agents; governed tool gateway that proxies any MCP server through GlobiGuard policies
- `@globiguard/contracts` - action, approval, evidence, audit, workflow, and shared cross-package types
- `@globiguard/sdk` - server-first TypeScript SDK for action authorization, approvals, evidence, control-plane resources, and sidecar/gateway action routing
- `@globiguard/realtime` - optional websocket client for queue, workflow, transparency, and governed-action decision subscriptions
- `@globiguard/react` - browser-safe React provider, approval/evidence hooks, and governed-action UI helpers that submit through caller-owned server endpoints
- `n8n-nodes-globiguard` - n8n community node package with Governance Checkpoint before risky workflow actions

## Ecosystem repositories

`globiguard-open` is the TypeScript/npm home. Other language SDKs live in
separate public repositories under the same GitHub organization and are tracked
in [`ecosystem/repositories.json`](./ecosystem/repositories.json).

| Language | Repository |
| --- | --- |
| TypeScript / npm | [`globiguard-open`](https://github.com/globiguard/globiguard-open) |
| JavaScript / vanilla | [`globiguard-js`](https://github.com/globiguard/globiguard-js) |
| Python | [`globiguard-python`](https://github.com/globiguard/globiguard-python) |
| Go | [`globiguard-go`](https://github.com/globiguard/globiguard-go) |
| .NET | [`globiguard-dotnet`](https://github.com/globiguard/globiguard-dotnet) |
| Java | [`globiguard-java`](https://github.com/globiguard/globiguard-java) |
| PHP | [`globiguard-php`](https://github.com/globiguard/globiguard-php) |
| Ruby | [`globiguard-ruby`](https://github.com/globiguard/globiguard-ruby) |

## Connection model

The packages connect to GlobiGuard through the control plane and, for trusted
server-side runtimes, optional decision-engine endpoints:

| Surface | Control plane | Decision engine | Notes |
| --- | --- | --- | --- |
| MCP server | Direct | Optional direct | Agents govern actions and retrieve evidence; gateway wraps any downstream MCP server |
| SDK (server) | Direct | Optional direct | Trusted backends can authorize actions and create approvals |
| SDK (browser) | Direct reads only | Never direct | Browser clients can read action/approval/evidence status but cannot authorize, approve, resume, or bypass |
| React | Browser reads + caller-owned server submitters | Never direct from browser | Governed-action components call an app-provided submitter |
| n8n nodes | Direct via server SDK | Optional direct | Server-side Governance Checkpoint gates email, CRM, Slack, webhook, database, and ticket actions |

Server-held credentials, approval authority, resume/bypass controls, webhook
signing secrets, and evidence exports must stay in trusted backends or trusted
workflow runtimes.

## Standards

1. The main `globiguard` repo owns the canonical machine-readable public spec.
2. This repo consumes that spec through shared contracts instead of inventing a
   parallel API.
3. `local`, `sandbox`, and `live` are explicit environments.
4. Packages ship in lockstep so the SDK, React bindings, contracts, and n8n node
   stay compatible.

## Examples and package docs

- [`packages/mcp-server/README.md`](./packages/mcp-server/README.md) - MCP authority server and governed gateway docs.
- [`packages/contracts/README.md`](./packages/contracts/README.md) - shared type contracts.
- [`packages/sdk/README.md`](./packages/sdk/README.md) - server and browser SDK usage boundaries.
- [`packages/react/README.md`](./packages/react/README.md) - browser-safe React bindings.
- [`packages/n8n-nodes-globiguard/README.md`](./packages/n8n-nodes-globiguard/README.md) - n8n community node usage and credential rules.
- `examples/react-simple` - runnable example app
- `examples/n8n` - n8n workflow templates with tokenized/sample data
