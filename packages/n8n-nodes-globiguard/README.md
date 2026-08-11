# n8n-nodes-globiguard

GlobiGuard's official community-node package for action governance, sensitive-data detection, and audit evidence.

## What is enforced

`GlobiGuard Action Gate` is a policy-routing checkpoint. It hashes the current
n8n item and routes the decision, but it does not own a later side effect and
therefore never labels an output `safeToExecute` or presents itself as an AI
execution tool. n8n can expose it to an AI Agent as an advisory policy-check
tool, but every result remains non-executable and a workflow author can still
rewire any routing output.

`GlobiGuard Governed HTTP Action` is the package's exact execution boundary.
It constructs one HTTPS request, hashes the complete request descriptor,
authorizes that fingerprint, rechecks the fingerprint and short-lived decision,
and executes the same request inside one node. Redirects and downstream retries
are disabled. Its **Governed Action Type** is the semantic policy capability
(for example `email.send`); the HTTP method is separately included in the exact
request fingerprint, so choosing a useful policy name does not weaken transport
binding.

The Action Gate routes each item to exactly one output:

| Output | May execute the unchanged action? | Required handling |
| --- | --- | --- |
| `allow` | No execution claim | Continue policy-aware workflow routing or hand the authoritative payload to a governed executor |
| `modified` | No | Apply the reviewed change to the authoritative payload, then authorize again |
| `blocked` | No | Stop, alert, or record an incident |
| `queued` | No | Wait for review, then use **Reauthorize After Approval** |
| `error` | No | Fail closed and investigate |

Approval is not an execution permit. **Reauthorize After Approval** first checks
the queue entry, then asks GlobiGuard for a fresh routing decision over the
current payload. Pending review remains queued; rejected or expired review is
blocked; reviewer modifications must be applied before another policy check.
For an exact HTTP side effect, pass the approved queue ID to the Governed HTTP
Action's **Approved Queue Entry ID** field instead. The executor binds and
consumes that approval during its own fresh authorization of the exact method,
URL, headers, body, and transport options; an ALLOW from the routing node is
never transferred as execution authority.

The Action Gate cannot prevent a workflow author from connecting any output to
an unsafe action. Use the Governed HTTP Action for HTTP side effects or the
governed MCP gateway for agent tool calls when enforcement is required.

## Nodes

- **GlobiGuard Action Gate** — deterministic policy-routing checkpoint; it does not execute or issue a transferable permit.
- **GlobiGuard Governed HTTP Action** — exact-request authorization and HTTP execution in one fail-closed node.
- **GlobiGuard Detect** — sensitive-data detection and optional redaction, with separate `sensitive`, `clean`, and fail-closed `error` outputs.
- **GlobiGuard Evidence** — read-only authorization traces, audit events, incident replays, and evidence-package summaries.

Full evidence export remains an explicit owner/admin action protected by MFA in
GlobiGuard. The project secret used by an unattended n8n workflow can read its
scoped evidence and package summaries, but cannot impersonate a human reviewer
or export an organization-wide compliance package.

## Install

In n8n, open **Settings → Community Nodes → Install** and enter:

```text
n8n-nodes-globiguard
```

The package requires Node.js 22.22 or newer for self-hosted n8n.

## Credentials

Create a **GlobiGuard API** credential with:

- environment: `sandbox`, `live`, or loopback-only `local`;
- API URL: `https://api.globiguard.com` by default;
- project ID;
- server-side secret key.

The package uses n8n's authenticated HTTP helper. It has no runtime package dependencies, does not read environment variables or files, and never accepts browser publishable keys. Service URLs must be HTTPS outside local mode; local mode only accepts loopback hosts.

## Deterministic action workflow

Import:

```text
https://raw.githubusercontent.com/globiguard/globiguard-open/main/examples/n8n/globiguard-governed-email-starter.json
```

The template uses the Governed HTTP Action for both the first attempt and the
post-approval attempt. Replace `https://api.example.com/v1/email` with your real
HTTPS email endpoint and configure its downstream authentication header. The
queued branch carries the queue ID into a second exact executor; no routing
ALLOW or approval object is treated as a transferable permit.

The policy request contains action intent, destination, declared data classes,
purpose, workflow correlation, payload size and shape, and a canonical SHA-256
payload digest. JSON values and binary attachments are hashed locally; binary
bytes are never sent to GlobiGuard. Successful outputs preserve n8n item pairing
and binary data. Unsafe or identifier-like field names are hashed locally.

Use a stable idempotency key from the business object when the downstream action is retryable. The n8n execution ID alone is not stable across every retry strategy.

## AI agents and MCP

The Action Gate can be offered to an n8n AI Agent as an advisory policy-check
tool. Its response remains non-executable: it cannot enforce the agent's later
calls to other tools, and an `ALLOW` from it must never be treated as authority
for a separate side effect.

For execution-boundary enforcement:

1. run the GlobiGuard governed MCP gateway in front of the downstream MCP server;
2. connect n8n's built-in **MCP Client Tool** only to the governed gateway;
3. do not expose the original downstream MCP server to the same agent.

For a single HTTPS side effect, the Governed HTTP Action may also be exposed as
the agent tool because that node owns the downstream request and executes only
the exact, freshly authorized request. Do not expose an equivalent ungoverned
HTTP tool to the same agent.

The gateway owns the downstream connection and forwards the exact tool arguments only after `ALLOW`. BLOCK, MODIFY, QUEUE, expired decisions, authority failures, and argument drift fail closed.

After deploying the gateway's authenticated Streamable HTTP endpoint, import:

```text
https://raw.githubusercontent.com/globiguard/globiguard-open/main/examples/n8n/globiguard-governed-mcp-agent.json
```

Attach an n8n Header Auth credential containing
`Authorization: Bearer <gateway token>`, select an approved chat model, and
replace `https://mcp.example.com/mcp` with the HTTPS gateway URL.

For physical AI and robotics, use this path for supervisory actions such as job dispatch, configuration changes, access to restricted zones, or external communications. It does not replace emergency stops, PLC interlocks, collision avoidance, certified safety controllers, or any hard real-time control loop.

## Sensitive-data path

```text
input → GlobiGuard Detect → sensitive → redact / review / stop
                            clean     → model or external system
                            error     → stop / retry / alert
```

Detection errors never appear on the clean output. When redaction is enabled,
use `json.globiguard.redactedText` downstream rather than the original text and
require `json.globiguard.redactionComplete === true`. Offsets are interpreted as
Unicode code points, matching Brain; a missing, invalid, or out-of-range span
fails closed instead of returning partially redacted text.
If Brain reports a sensitive decision without spans, redaction also fails
closed; the node never calls unchanged text "fully redacted".

## Development and verification

```bash
pnpm install
pnpm --filter n8n-nodes-globiguard typecheck
pnpm --filter n8n-nodes-globiguard lint
pnpm --filter n8n-nodes-globiguard test
pnpm --filter n8n-nodes-globiguard build
pnpm --filter n8n-nodes-globiguard exec npm pack --pack-destination ./artifacts
```

Publishing is performed from GitHub Actions with npm provenance. A release is not ready until the package builds on Node.js 22.22+, passes the official n8n linter, the packed tarball has no runtime dependencies, and the published package passes n8n's community-package scanner.

## License

MIT
