/**
 * Multi-agent governance client for TypeScript/JavaScript.
 *
 * Usage (LangGraph / LangChain.js):
 *
 *   import { createServerClient } from "@globiguard/sdk";
 *   import { GovernanceContext } from "@globiguard/sdk/governance";
 *
 *   const gg = createServerClient({ ... });
 *
 *   // Inside a node:
 *   const ctx = new GovernanceContext(gg.governance, {
 *     orgId: "org_xxx",
 *     sessionId: state.sessionId,
 *     agentId: "classify_node",
 *     framework: "langgraph",
 *     workflowName: "patient_intake",
 *   });
 *   const inputResp = await gg.brain.evaluate({ text: state.input, ... });
 *   await ctx.recordInput(inputResp);
 *   // ... run LLM ...
 *   const outputResp = await gg.brain.evaluate({ text: llmOutput, ... });
 *   await ctx.recordOutput(outputResp);
 */

import type { GlobiguardTransport } from "./client.js";

export type HopPhase = "input" | "tool_call" | "output" | "agent_call" | "custom";
export type HopDecision = "ALLOW" | "MODIFY" | "QUEUE" | "BLOCK";
export type FrameworkHint = "langgraph" | "crewai" | "autogpt" | "n8n" | "generic";

export interface RecordHopRequest {
  correlation_id: string;
  org_id: string;
  session_id: string;
  decision: HopDecision;
  phase?: HopPhase;
  agent_id?: string;
  tool_name?: string;
  framework?: FrameworkHint;
  workflow_name?: string;
  confidence?: number;
  risk_score?: number;
  field_types?: string[];
  blocked_count?: number;
  masked_count?: number;
  reason_codes?: string[];
  latency_ms?: number;
  metadata?: Record<string, unknown>;
}

export interface RecordHopResponse {
  trace_id: string;
  hop_id: string;
  overall_decision: HopDecision;
  hop_count: number;
}

export interface TraceHop {
  hop_id: string;
  phase: HopPhase;
  agent_id?: string;
  tool_name?: string;
  decision: HopDecision;
  confidence: number;
  risk_score: number;
  field_types: string[];
  blocked_count: number;
  masked_count: number;
  reason_codes: string[];
  latency_ms: number;
  timestamp_ms: number;
  metadata: Record<string, unknown>;
}

export interface GovernanceTrace {
  trace_id: string;
  correlation_id: string;
  org_id: string;
  session_id: string;
  framework: FrameworkHint;
  workflow_name?: string;
  hops: TraceHop[];
  created_at_ms: number;
  updated_at_ms: number;
}

export interface TraceResponse {
  trace: GovernanceTrace;
  overall_decision: HopDecision;
  total_latency_ms: number;
  hop_count: number;
}

export interface AgentToken {
  agent_id: string;
  org_id: string;
  session_id: string;
  correlation_id: string;
  issued_at_ms: number;
  expires_at_ms: number;
  claims: Record<string, unknown>;
  signature: string;
}

export interface TrustVerifyResult {
  verdict: "trusted" | "unverified" | "untrusted";
  agent_id: string;
  correlation_id: string;
  last_hop_decision?: string;
  last_hop_phase?: string;
  reason: string;
}

// Minimal shape expected from an evaluate response
interface EvaluateResponseLike {
  decision?: string;
  confidence?: number;
  risk_score?: number;
  blocked_fields?: Array<{ field_type?: string }>;
  masked_fields?: Array<{ field_type?: string }>;
  reason_codes?: string[];
}

export interface GlobiguardGovernanceClient {
  recordHop(req: RecordHopRequest): Promise<RecordHopResponse>;
  getTrace(traceId: string): Promise<TraceResponse>;
  listTraces(orgId: string, limit?: number): Promise<TraceResponse[]>;
  issueToken(opts: {
    agentId: string; orgId: string; sessionId: string;
    correlationId: string; ttlSeconds?: number; claims?: Record<string, unknown>;
  }): Promise<AgentToken>;
  verifyToken(token: AgentToken, expectedCorrelationId?: string): Promise<TrustVerifyResult>;
  revokeToken(agentId: string, correlationId: string): Promise<{ revoked: boolean; agent_id: string }>;
}

export function createGovernanceClient(transport: GlobiguardTransport): GlobiguardGovernanceClient {
  return {
    recordHop(req) {
      return transport.request<RecordHopResponse>("/v1/governance/hop", {
        method: "POST",
        body: req,
      });
    },
    getTrace(traceId) {
      return transport.request<TraceResponse>(`/v1/governance/trace/${encodeURIComponent(traceId)}`);
    },
    listTraces(orgId, limit = 50) {
      return transport.request<TraceResponse[]>("/v1/governance/traces", {
        method: "GET",
        query: { org_id: orgId, limit: String(limit) },
      });
    },
    issueToken({ agentId, orgId, sessionId, correlationId, ttlSeconds = 300, claims = {} }) {
      return transport.request<AgentToken>("/v1/governance/trust/issue", {
        method: "POST",
        body: {
          agent_id: agentId,
          org_id: orgId,
          session_id: sessionId,
          correlation_id: correlationId,
          ttl_seconds: ttlSeconds,
          claims,
        },
      });
    },
    verifyToken(token, expectedCorrelationId) {
      return transport.request<TrustVerifyResult>("/v1/governance/trust/verify", {
        method: "POST",
        body: { token, expected_correlation_id: expectedCorrelationId ?? null },
      });
    },
    revokeToken(agentId, correlationId) {
      return transport.request<{ revoked: boolean; agent_id: string }>(
        "/v1/governance/trust/revoke",
        { method: "POST", body: { agent_id: agentId, correlation_id: correlationId } }
      );
    },
  };
}

function _genCorrelationId(): string {
  // Avoid crypto dependency — use timestamp + random hex
  const ts = Date.now().toString(16);
  const rand = Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, "0");
  return `corr_${ts}${rand}`;
}

/**
 * High-level helper that wraps a single agent step.
 * Accumulates evaluate() results and records them as typed hops.
 */
export class GovernanceContext {
  readonly correlationId: string;
  private _traceId?: string;
  private _lastDecision: HopDecision = "ALLOW";

  constructor(
    private readonly client: GlobiguardGovernanceClient,
    private readonly opts: {
      orgId: string;
      sessionId: string;
      correlationId?: string;
      agentId?: string;
      framework?: FrameworkHint;
      workflowName?: string;
      raiseOnBlock?: boolean;
    }
  ) {
    this.correlationId = opts.correlationId ?? _genCorrelationId();
  }

  get traceId(): string | undefined { return this._traceId; }
  get lastDecision(): HopDecision { return this._lastDecision; }

  private async _record(
    phase: HopPhase,
    resp: EvaluateResponseLike,
    toolName?: string
  ): Promise<RecordHopResponse> {
    const decision = (resp.decision ?? "ALLOW") as HopDecision;
    const allFields = [
      ...(resp.blocked_fields ?? []),
      ...(resp.masked_fields ?? []),
    ].map((f) => f.field_type ?? "").filter(Boolean);

    const result = await this.client.recordHop({
      correlation_id: this.correlationId,
      org_id: this.opts.orgId,
      session_id: this.opts.sessionId,
      decision,
      phase,
      agent_id: this.opts.agentId,
      tool_name: toolName,
      framework: this.opts.framework ?? "generic",
      workflow_name: this.opts.workflowName,
      confidence: resp.confidence ?? 0,
      risk_score: resp.risk_score ?? 0,
      field_types: allFields,
      blocked_count: resp.blocked_fields?.length ?? 0,
      masked_count: resp.masked_fields?.length ?? 0,
      reason_codes: resp.reason_codes ?? [],
    });

    this._traceId = result.trace_id;
    this._lastDecision = result.overall_decision;

    if (this.opts.raiseOnBlock !== false && result.overall_decision === "BLOCK") {
      throw new GovernanceBlockedError(result.overall_decision, resp.reason_codes ?? []);
    }
    return result;
  }

  recordInput(evaluateResponse: EvaluateResponseLike): Promise<RecordHopResponse> {
    return this._record("input", evaluateResponse);
  }

  recordToolCall(toolName: string, evaluateResponse: EvaluateResponseLike): Promise<RecordHopResponse> {
    return this._record("tool_call", evaluateResponse, toolName);
  }

  recordOutput(evaluateResponse: EvaluateResponseLike): Promise<RecordHopResponse> {
    return this._record("output", evaluateResponse);
  }
}

export class GovernanceBlockedError extends Error {
  constructor(
    public readonly decision: HopDecision,
    public readonly reasonCodes: string[]
  ) {
    super(`Governance ${decision}: ${reasonCodes.join(", ")}`);
    this.name = "GovernanceBlockedError";
  }
}
