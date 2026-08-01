#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const contractsManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'packages', 'contracts', 'package.json'), 'utf8'),
);
const sdkManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'packages', 'sdk', 'package.json'), 'utf8'),
);
const expectedDependency = `^${contractsManifest.version}`;
if (sdkManifest.dependencies?.['@globiguard/contracts'] !== expectedDependency) {
  throw new Error(
    `@globiguard/sdk must require @globiguard/contracts ${expectedDependency}; found ${sdkManifest.dependencies?.['@globiguard/contracts'] ?? 'missing'}`,
  );
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'globiguard-packed-consumer-'));
const packDir = path.join(tempRoot, 'packs');
const consumerDir = path.join(tempRoot, 'consumer');
fs.mkdirSync(packDir);
fs.mkdirSync(consumerDir);

try {
  run(packageCommand('pnpm'), [
    '--dir', path.join(root, 'packages', 'contracts'), 'pack', '--pack-destination', packDir,
  ]);
  run(packageCommand('pnpm'), [
    '--dir', path.join(root, 'packages', 'sdk'), 'pack', '--pack-destination', packDir,
  ]);

  const tarballs = fs.readdirSync(packDir).map((name) => path.join(packDir, name));
  const contractsTarball = tarballs.find((file) => /contracts-\d/.test(path.basename(file)));
  const sdkTarball = tarballs.find((file) => /sdk-\d/.test(path.basename(file)));
  if (!contractsTarball || !sdkTarball) throw new Error('expected contracts and SDK tarballs');

  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify({ name: 'globiguard-packed-consumer', private: true, type: 'module' }),
  );
  fs.writeFileSync(
    path.join(consumerDir, 'consumer.ts'),
    `import { createServerClient } from '@globiguard/sdk';

const client = createServerClient({
  environment: 'sandbox',
  services: { controlPlane: 'https://control.example.invalid' },
  credential: { kind: 'secret', projectId: 'project_test', token: 'ggsk_test', environment: 'sandbox' },
});

void client.governedActions.authorizeActionOrThrow({
  context: {
    actionType: 'email.send',
    destination: { type: 'email', name: 'customer-email' },
    dataClasses: ['PII'],
    actor: { id: 'agent_test', type: 'agent' },
    purpose: 'Packed public consumer contract verification',
    workflowRunId: 'run_test',
    workflowStepId: 'step_test',
    correlationId: 'corr_test',
    policyId: 'policy_test',
    idempotencyKey: 'idem_test',
    connector: { instanceId: 'connector_test', manifestVersion: '1.0.0' },
    metadata: { source: 'packed-consumer-gate' },
  },
});
`,
  );

  run(packageCommand('npm'), [
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock',
    contractsTarball, sdkTarball,
  ], consumerDir);
  run(process.execPath, [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', '--skipLibCheck',
    path.join(consumerDir, 'consumer.ts'),
  ], consumerDir);
  console.log(
    `[packed-consumer] @globiguard/contracts@${contractsManifest.version} + @globiguard/sdk@${sdkManifest.version} compile from tarballs`,
  );
} finally {
  const resolvedTemp = path.resolve(tempRoot);
  const resolvedOsTemp = path.resolve(os.tmpdir());
  if (!resolvedTemp.startsWith(`${resolvedOsTemp}${path.sep}`)) {
    throw new Error(`refusing to remove non-temporary path: ${resolvedTemp}`);
  }
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
}

function packageCommand(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
}
