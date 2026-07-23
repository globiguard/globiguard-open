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
- AI intercept for 10 providers: OpenAI, Anthropic, Google GenAI, AWS Bedrock,
  Cohere, Mistral, Ollama, Vercel AI SDK, LangChain JS, and any callable via `generic()`
- Multi-agent governance: `GovernanceContext` records per-hop traces (input, tool-call,
  output, agent-call) under a shared `correlation_id` for LangGraph, CrewAI, AutoGPT,
  n8n, and generic orchestration frameworks; `serverClient.governance` exposes trace
  and inter-agent trust token endpoints
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

## Multi-agent governance

`GovernanceContext` records input, tool-call, and output governance hops under a shared `correlation_id`. All hops for the same workflow run are stitched into a single trace visible in the GlobiGuard portal.

```ts
import { createServerClient, GovernanceContext } from "@globiguard/sdk";

const gg = createServerClient({ ... });

// Works with LangGraph/LangChain.js, CrewAI, AutoGPT, n8n, or any framework.
const ctx = new GovernanceContext(gg.governance, {
  orgId: "org_123",
  sessionId: "sess_abc",
  correlationId: "corr_wf_run_001",  // shared across all agents in the workflow
  agentId: "classify_node",
  framework: "langgraph",
  workflowName: "patient_intake",
});

// Scan input, record the hop
const inputResp = await gg.brain!.evaluate({ text: userMessage, industry: "HEALTHCARE", sessionId: "sess_abc", orgId: "org_123" });
await ctx.recordInput(inputResp);

// ... call LLM ...

// Scan output, record the hop (throws GovernanceBlockedError on BLOCK)
const outputResp = await gg.brain!.evaluate({ text: llmOutput, industry: "HEALTHCARE", sessionId: "sess_abc", orgId: "org_123" });
await ctx.recordOutput(outputResp);

console.log(ctx.traceId);         // "gtrace_..."
console.log(ctx.lastDecision);    // "ALLOW" | "MODIFY" | "QUEUE" | "BLOCK"
```

Pass `raiseOnBlock: false` to handle BLOCK decisions yourself. Use `ctx.recordToolCall("crm.write", evalResp)` for tool-call hops.

The low-level client is at `serverClient.governance`:

```ts
// Record a hop manually
await gg.governance.recordHop({
  correlation_id: "corr_wf_run_001",
  org_id: "org_123",
  session_id: "sess_abc",
  decision: "ALLOW",
  phase: "tool_call",
  tool_name: "web_search",
  framework: "crewai",
  latency_ms: 18.2,
});

// Fetch a full trace
const traceResp = await gg.governance.getTrace("gtrace_abc123");

// List recent traces for an org
const traces = await gg.governance.listTraces("org_123", 20);
```

### Inter-agent trust

Prevent prompt-injection attacks where a malicious instruction impersonates a trusted upstream agent.

```ts
// Agent A — issue a token at the start of its execution
const token = await gg.governance.issueToken({
  agentId: "extractor_agent",
  orgId: "org_123",
  sessionId: "sess_abc",
  correlationId: "corr_wf_run_001",
  ttlSeconds: 300,
});

// Agent B — verify the token before acting on A's output
const result = await gg.governance.verifyToken(token, "corr_wf_run_001");

if (result.verdict !== "trusted") {
  throw new Error(`Upstream agent not trusted: ${result.reason}`);
}
```

If the upstream agent's last hop was `BLOCK`, `verifyToken` automatically returns `verdict: "untrusted"` with `reason: "upstream_agent_blocked"`.

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
