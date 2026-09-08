# Changelog

## Unreleased

- Add an authenticated Control Plane detection client for
  `POST /v1/detection/evaluate` with strict Brain-inference provenance
  validation and canonical cross-ecosystem fixtures.
- Route AI interception through detection plus action authorization, fail
  closed on non-executable or unusable outcomes, and forward only minimized
  detection evidence into authority metadata.
- Keep the optional direct Brain transport for compatibility while removing it
  from the documented AI-interception path.

## 2.1.1

- Require `@globiguard/contracts` 1.0.2 so public installs receive the same
  governed-action context type surface used by workspace tests and builds.
- Add a packed consumer compile gate to prevent workspace links from hiding a
  stale public dependency contract.

## 2.1.0

- Add multi-agent governance and inter-agent trust helpers.
- Enforce strict current execution authority for governed actions.
