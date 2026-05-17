# Example

This example uses Vite as the local demo harness. The GlobiGuard React package
and browser client are not tied to Vite.

The page includes sample governance UI for a queued insurance claim email. The
sample panel demonstrates browser-safe decision, evidence, and replay
components; it does not perform a real action or verify webhooks in the browser.

To run this example:

- `pnpm install`
- `pnpm --dir examples/react-simple dev`

To enable real install registration, create `examples/react-simple/.env.local`
with:

- `VITE_GLOBIGUARD_CONTROL_PLANE_URL=http://localhost:3000`

That variable name is only for this example. In another React runtime, expose
the same control-plane origin through that framework's browser-safe config path.

Real governed actions should go through your server endpoint with
`createServerClient()` and `@globiguard/sdk/server`, then return browser-safe
decision/evidence/replay metadata to these components.

## Production use

Use this example as a UI integration reference. Production action authorization,
approval creation, webhook verification, and side effects must run through a
trusted server or workflow runtime.
