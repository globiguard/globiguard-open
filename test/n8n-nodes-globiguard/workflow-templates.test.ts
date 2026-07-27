import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface WorkflowNode {
  name: string;
  type: string;
  typeVersion?: number;
  parameters: Record<string, unknown>;
}

interface Workflow {
  nodes: WorkflowNode[];
  connections: Record<
    string,
    Record<string, Array<Array<{ node: string; type: string; index: number }>>>
  >;
}

describe('importable n8n workflow templates', () => {
  it('uses exact-request executors for initial and post-approval side effects', async () => {
    const workflow = await loadWorkflow('globiguard-governed-email-starter.json');
    const executors = workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-globiguard.globiGuardHttpAction'
    );
    expect(executors).toHaveLength(2);
    expect(executors.map((node) => node.typeVersion)).toEqual([1, 1]);
    expect(executors.map((node) => node.parameters.governedActionType)).toEqual([
      'email.send',
      'email.send'
    ]);
    expect(executors[0]?.parameters.approvalQueueEntryId).toBeUndefined();
    expect(executors[1]?.parameters.approvalQueueEntryId).toBe(
      '={{ $json.globiguard.queueEntryId }}'
    );

    for (const executor of executors) {
      const outputs = workflow.connections[executor.name]?.main;
      expect(outputs).toHaveLength(5);
      expect(outputs?.[0]?.map((edge) => edge.node)).toContain(
        'Email Executed'
      );
      for (const nonAllow of outputs?.slice(1) ?? []) {
        expect(nonAllow.map((edge) => edge.node)).not.toContain(
          'Email Executed'
        );
      }
    }

    expect(
      workflow.connections['Wait Before Approval Check']?.main[0]?.[0]?.node
    ).toBe('Execute Approved Exact Email');
  });

  it('exposes only the governed MCP gateway as the agent tool', async () => {
    const workflow = await loadWorkflow('globiguard-governed-mcp-agent.json');
    const mcpNodes = workflow.nodes.filter((node) =>
      node.type.endsWith('.mcpClientTool')
    );
    expect(mcpNodes).toHaveLength(1);
    expect(mcpNodes[0]?.parameters).toMatchObject({
      endpointUrl: 'https://mcp.example.com/mcp',
      serverTransport: 'httpStreamable',
      authentication: 'headerAuth'
    });
    expect(
      workflow.connections['GlobiGuard Governed MCP Gateway']?.ai_tool[0]?.[0]
        ?.node
    ).toBe('Governed AI Agent');
  });

  it('contains no legacy false-enforcement operations', async () => {
    for (const name of [
      'globiguard-governed-email-starter.json',
      'insurance-claims-governed-action.json',
      'globiguard-governed-mcp-agent.json'
    ]) {
      const workflow = await loadWorkflow(name);
      const serialized = JSON.stringify(workflow);
      expect(serialized).not.toContain('governAction');
      expect(serialized).not.toContain('waitForApproval');
      expect(serialized).not.toContain('GlobiGuardAiAgent');
    }
  });
});

async function loadWorkflow(name: string): Promise<Workflow> {
  const path = resolve(process.cwd(), '../../examples/n8n', name);
  return JSON.parse(await readFile(path, 'utf8')) as Workflow;
}
