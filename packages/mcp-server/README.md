# GlobiGuard MCP Authority

<!-- mcp-name: io.github.globiguard/authority -->

`@globiguard/mcp-server` makes GlobiGuard an execution authority for AI
agents. It is deliberately two products in one package:

- **Authority server:** agents can govern intended actions, inspect active
  policies, retrieve decisions, track approvals, and inspect metadata-safe
  evidence and incident timelines.
- **Governed tool gateway:** mirrors another MCP server's tools and owns the
  downstream connection. The exact tool call is forwarded only after an
  `ALLOW` decision.

The gateway is the enforcement boundary. A voluntary `check_action` call is
useful for planning, but it cannot prevent an agent from calling an ungoverned
tool directly.

## Decision contract

Every action decision is translated into one stable, agent-oriented result:

| Policy decision | Outcome   | Downstream side effect                  | Next action                   |
| --------------- | --------- | --------------------------------------- | ----------------------------- |
| `ALLOW`         | `proceed` | Allowed for the exact current arguments | Execute now                   |
| `MODIFY`        | `revise`  | Never called                            | Apply changes and reauthorize |
| `QUEUE`         | `wait`    | Never called                            | Check approval                |
| `BLOCK`         | `stop`    | Never called                            | Do not execute                |

Policy stops are normal MCP tool results, not transport errors. This prevents
clients from blindly retrying a blocked action. Connectivity, validation, or
downstream failures use `isError: true`.

Approval alone is not an execution permit. An approved action must be
reauthorized against its current arguments before it can run.

An `ALLOW` that still carries generic string obligations also does not execute.
The gateway cannot safely turn human-readable obligations into code. A future
or deployment-specific typed handler must enforce each obligation before a new
authorization can proceed.

## Quick start: authority server

Set server credentials in the MCP client's environment:

```text
GLOBIGUARD_PROJECT_ID=project_...
GLOBIGUARD_SECRET_KEY=ggsk_...
GLOBIGUARD_ENVIRONMENT=sandbox
GLOBIGUARD_REQUEST_TIMEOUT_MS=10000
```

Authority calls fail closed on caller cancellation or the bounded request
deadline. The default is 10 seconds; values must be 1–300000 milliseconds.

Then configure a stdio MCP server:

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

`GLOBIGUARD_CONTROL_PLANE_URL` is optional. Hosted sandbox and live
environments default to `https://api.globiguard.com`; local defaults to
`http://127.0.0.1:3000`.

### Authority tools

- `globiguard_govern_action`
- `globiguard_get_authorization`
- `globiguard_check_approval`
- `globiguard_get_evidence`
- `globiguard_get_audit_event`
- `globiguard_get_evidence_package_summary`
- `globiguard_get_incident_replay`
- `globiguard_list_active_policies`
- `globiguard_get_policy`

Active policies are also exposed as `globiguard://policies/{policyId}` MCP
resources.

## Quick start: governed gateway

Create a gateway configuration. This file contains policy metadata and the
downstream command, never GlobiGuard credentials:

```json
{
  "serverName": "github",
  "connectorInstanceId": "github-production",
  "connectorManifestVersion": "github-governance-v1",
  "namespace": "github",
  "downstream": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "passEnvironment": ["GITHUB_TOKEN"]
  },
  "actor": {
    "id": "repo-maintainer-agent",
    "type": "agent"
  },
  "defaults": {
    "purpose": "Maintain approved repositories",
    "dataClasses": ["INTERNAL"],
    "destination": {
      "type": "custom",
      "name": "github"
    }
  },
  "tools": {
    "create_issue": {
      "actionType": "github.issue.create",
      "riskScore": 0.6,
      "consequence": "medium"
    },
    "delete_repository": {
      "enabled": false
    }
  },
  "executionLedger": {
    "mode": "file",
    "directory": "/var/lib/globiguard/execution-ledger",
    "maxEntries": 100000
  }
}
```

Configure the agent with only the gateway:

```json
{
  "mcpServers": {
    "governed-github": {
      "command": "npx",
      "args": [
        "-y",
        "@globiguard/mcp-server",
        "gateway",
        "--config",
        "/absolute/path/globiguard-github.gateway.json"
      ],
      "env": {
        "GLOBIGUARD_PROJECT_ID": "project_...",
        "GLOBIGUARD_SECRET_KEY": "sk_...",
        "GLOBIGUARD_ENVIRONMENT": "sandbox",
        "GITHUB_TOKEN": "github_pat_..."
      }
    }
  }
}
```

Do **not** also configure the original GitHub MCP server in the same client.
Doing so creates an ungoverned bypass path.

The gateway:

1. discovers and namespaces downstream tools;
2. canonicalizes and hashes the exact arguments locally;
3. binds authorization to the configured downstream connection, mapping
   version, and digests of discovered tool schemas/capability facts;
4. sends structural metadata—not raw argument values—to GlobiGuard;
5. forwards the unchanged arguments only after `ALLOW`;
6. attaches authorization and evidence references in MCP `_meta`;
7. fails closed on authority errors, expired authorization, or argument
   substitution.
8. atomically consumes an execution key before the downstream call and records
   its outcome in a restart-safe filesystem ledger;
9. bounds downstream tool discovery and suppresses oversized results without
   making the consumed execution retryable.

`connectorInstanceId` identifies the configured downstream connection;
`connectorManifestVersion` identifies the operator-reviewed governance mapping.
The gateway also derives a metadata-only schema snapshot containing input and
output schema digests, selected MCP annotations, consequence class, action
type, and idempotency binding. The snapshot and its digest are part of the
exact authorization material. Tool descriptions and argument values are not
included.

`idempotencyKeyArgument` is an operator assertion that a named downstream
argument is implemented by that downstream system as one logical side-effect
key. The argument must exist in the discovered input schema. The gateway hashes
the value before sending it to GlobiGuard and binds it to the full argument
digest. Reusing the key with changed arguments fails closed. Tools classified
as `consequence: "high"` cannot be exposed without this downstream-native key.

Outside `GLOBIGUARD_ENVIRONMENT=local`, `executionLedger.mode` must be `file`.
Atomic directory creation consumes a key before execution and an atomic outcome
record follows completion. A crash between those operations leaves the key
consumed with unknown outcome, so restart never causes an automatic replay.
Ledger entries are intentionally not expired automatically: operators may
archive them only when the downstream side effect can no longer be repeated.
`mode: "memory"` is restricted to local development and is never restart-safe.

Downstream environment variables are not inherited wholesale. Only names
listed in `downstream.passEnvironment` are copied into the child process.
Tool discovery is limited to `maxDiscoveredTools` (1,000 by default), and
serialized downstream results are limited by `maxDownstreamResultBytes`
(8 MiB by default). The limiter counts a result incrementally and stops at the
bound instead of serializing a second unbounded copy in memory.

The gateway also exposes `globiguard_check_approval` and
`globiguard_reauthorize_action`. Status checks are read-only and always return
`canExecute: false`. Reauthorization requires the queue entry to match the
current action type, destination name, policy when configured, and exact
argument digest. It then sends the control plane's explicit
`approvalQueueEntryId` continuation binding with the complete current action
context and obtains a fresh, bounded authorization immediately before the
governed call. The partial local match is not a permit, and approval resolution
alone never calls a downstream tool.
Human-entered review notes are not returned to agents; the status envelope
reports only whether notes are present.

An `ALLOW` is executable only when its runtime response explicitly contains
`executable: true` and `nextAction: EXECUTE_EXACT_ACTION_ONCE`, is structurally valid,
expires within five minutes, has approval state `NOT_REQUIRED` or `APPROVED`,
and contains neither unresolved obligations nor unapplied modifications.
Malformed or unknown decision and approval states fail closed.

## Streamable HTTP gateway

`gateway-http` exposes governed tools to server-side MCP clients such as n8n
while retaining the same downstream ownership:

```bash
export GLOBIGUARD_MCP_BEARER_TOKEN="$(openssl rand -hex 32)"
npx @globiguard/mcp-server gateway-http \
  --config /absolute/path/globiguard-github.gateway.json
```

Add an `http` section to the gateway file:

```json
{
  "http": {
    "host": "127.0.0.1",
    "port": 3001,
    "path": "/mcp",
    "bearerTokenEnvironment": "GLOBIGUARD_MCP_BEARER_TOKEN",
    "allowedHosts": ["mcp.example.com"],
    "allowedOrigins": [],
    "maxBodyBytes": 2097152,
    "maxSessions": 100,
    "sessionTtlMs": 86400000,
    "requestsPerMinute": 600,
    "tlsTerminatedByProxy": false
  }
}
```

The HTTP server requires a bearer token of at least 32 characters, exact Host
allowlisting, Origin rejection unless explicitly allowed, bounded request
bodies, bounded stateful sessions, idle-session expiry, and per-address rate
limits. Authenticated and unauthenticated traffic use separate rate buckets,
so invalid credentials cannot consume the authorized client budget. Header,
request, keep-alive, request-per-socket, and header-count limits also bound
slow or excessively reused connections. It returns no permissive CORS headers
and exposes only a detail-free, Host-validated `/healthz`.

Bind to loopback behind an HTTPS reverse proxy. If binding to a non-loopback
interface, configuration is rejected unless `tlsTerminatedByProxy` is
explicitly true. That flag records operator intent; it cannot verify the proxy.
Never expose the native HTTP listener directly to an untrusted network.

## n8n

For deterministic workflows, use `GlobiGuard Action Gate` immediately before
the exact business action and connect only the ALLOW branch.

For n8n AI Agents:

1. run `gateway-http` behind HTTPS;
2. configure n8n's built-in **MCP Client Tool** with the gateway `/mcp` URL and
   a Header Auth credential containing `Authorization: Bearer …`;
3. expose only that MCP Client Tool to the agent;
4. do not expose the original downstream MCP server to the same agent.

Prompt instructions and a voluntary governance-check tool are not enforcement
mechanisms.

## Privacy

Raw MCP argument values remain in the local gateway. GlobiGuard receives:

- a SHA-256 digest;
- approximate byte count and record count;
- value kinds;
- up to 64 schema-like top-level field names;
- metadata-only connector identity and tool-schema/capability digests.

Field names that are not schema-like or contain long digit sequences are
replaced with stable hashes because map keys can themselves contain PII.
Payloads above 10 MiB are rejected locally.

The digest proves argument continuity; it is not reversible encryption and
must not be treated as a substitute for classifying the action.

MCP tool annotations are treated as untrusted hints. They can raise the
default risk score, but a `readOnlyHint` can never lower it below the
conservative baseline; only explicit operator governance can do that.

## Physical AI and robotics

Use the authority layer for high-level intent such as route selection,
work-order execution, actuator permission, or cross-system disclosure.
Production physical systems also require bounded, short-lived execution
permits tied to the device/workcell and environment snapshot.

GlobiGuard is not an emergency stop, PLC safety interlock, certified functional
safety controller, collision-avoidance loop, or hard-real-time system. A
robot's ability to stop safely must never depend on an MCP client, cloud
service, or language model.

## Security

Read [SECURITY.md](./SECURITY.md) before production deployment. Stdio is the
smallest local trust boundary. Streamable HTTP is intended for a
single-project, operator-owned deployment and adds bearer authentication,
Host/Origin checks, rate limits, body limits, and bounded sessions. A shared
multi-tenant service requires an OAuth resource server, tenant-bound scopes,
durable distributed session/rate-limit storage, and separate credentials per
tenant; this package does not pretend a static bearer token provides that.

## Development

```bash
pnpm --filter @globiguard/mcp-server typecheck
pnpm --filter @globiguard/mcp-server test
pnpm --filter @globiguard/mcp-server build
pnpm --filter @globiguard/mcp-server pack
```

No package should be published until the tarball, registry manifest, protocol
tests, examples, and security review all pass.
