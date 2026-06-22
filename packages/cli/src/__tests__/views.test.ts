import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgv } from '../argv';
import { runExplain } from '../commands/explain';
import { runImpact } from '../commands/impact';
import { runMatrix } from '../commands/matrix';
import { runHygiene } from '../commands/hygiene';
import { runOwnership } from '../commands/ownership';
import { runReview } from '../commands/review';
import { runSemantic } from '../commands/semantic';
import { runTrend } from '../commands/trend';
import type { ScanResult } from '@archora/core';

describe('cli analyzer views', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders matrix, impact and explain from an existing scan JSON', async () => {
    const scanPath = await writeScan(scanFixture());
    const out = captureStdout();

    await expect(
      runMatrix(parseArgv(['matrix', '--input', scanPath, '--format', 'json', '--quiet'])),
    ).resolves.toBe(0);
    expect(JSON.parse(out.flush())).toMatchObject({
      grouping: 'area',
      summary: { modules: 2, violations: 1 },
    });

    await expect(
      runMatrix(parseArgv(['matrix', '--input', scanPath, '--format', 'md', '--quiet'])),
    ).resolves.toBe(0);
    const matrixMarkdown = out.flush();
    expect(matrixMarkdown).toContain('## Cell imports');
    expect(matrixMarkdown).toContain(
      '`src/features/auth/model/session.ts` -> `src/pages/login/Page.ts`',
    );
    expect(matrixMarkdown).toContain('violation, cycle');

    await expect(
      runImpact(
        parseArgv([
          'impact',
          '--input',
          scanPath,
          '--module',
          'session',
          '--format',
          'md',
          '--quiet',
        ]),
      ),
    ).resolves.toBe(0);
    expect(out.flush()).toContain('Metrics: fan-in **1**, fan-out **1**');

    await expect(
      runExplain(parseArgv(['explain', '--input', scanPath, '--base', scanPath, '--quiet'])),
    ).resolves.toBe(0);
    expect(out.flush()).toContain('## Baseline');

    await expect(
      runExplain(
        parseArgv([
          'explain',
          '--input',
          scanPath,
          '--cycle',
          'cycle:auth',
          '--format',
          'md',
          '--quiet',
        ]),
      ),
    ).resolves.toBe(0);
    const cycleMarkdown = out.flush();
    expect(cycleMarkdown).toContain('## Cycle scope');
    expect(cycleMarkdown).toContain('## Cycle path');
    expect(cycleMarkdown).toContain(
      '`src/features/auth/model/session.ts` -> `src/pages/login/Page.ts`',
    );
    expect(cycleMarkdown).toContain('Suggested break');

    await expect(
      runReview(parseArgv(['review', '--input', scanPath, '--format', 'md', '--quiet'])),
    ).resolves.toBe(0);
    const reviewMarkdown = out.flush();
    expect(reviewMarkdown).toContain('# Review risk - project');
    expect(reviewMarkdown).toContain('## Guided review');
    expect(reviewMarkdown).toContain('## Review checklist');
    expect(reviewMarkdown).toContain('Break direct cycle cycle:auth');

    await expect(
      runReview(
        parseArgv(['review', '--input', scanPath, '--base', scanPath, '--format', 'md', '--quiet']),
      ),
    ).resolves.toBe(0);
    expect(out.flush()).toContain('| New cycles | 0 |');

    await expect(
      runOwnership(parseArgv(['ownership', '--input', scanPath, '--format', 'md', '--quiet'])),
    ).resolves.toBe(0);
    expect(out.flush()).toContain('# Ownership map - project');

    await expect(
      runSemantic(parseArgv(['semantic', '--input', scanPath, '--format', 'md', '--quiet'])),
    ).resolves.toBe(0);
    expect(out.flush()).toContain('## Broad public modules');

    await expect(
      runHygiene(parseArgv(['hygiene', '--input', scanPath, '--format', 'md', '--quiet'])),
    ).resolves.toBe(0);
    const hygieneMarkdown = out.flush();
    expect(hygieneMarkdown).toContain('# Lifecycle hygiene - project');
    expect(hygieneMarkdown).toContain('| Memory risks | 1 |');
    expect(hygieneMarkdown).toContain('| Async lifecycle risks | 1 |');
    expect(hygieneMarkdown).toContain('| Side-effect owners | 1 |');
    expect(hygieneMarkdown).toContain('## Side-effect ownership');
    expect(hygieneMarkdown).toContain(
      '| `src/features/auth/model/session.ts` | src/features/auth | features | store | owned | 1 | 1 |',
    );
    expect(hygieneMarkdown).toContain('## Lifecycle risk modules');
    expect(hygieneMarkdown).toContain('src/features/auth/model/session.ts');

    await expect(
      runTrend(
        parseArgv(['trend', '--input', scanPath, '--base', scanPath, '--format', 'md', '--quiet']),
      ),
    ).resolves.toBe(0);
    expect(out.flush()).toContain('# Architecture trend - project');
  });

  it('returns usage error for missing explain targets', async () => {
    const scanPath = await writeScan(scanFixture());
    const err = captureStderr();

    await expect(
      runExplain(parseArgv(['explain', '--input', scanPath, '--signal', 'missing', '--quiet'])),
    ).resolves.toBe(2);

    expect(err.flush()).toContain('signal not found');
  });

  it('renders a compact PR comment with stable update markers', async () => {
    const currentPath = await writeScan({
      ...scanFixture(),
      hotZones: ['src/features/auth/model/session.ts'],
    });
    const baselinePath = await writeScan({
      ...scanFixture(),
      cycles: [],
      archDebt: {
        score: 5,
        grade: 'A',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 0, coupling: 0 },
      },
    });
    const out = captureStdout();

    await expect(
      runReview(
        parseArgv([
          'review',
          '--input',
          currentPath,
          '--base',
          baselinePath,
          '--pr-comment',
          '--changed-files',
          'src/features/auth/model/session.ts',
          '--quiet',
        ]),
      ),
    ).resolves.toBe(0);

    const markdown = out.flush();
    expect(markdown).toContain('<!-- archora:review:start -->');
    expect(markdown).toContain('<!-- archora:review:end -->');
    expect(markdown).toContain('## Archora PR review');
    expect(markdown).toContain('| New cycles | 1 |');
    expect(markdown).toContain('## Changed-file focus');
    expect(markdown).toContain('| Violations | 1 |');
    expect(markdown).toContain('| Hotspots | 1 |');
    expect(markdown).toContain('| Affected areas/owners | `features/auth`, `pages/login` |');
    expect(markdown).toContain('Review first');
    expect(markdown).toContain('src/features/auth/model/session.ts');
    expect(markdown).not.toContain('## Review checklist');
  });

  it('adds an impact command for hotspot-only PR comments', async () => {
    const currentPath = await writeScan({
      ...scanFixture(),
      cycles: [],
      layerViolations: [],
      metrics: {
        'src/pages/login/Page.ts': metric({ fanIn: 2, fanOut: 4 }),
        'src/features/auth/model/session.ts': metric({ fanIn: 9, fanOut: 1 }),
      },
      hotZones: ['src/features/auth/model/session.ts'],
      archDebt: {
        score: 12,
        grade: 'A',
        breakdown: { cycles: 0, layerViolations: 0, hotZones: 1, coupling: 0 },
      },
    });
    const out = captureStdout();

    await expect(
      runReview(parseArgv(['review', '--input', currentPath, '--pr-comment', '--quiet'])),
    ).resolves.toBe(0);

    const markdown = out.flush();
    expect(markdown).toContain('Review first');
    expect(markdown).toContain('archora impact --module src/features/auth/model/session.ts');
    expect(markdown).toContain('fan-in 9');
  });
});

function captureStdout(): { flush(): string } {
  let output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  return {
    flush() {
      const value = output;
      output = '';
      return value;
    },
  };
}

function captureStderr(): { flush(): string } {
  let output = '';
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  return {
    flush() {
      const value = output;
      output = '';
      return value;
    },
  };
}

async function writeScan(scan: ScanResult): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'archora-cli-views-'));
  const path = join(dir, 'scan.json');
  await writeFile(path, JSON.stringify(scan), 'utf-8');
  return path;
}

function scanFixture(): ScanResult {
  return {
    project: { id: 'p', name: 'project', rootPath: '/repo', detectedFramework: 'generic' },
    modules: [
      moduleNode('src/pages/login/Page.ts', 'route'),
      moduleNode('src/features/auth/model/session.ts', 'store', [
        'session',
        'sessionStore',
        'useSession',
        'login',
        'logout',
        'refresh',
        'selectUser',
        'selectToken',
      ]),
    ],
    edges: [
      edge('src/pages/login/Page.ts', 'src/features/auth/model/session.ts'),
      edge('src/features/auth/model/session.ts', 'src/pages/login/Page.ts'),
    ],
    cycles: [
      {
        id: 'cycle:auth',
        modules: ['src/pages/login/Page.ts', 'src/features/auth/model/session.ts'],
        length: 2,
        severity: 'direct',
      },
    ],
    metrics: {
      'src/pages/login/Page.ts': metric({ inCycle: true }),
      'src/features/auth/model/session.ts': metric({ inCycle: true }),
    },
    hotZones: [],
    layerViolations: [
      {
        edgeId: 'src/features/auth/model/session.ts\u0001src/pages/login/Page.ts',
        from: 'src/features/auth/model/session.ts',
        to: 'src/pages/login/Page.ts',
        fromLayer: 'features',
        toLayer: 'pages',
        severity: 'warning',
      },
    ],
    archDebt: {
      score: 30,
      grade: 'B',
      breakdown: { cycles: 1, layerViolations: 1, hotZones: 0, coupling: 1 },
    },
    recommendations: [],
    contractViolations: [],
    memoryRisks: [
      {
        id: 'memory:event-listener-cleanup:src/features/auth/model/session.ts:3',
        kind: 'event-listener-cleanup',
        moduleId: 'src/features/auth/model/session.ts',
        severity: 'medium',
        confidence: 'high',
        evidence: [
          {
            message: 'addEventListener has no visible removeEventListener cleanup',
            line: 3,
            acquire: 'addEventListener',
            expectedCleanup: 'removeEventListener',
          },
        ],
        remediation: 'Remove the listener from the matching component teardown lifecycle.',
      },
    ],
    asyncLifecycleRisks: [
      {
        id: 'async-lifecycle:async-effect-cleanup:src/features/auth/model/session.ts:4',
        kind: 'async-effect-cleanup',
        moduleId: 'src/features/auth/model/session.ts',
        severity: 'medium',
        confidence: 'high',
        evidence: [
          {
            message: 'async lifecycle work has no visible abort, stale guard, or cleanup',
            line: 4,
            asyncSource: 'fetch',
            expectedGuard: 'AbortController or stale guard cleanup',
          },
        ],
        remediation:
          'Add AbortController, a stale-result guard, or lifecycle cleanup before updating state.',
      },
    ],
    scannedAt: '2026-05-20T00:00:00.000Z',
    durationMs: 1,
    warnings: [],
  };
}

function moduleNode(
  id: string,
  kind: ScanResult['modules'][number]['kind'],
  exports: string[] = [],
): ScanResult['modules'][number] {
  return {
    id,
    absPath: `/repo/${id}`,
    kind,
    language: 'ts',
    loc: 10,
    exports,
    isInfra: false,
  };
}

function edge(from: string, to: string): ScanResult['edges'][number] {
  return { from, to, kind: 'static', specifier: to, resolved: true };
}

function metric(
  overrides: Partial<ScanResult['metrics'][string]> = {},
): ScanResult['metrics'][string] {
  return {
    fanIn: 1,
    fanOut: 1,
    instability: 0.5,
    depth: 0,
    inCycle: false,
    couplingScore: 1,
    hotnessScore: 2,
    ...overrides,
  };
}
