# Changelog

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
