import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { join, relative as pathRelative, sep as pathSep } from 'node:path';
import ignore from 'ignore';
import { analyze } from '../index';
import { createNodeFsFileSource } from '../sources/nodeFsFileSource';
import { createBrowserFsAccessFileSource } from '../sources/browserFsAccessFileSource';
import { createTauriFileSource } from '../sources/tauriFileSource';
import type { ScanResult } from '../types';
import { fixturePath } from './_paths';

// analyze() must produce the same ScanResult under all three FileSource impls
// (node / browser FS Access / tauri). browser+tauri use in-process mocks here.

const REFERENCE_ROOT = fixturePath('../fixtures/reference');

const SUPPORTED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte', '.mjs', '.cjs']);

/* ------------------------------------------------------------------ */
/* Browser File System Access mock                                     */
/* ------------------------------------------------------------------ */

function makeFileHandle(absPath: string): unknown {
  return {
    kind: 'file' as const,
    name: absPath.split(pathSep).pop() ?? '',
    async getFile() {
      return {
        text: async () => readFileSync(absPath, 'utf8'),
      };
    },
  };
}

function makeDirHandle(absPath: string, name: string): unknown {
  return {
    kind: 'directory' as const,
    name,
    async *entries(): AsyncGenerator<[string, unknown]> {
      const entries: Dirent[] = readdirSync(absPath, {
        withFileTypes: true,
        encoding: 'utf8',
      });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const childAbs = join(absPath, entry.name);
        if (entry.isDirectory()) {
          yield [entry.name, makeDirHandle(childAbs, entry.name)];
        } else if (entry.isFile()) {
          yield [entry.name, makeFileHandle(childAbs)];
        }
      }
    },
    async getDirectoryHandle(child: string): Promise<unknown> {
      const childAbs = join(absPath, child);
      if (!existsSync(childAbs) || !statSync(childAbs).isDirectory()) {
        throw new Error(`No such dir: ${child}`);
      }
      return makeDirHandle(childAbs, child);
    },
    async getFileHandle(child: string): Promise<unknown> {
      const childAbs = join(absPath, child);
      if (!existsSync(childAbs) || !statSync(childAbs).isFile()) {
        throw new Error(`No such file: ${child}`);
      }
      return makeFileHandle(childAbs);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tauri invoke mock                                                   */
/* ------------------------------------------------------------------ */

function isPathEscape(rel: string): boolean {
  // mirrors read_file / file_exists in src-tauri/src/commands.rs
  if (/^(?:[a-zA-Z]:)?[\\/]/.test(rel)) return true;
  return rel.split(/[\\/]/).some((segment) => segment === '..');
}

function listTreeLikeRust(rootAbs: string): string[] {
  // mirrors read_project_tree in src-tauri/src/commands.rs
  const ig = ignore();
  const gitignore = join(rootAbs, '.gitignore');
  if (existsSync(gitignore)) {
    ig.add(readFileSync(gitignore, 'utf8'));
  }
  const out: string[] = [];
  const walk = (absDir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(absDir, entry.name);
      const rel = pathRelative(rootAbs, abs).split(pathSep).join('/');
      if (entry.isDirectory()) {
        if (ig.ignores(`${rel}/`)) continue;
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      if (ig.ignores(rel)) continue;
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
      if (!SUPPORTED_EXT.has(ext)) continue;
      out.push(rel);
    }
  };
  walk(rootAbs);
  return out.sort();
}

function buildTauriInvoke(
  rootAbs: string,
): <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> {
  return (async (cmd: string, args?: Record<string, unknown>) => {
    switch (cmd) {
      case 'read_project_tree': {
        const root = String(args?.['root'] ?? '');
        if (root !== rootAbs) throw new Error(`root mismatch: ${root}`);
        return listTreeLikeRust(root) as unknown;
      }
      case 'read_file': {
        const root = String(args?.['root'] ?? '');
        const rel = String(args?.['relative'] ?? '');
        if (isPathEscape(rel)) throw new Error('invalid relative path');
        return readFileSync(join(root, rel), 'utf8') as unknown;
      }
      case 'file_exists': {
        const root = String(args?.['root'] ?? '');
        const rel = String(args?.['relative'] ?? '');
        if (isPathEscape(rel)) throw new Error('invalid relative path');
        const abs = join(root, rel);
        return (existsSync(abs) && statSync(abs).isFile()) as unknown;
      }
      default:
        throw new Error(`unknown tauri command in mock: ${cmd}`);
    }
  }) as <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

/* ------------------------------------------------------------------ */
/* Canonicalization                                                    */
/* ------------------------------------------------------------------ */

// drop wall-clock + project.id/rootPath so only scan semantics are compared
function canonicalize(r: ScanResult) {
  const edges = r.edges
    .map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      specifier: e.specifier,
      resolved: e.resolved,
    }))
    .sort((a, b) => {
      const k = a.from.localeCompare(b.from);
      if (k !== 0) return k;
      const t = a.to.localeCompare(b.to);
      if (t !== 0) return t;
      const kk = a.kind.localeCompare(b.kind);
      if (kk !== 0) return kk;
      return a.specifier.localeCompare(b.specifier);
    });

  const modules = r.modules
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      language: m.language,
      loc: m.loc,
      exports: [...m.exports].sort(),
      isInfra: m.isInfra,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const cycles = r.cycles
    .map((c) => ({
      length: c.length,
      severity: c.severity,
      modules: [...c.modules].sort(),
    }))
    .sort((a, b) => a.modules[0]!.localeCompare(b.modules[0]!));

  const recommendations = r.recommendations
    .map((rec) => ({
      id: rec.id,
      kind: rec.kind,
      modules: [...rec.modules].sort(),
      weight: rec.weight,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const layerViolations = [...r.layerViolations]
    .map((v) => ({ from: v.from, to: v.to, fromLayer: v.fromLayer, toLayer: v.toLayer }))
    .sort((a, b) => {
      const k = a.from.localeCompare(b.from);
      return k !== 0 ? k : a.to.localeCompare(b.to);
    });

  const hotZones = [...r.hotZones].sort();

  // round metrics to 3 decimals to dodge iteration-order FP drift
  type CanonMetric = {
    fanIn: number;
    fanOut: number;
    instability: number;
    depth: number;
    inCycle: boolean;
    couplingScore: number;
    hotnessScore: number;
  };
  const metricEntries: Array<[string, CanonMetric]> = Object.entries(r.metrics).map(([id, m]) => [
    id,
    {
      fanIn: m.fanIn,
      fanOut: m.fanOut,
      instability: Math.round(m.instability * 1000) / 1000,
      depth: m.depth,
      inCycle: m.inCycle,
      couplingScore: Math.round(m.couplingScore * 1000) / 1000,
      hotnessScore: Math.round(m.hotnessScore * 1000) / 1000,
    },
  ]);
  metricEntries.sort((a, b) => a[0].localeCompare(b[0]));
  const metrics = Object.fromEntries(metricEntries);

  return {
    framework: r.project.detectedFramework,
    modules,
    edges,
    cycles,
    recommendations,
    layerViolations,
    hotZones,
    metrics,
    archDebt: {
      grade: r.archDebt.grade,
      score: r.archDebt.score,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Test grid                                                           */
/* ------------------------------------------------------------------ */

function listReferenceProjects(): string[] {
  try {
    return readdirSync(REFERENCE_ROOT)
      .filter((name) => {
        const full = join(REFERENCE_ROOT, name);
        try {
          return statSync(full).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

const projects = listReferenceProjects();

describe.skipIf(projects.length === 0)('cross-source consistency', () => {
  for (const name of projects) {
    it(`${name}: Node / Browser / Tauri sources agree`, async () => {
      await assertSourcesAgree(join(REFERENCE_ROOT, name), name);
    });
  }
});

// reference fixtures don't ship a .gitignore - copy one over in a tempdir
describe('cross-source gitignore parity', () => {
  it('.gitignore applies equally on a non-git fixture', async () => {
    const fixture = fixturePath('../fixtures/reference/vue-spa-basic');
    const { mkdtempSync, cpSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const tmp = mkdtempSync(join(tmpdir(), 'archora-gi-'));
    try {
      cpSync(fixture, tmp, { recursive: true });
      writeFileSync(join(tmp, '.gitignore'), 'src/views/\n', 'utf8');
      await assertSourcesAgree(tmp, 'vue-spa-basic+gitignore');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

async function assertSourcesAgree(rootAbs: string, label: string): Promise<void> {
  const nodeSource = await createNodeFsFileSource({ rootPath: rootAbs });
  const browserSource = await createBrowserFsAccessFileSource({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rootHandle: makeDirHandle(rootAbs, label) as any,
  });
  const tauriSource = await createTauriFileSource({
    rootPath: rootAbs,
    invoke: buildTauriInvoke(rootAbs),
  });

  const [nodeResult, browserResult, tauriResult] = await Promise.all([
    analyze(nodeSource),
    analyze(browserSource),
    analyze(tauriSource),
  ]);

  const nodeCanon = canonicalize(nodeResult);
  const browserCanon = canonicalize(browserResult);
  const tauriCanon = canonicalize(tauriResult);

  expect(browserCanon, `[${label}] Browser vs Node mismatch`).toEqual(nodeCanon);
  expect(tauriCanon, `[${label}] Tauri vs Node mismatch`).toEqual(nodeCanon);
}
