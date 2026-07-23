# @globiguard/sdk

Server-first TypeScript SDK for the GlobiGuard control plane and trusted
decision-engine connectivity.

## Runtime expectations

- Node.js **22+** for server usage
- standards-based `fetch`, `Headers`, `FormData`, and `Blob` support
- browser usage is supported only through the browser-safe client surface

## Trust-boundary rule

`createBrowserClient()` stops at the control plane.

Direct decision-engine access is reserved for `createServerClient()` in trusted
runtimes using secret or local credentials.

## Surface split

- Browser-safe control-plane access: action authorization status, approval status,
  evidence references/summaries, incident replay metadata, install
  registration/heartbeat plus audit, policy, queue, and workflow reads
- Trusted server management: governed action authorization, approval creation,
  approval wait/polling, queue approvals, workflow management/runs, policy
  management, org management, API-key administration, audit evidence exports,
  incident replay lookup, and trust webhook verification through
  `@globiguard/sdk/server`
- Realtime subscriptions are intentionally split into `@globiguard/realtime` so
  ordinary SDK installs do not pull websocket dependencies unless the app opts in
  to the control-plane websocket gateway.
- Audit evidence exports return a typed evidence-package artifact with requested
  scope, control mappings, provenance references, review history, and summary
  metadata aligned to the live control-plane export shape

## Governed action quickstart

Authorize actions only from a trusted runtime:

```ts
const decision = await serverClient.governedActions.authorizeAction({
  context: {
    actionType: "email.send",
    destination: { type: "email", name: "customer-email" },
    dataClasses: ["PII"],
    payloadSummary: { topLevelKeys: ["recipient", "body"] },
    idempotencyKey: "claim-123:email-status"
  }
});

if (decision.decision === "ALLOW" || decision.decision === "MODIFY") {
  await sendClaimStatusEmail();
}
```

Use a stable persisted idempotency key. A fresh random key per retry can
duplicate queued/resumed business actions.

Use `actionGateway: { mode: "sidecar" }` with `services.sidecar`, or `mode: "gateway"` with `services.gateway`, to route authorization through a local sidecar or governed gateway. Browser clients expose only `client.actions.getAuthorization()`, `getApproval()`, evidence reads, and incident replay metadata.

## AI intercept

`createAiIntercept` wraps any AI provider call with a GlobiGuard governance checkpoint. Input is authorized before the model is called; output is classified by Brain and authorized if sensitive. Supported providers: OpenAI, Anthropic, Google GenAI, AWS Bedrock, Cohere, Mistral, Ollama, Vercel AI SDK, LangChain JS.

```ts
import { createServerClient, createAiIntercept } from "@globiguard/sdk";
import OpenAI from "openai";

const serverClient = createServerClient({ ... });

const intercept = createAiIntercept(
  { actions: serverClient.actions, brain: serverClient.brain },
  { mode: "scan_both" }   // scan_input | scan_output | scan_both
);

// OpenAI — returns a Proxy with governed chat.completions.create
const governed = intercept.openai(new OpenAI());
const response = await governed.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Summarise this contract..." }],
});

// Anthropic
import Anthropic from "@anthropic-ai/sdk";
const governed = intercept.anthropic(new Anthropic());
const msg = await governed.messages.create({ model: "claude-opus-4-8", max_tokens: 1024, messages: [...] });

// Google GenAI
import { GoogleGenerativeAI } from "@google/generative-ai";
const model = new GoogleGenerativeAI("api-key").getGenerativeModel({ model: "gemini-1.5-pro" });
const governed = intercept.google(model);
const result = await governed.generateContent("Draft a privacy policy...");

// AWS Bedrock
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
const governed = intercept.bedrock(new BedrockRuntimeClient({ region: "us-east-1" }));
const out = await governed.send(command);

// Vercel AI SDK
import { openai } from "@ai-sdk/openai";
const governed = intercept.vercel(openai("gpt-4o"));
const { text } = await generateText({ model: governed, prompt: "..." });

// LangChain JS
import { ChatOpenAI } from "@langchain/openai";
const governed = intercept.langchain(new ChatOpenAI({ model: "gpt-4o" }));
const result = await governed.invoke("Draft a contract...");

// Any provider via generic()
const governed = intercept.generic(myProviderFn, { extractInput: (params) => params.prompt });
```

When a governance decision is `BLOCK`, `GlobiguardAuthorityError` is thrown with `kind: "POLICY_BLOCKED"`. Pass `onBlock` in options to handle it yourself instead of throwing.

## Webhook verification

```ts
import { verifyTrustWebhook } from "@globiguard/sdk/server";

const verification = await verifyTrustWebhook({
  headers,
  rawBody,
  signingSecret,
  seenDelivery: async (deliveryId) => alreadyProcessed(deliveryId)
});
```

The verifier checks signature, timestamp, event type, delivery ID, replay window,
and optional duplicate delivery state. It fails fast in browser runtimes.

Compatibility: governed-action payloads use contract version
`2026-04-action-beta` and require a GlobiGuard control plane or action gateway
that implements the same version.
