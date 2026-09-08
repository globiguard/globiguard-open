# Changelog

## Unreleased

- Clarified that Action Gate's AI-tool exposure is advisory and non-executable,
  while Governed HTTP Action and the MCP gateway are execution boundaries.
- Added forward-compatible governed Brain provenance to Detect outputs: contract
  version, trace ID, specialist/artifact evidence, inference status, policy
  authority, deterministic layers, latency, and a privacy-safe digest.
- Fail closed when an unavailable or abstained Brain response claims a clean
  decision; legacy servers without the additive provenance fields remain
  compatible during rollout.
- Validate every specialist record and project only the documented metadata
  fields, preventing unknown upstream values from crossing the n8n boundary.
- Consume the byte-identical canonical Brain acceptance/rejection fixture set
  shared with the direct API and Make integration.

## 2.0.3

- Published from the corrected default-branch source so n8n Creator Portal can
  resolve the compiled credential entrypoint back to the public repository.
- Retained the exact reviewed 2.0.2 runtime behavior; this patch changes release
provenance and repository discoverability only.

## 2.0.2

- Versioned the compiled node and credential entry points required by the n8n
  Creator Portal repository pre-check.
- Added release-time checks that prevent publishing when declared compiled
  entries are absent from Git.

## 2.0.1

- Restored truthful AI-tool catalog metadata for the governed HTTP action node.
- Kept execution fail closed unless the current decision is an exact,
  obligation-free `ALLOW` for the immutable request fingerprint.
- Added bounded, metadata-only output summaries and broader regression coverage.
- Completed the package metadata needed for n8n community-node verification.

## 2.0.0

- Rebuilt the package on n8n's official `@n8n/node-cli` layout and validation
  toolchain.
- Added separate Action Gate, Detect, and Evidence nodes with explicit output
  branches and item linking.
- Bound approval continuation to a fresh authorization of the current payload;
  resolved approvals never execute by themselves.
- Added local JSON and binary payload hashing without sending raw item values
  to the control plane.
- Added Unicode code-point span handling, overlap merging, and fail-closed
  detection validation.
- Added metadata-safe evidence and incident-replay operations.
- Added a governed MCP Agent workflow template for execution-boundary
  enforcement of AI tool calls.
- Added Governed HTTP Action, which authorizes and executes one immutable HTTPS
  request inside the same node, with short-lived permits, redirect suppression,
  bounded timeouts, and exact fingerprint rechecks.
- Reframed Action Gate as a policy-routing checkpoint and removed its
  `usableAsTool` and `safeToExecute` claims.
- Made redaction fail closed when a sensitive decision has no redactable spans.
- Removed the legacy AI-agent node that did not wrap or execute downstream
  tools and therefore could not truthfully enforce each call.
