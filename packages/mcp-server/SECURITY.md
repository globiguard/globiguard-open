# Security model

## Trust boundaries

The MCP host, GlobiGuard gateway, GlobiGuard control plane, downstream MCP
server, and downstream target service are separate principals.

- The gateway trusts policy decisions only from its configured GlobiGuard
  project and environment.
- The gateway treats downstream tool names, schemas, annotations,
  descriptions, results, and stderr as untrusted.
- Tool annotations are hints. Missing `readOnlyHint` never implies that a tool
  is safe.
- The downstream child receives a minimal environment plus variables
  explicitly selected by name.

## Enforced invariants

1. The downstream tool is never called for `MODIFY`, `QUEUE`, or `BLOCK`.
2. An authority outage fails closed.
3. The digest is recomputed immediately before forwarding to detect argument
   substitution.
4. Expired or malformed authorization expiry fails closed.
5. Approval resolution never directly enables execution; the current action
   is reauthorized.
6. Raw tool values are not sent to the control plane by the gateway.
7. GlobiGuard credentials are not passed to the downstream child unless an
   operator explicitly names those variables, which should never be done.
8. Internal exception messages are not returned to the model.
9. An `ALLOW` carrying generic string obligations does not execute. Obligations
   require a typed, locally enforced handler before the gateway can honor them.
10. Missing `executable` or `nextAction` fields fail closed; legacy or
    historical ALLOW records are never inferred to be executable.
11. Authorization binds to a stable connector instance, reviewed mapping
    version, and metadata-only digest of the current discovered tool schema.

## Threats and controls

| Threat                                 | Control                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent skips governance                 | Configure only the governed gateway, not the original MCP server                                                                                        |
| Arguments change after authorization   | Canonical SHA-256 before authorization and immediately before call                                                                                      |
| Replay or duplicate agent retry        | Stable material-input idempotency key plus control-plane replay controls                                                                                |
| Approval time-of-check/time-of-use gap | Approval requires exact-current reauthorization                                                                                                         |
| Confidential argument exfiltration     | Local-only hashing and structural summary; unsafe map keys are hashed                                                                                   |
| Payload denial of service              | 10 MiB local payload ceiling and bounded metadata                                                                                                       |
| Downstream secret theft                | Allowlisted environment inheritance                                                                                                                     |
| Malicious tool annotations             | Conservative default risk; annotations never grant authority                                                                                            |
| Tool schema changes after review       | Connector instance, mapping version, schema/capability snapshot, and digest are bound into fresh authorization                                            |
| Tool namespace collision               | Deterministic namespacing and collision rejection                                                                                                       |
| Authority failure                      | Fail closed without downstream call                                                                                                                     |
| Downstream failure after ALLOW         | Sanitized error plus retained authorization/evidence metadata                                                                                           |
| Cross-tenant confused deputy           | Project-bound server credential; destination and policy inputs are included in idempotency                                                              |
| Prompt injection in tool metadata      | Treat downstream descriptions as untrusted; policies decide execution independently of descriptions                                                     |
| HTTP credential theft                  | Bearer token is accepted only at an operator-owned endpoint; require HTTPS reverse proxy and rotate independently                                       |
| DNS rebinding / browser-origin abuse   | Exact Host allowlist, reject unlisted Origin, no permissive CORS                                                                                        |
| Session or request exhaustion          | Body/session ceilings, idle expiry, separate authenticated/unauthenticated rate buckets, bounded headers, request timeouts, and connection reuse limits |
| Cross-tenant HTTP confusion            | Remote mode is single-project; shared multi-tenant hosting requires OAuth and tenant-bound credentials                                                  |

## Deployment requirements

- Use separate GlobiGuard projects and credentials for sandbox and live.
- Give the server credential only the policy/authorization scopes it needs.
- Rotate GlobiGuard and downstream secrets independently.
- Do not place secrets in gateway JSON, tool descriptions, purposes, field
  names, or command-line arguments.
- Store gateway configuration as code and review tool additions and policy
  overrides.
- Do not expose stdio through an unauthenticated network bridge.
- Bind Streamable HTTP to loopback behind a trusted HTTPS reverse proxy.
- Use a unique random bearer token of at least 32 characters and store only
  its environment-variable reference in configuration.
- Configure the exact external Host value. Leave browser Origins denied unless
  a specific trusted origin is operationally required.
- Keep the ungoverned downstream server out of the agent's MCP configuration.
- Monitor authorization failures, queue volume, repeated idempotency keys, and
  downstream errors.

## Known limits in 0.1

- The registry entry exposes authority mode. Gateway mode requires an
  operator-owned configuration file and downstream command.
- Streamable HTTP is single-project and uses a static deployment bearer token.
  It is not a shared multi-tenant OAuth resource server.
- HTTP sessions and rate limits are in memory and therefore local to one
  process. Horizontal deployment requires a durable coordinated design.
- Approval continuation is explicit polling plus an exact-action binding and a
  fresh authorization carrying the contract's `approvalQueueEntryId`. Merely
  observing `APPROVED`, or passing the local partial binding, never executes.
  The control plane must bind that queue entry to the complete fresh action
  context. MCP Tasks are not yet a compatibility requirement.
- Executable ALLOW requires a known runtime response shape, a bounded current
  expiry, approval state `NOT_REQUIRED` or `APPROVED`, zero unresolved
  obligations, and zero unapplied modifications.
- Production gateways require a durable filesystem execution ledger. Its
  atomic claim is consumed before the side effect; incomplete crash-era claims
  remain consumed. High-consequence tools additionally require a declared
  downstream-native idempotency argument.
- Generic string obligations fail closed at the execution gateway. Typed
  obligation handlers are required before obligation-bearing ALLOW decisions
  can execute.
- A compromised local host can bypass any user-space gateway or steal its
  process credentials.
- Stdio does not solve operating-system sandboxing. Run untrusted downstream
  servers inside a container or OS sandbox.
- The action authorization response is not a certified physical-safety permit.

## Dependency release gate

As of 2026-07-26, `@modelcontextprotocol/sdk@1.29.0` resolves
`@hono/node-server@1.19.15`, which is reported by package audits under
`GHSA-frvp-7c67-39w9`. The advisory concerns Hono's Windows static-file
middleware. This package neither imports nor exposes `serveStatic`, so the
affected path is not reachable through the current authority or gateway
implementation. That reachability assessment is not an audit suppression:
publishing remains blocked until the MCP SDK supports a patched dependency
line or the packaged dependency graph can be made safe without an
application-root-only override.

The workspace pins `ws@8.21.1` to prevent the memory-disclosure and fragmented
message denial-of-service issues fixed in the 8.20.1 and 8.21.0 releases.

## Physical systems

GlobiGuard may authorize high-level physical intent, but emergency stops,
machine guarding, PLC interlocks, collision avoidance, and certified
functional-safety logic must remain local, deterministic, independently
validated, and able to stop safely when GlobiGuard is unavailable.

## Reporting

Report vulnerabilities privately through the security contact published by
the GlobiGuard GitHub organization. Do not include production credentials,
customer payloads, or exploit data from systems you do not own.
