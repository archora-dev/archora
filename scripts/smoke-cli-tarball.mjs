import { chmodSync, mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const temp = mkdtempSync(path.join(tmpdir(), 'archora-cli-smoke-'));
const fixture = path.join(root, 'fixtures/reference/vue-spa-basic');
const env = {
  ...process.env,
  npm_config_cache: path.join(temp, '.npm-cache'),
};

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: options.stdio ?? 'inherit',
    env,
  });
}

function runText(command, args, options = {}) {
  return run(command, args, { ...options, stdio: 'pipe' }).toString('utf8');
}

function assertPackedFiles(tarball) {
  const files = runText('tar', ['-tzf', tarball]).trim().split('\n').filter(Boolean);
  for (const required of ['package/package.json', 'package/README.md', 'package/dist/index.js']) {
    if (!files.includes(required)) {
      throw new Error(`CLI tarball is missing ${required}`);
    }
  }
  const forbidden = files.find((file) => {
    return (
      file.startsWith('package/src/') ||
      file.startsWith('package/fixtures/') ||
      file.startsWith('package/scripts/') ||
      file.endsWith('/tsconfig.json') ||
      file.endsWith('/vite.config.ts')
    );
  });
  if (forbidden) {
    throw new Error(`CLI tarball includes non-runtime file ${forbidden}`);
  }
}

try {
  run('npm', ['run', 'cli:build']);
  chmodSync(path.join(root, 'packages/cli/dist/index.js'), 0o755);
  const pack = JSON.parse(
    runText('npm', [
      'pack',
      '--workspace',
      '@archora/cli',
      '--pack-destination',
      temp,
      '--json',
      '--ignore-scripts',
    ]),
  );
  const filename = pack[0]?.filename;
  if (typeof filename !== 'string') {
    throw new Error('npm pack did not return a tarball filename');
  }
  const tarball = path.join(temp, filename);
  assertPackedFiles(tarball);
  run('npm', ['init', '-y'], { cwd: temp, stdio: 'ignore' });
  run('npm', ['install', `./${filename}`], { cwd: temp });

  const archora = path.join(temp, 'node_modules/.bin/archora');
  run(archora, ['--help'], { cwd: temp, stdio: 'ignore' });
  run(archora, ['analyze', fixture, '--quiet'], { cwd: temp, stdio: 'ignore' });
  run(archora, ['report', fixture, '--format', 'html', '--output', 'report.html', '--quiet'], {
    cwd: temp,
    stdio: 'ignore',
  });

  const report = path.join(temp, 'report.html');
  if (!existsSync(report) || statSync(report).size === 0) {
    throw new Error('CLI smoke did not produce a non-empty HTML report');
  }

  console.log(`CLI tarball smoke passed in ${temp}`);
} finally {
  if (process.env.ARCHORA_KEEP_SMOKE_DIR !== '1') {
    rmSync(temp, { recursive: true, force: true });
  }
}
