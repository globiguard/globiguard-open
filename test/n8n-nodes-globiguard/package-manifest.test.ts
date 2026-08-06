import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../../packages/n8n-nodes-globiguard');
const manifest = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
) as {
  name: string;
  keywords?: string[];
  license?: string;
  repository?: { directory?: string };
  files?: string[];
  n8n?: { n8nNodesApiVersion?: number; nodes?: string[]; credentials?: string[] };
  publishConfig?: { access?: string; provenance?: boolean };
};

describe('n8n community package manifest', () => {
  it('keeps the Creator Portal metadata and compiled entry points complete', () => {
    expect(manifest.name).toBe('n8n-nodes-globiguard');
    expect(manifest.keywords).toContain('n8n-community-node-package');
    expect(['MIT', 'Apache-2.0']).toContain(manifest.license);
    expect(manifest.repository?.directory).toBe('packages/n8n-nodes-globiguard');
    expect(manifest.files).toContain('dist');
    expect(manifest.n8n?.n8nNodesApiVersion).toBe(1);
    expect(manifest.n8n?.nodes).toHaveLength(4);
    expect(manifest.n8n?.credentials).toEqual([
      'dist/credentials/GlobiGuardApi.credentials.js',
    ]);
    expect(manifest.publishConfig).toMatchObject({
      access: 'public',
      provenance: true,
    });

    for (const entry of [
      ...(manifest.n8n?.nodes ?? []),
      ...(manifest.n8n?.credentials ?? []),
    ]) {
      expect(existsSync(resolve(packageRoot, entry)), entry).toBe(true);
    }
  });
});
