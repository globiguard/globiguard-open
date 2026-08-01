# Changelog

## 2.1.1

- Require `@globiguard/contracts` 1.0.2 so public installs receive the same
  governed-action context type surface used by workspace tests and builds.
- Add a packed consumer compile gate to prevent workspace links from hiding a
  stale public dependency contract.

## 2.1.0

- Add multi-agent governance and inter-agent trust helpers.
- Enforce strict current execution authority for governed actions.
