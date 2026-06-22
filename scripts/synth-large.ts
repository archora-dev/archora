/**
 * Synthetic project generator for scale benchmarks.
 *
 * Produces a realistic TypeScript/Vue structure:
 *   - 70% leaf utils (.ts), importing 1–3 neighbors from the same folder
 *   - 20% intermediate (.ts/.vue), importing 2–6 leaves and 0–2 intermediates
 *   - 10% entry-like (router/store/main), importing intermediate nodes
 *   - ~5% cycles: A→B→C→A (length 3) over random triples of intermediate nodes
 *   - Layered structure: shared/ → entities/ → features/ → widgets/ → pages/ → app/
 *
 * Reproducibility: fixed seed → identical structure across runs.
 *
 * Usage:
 *   npx vite-node scripts/synth-large.ts -- --size 3000 --out tmp/synth-3k
 *   npx vite-node scripts/synth-large.ts -- --size 30000 --out tmp/synth-30k
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const LAYERS = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'] as const;
type Layer = (typeof LAYERS)[number];

// Note: layer index = position in LAYERS. Imports are allowed only top-down
// (`pages` → `widgets` → `features` → `entities` → `shared`). Higher layers
// cannot be imported from lower ones — this yields a clean DAG; cycles are
// added later in a separate step so they show up as "violations".
const LAYER_INDEX: Record<Layer, number> = {
  shared: 0,
  entities: 1,
  features: 2,
  widgets: 3,
  pages: 4,
  app: 5,
};

interface Module {
  id: string; // relative path without extension
  ext: '.ts' | '.vue';
  layer: Layer;
  feature: string; // 'auth', 'billing', ...
  imports: string[]; // ids of modules to import
}

// Simple seedable PRNG (mulberry32) for reproducibility.
function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function pickN<T>(arr: readonly T[], n: number, rand: () => number): T[] {
  if (arr.length <= n) return [...arr];
  const out: T[] = [];
  const used = new Set<number>();
  while (out.length < n) {
    const i = Math.floor(rand() * arr.length);
    if (used.has(i)) continue;
    used.add(i);
    out.push(arr[i] as T);
  }
  return out;
}

function generate(size: number, seed = 42): Module[] {
  const rand = rng(seed);
  const modules: Module[] = [];

  // Distribution across layers and features. At N=10k this is ~6 layers × 10 features × ~166 modules.
  const featureCount = Math.max(4, Math.min(40, Math.round(size / 250)));
  const features = Array.from({ length: featureCount }, (_, i) => `feature-${i}`);

  // Base layers: shared 35%, entities 20%, features 25%, widgets 10%, pages 8%, app 2%.
  const layerWeights: Record<Layer, number> = {
    shared: 0.35,
    entities: 0.2,
    features: 0.25,
    widgets: 0.1,
    pages: 0.08,
    app: 0.02,
  };

  // 1) Build the module list with layer/feature/ext by weights.
  for (let i = 0; i < size; i++) {
    const r = rand();
    let acc = 0;
    let layer: Layer = 'shared';
    for (const l of LAYERS) {
      acc += layerWeights[l];
      if (r < acc) {
        layer = l;
        break;
      }
    }
    const feature = pick(features, rand);
    // .vue only for widgets/pages/app, everything else is .ts
    const ext: '.ts' | '.vue' =
      layer === 'widgets' || layer === 'pages' || layer === 'app'
        ? rand() < 0.6
          ? '.vue'
          : '.ts'
        : '.ts';
    const id = `src/${layer}/${feature}/m-${i}`;
    modules.push({ id, ext, layer, feature, imports: [] });
  }

  // 2) Import distribution: each module imports 1–6 modules from the
  //    "lower" layers (by the DAG rule). 70% within the same feature
  //    (cohesion), 30% cross-feature.
  const byLayer = new Map<Layer, Module[]>();
  for (const l of LAYERS) byLayer.set(l, []);
  for (const m of modules) byLayer.get(m.layer)!.push(m);

  for (const m of modules) {
    const importCount =
      m.layer === 'shared'
        ? Math.floor(rand() * 2) // shared rarely imports other shared
        : 1 + Math.floor(rand() * 5);
    const lowerLayers = LAYERS.filter((l) => LAYER_INDEX[l] < LAYER_INDEX[m.layer]);
    const candidates: Module[] = [];
    for (const l of lowerLayers) {
      const pool = byLayer.get(l)!;
      // Same feature — add all; otherwise a random sample
      const same = pool.filter((x) => x.feature === m.feature);
      const other = pool.filter((x) => x.feature !== m.feature);
      candidates.push(...same);
      candidates.push(...pickN(other, Math.min(20, other.length), rand));
    }
    if (candidates.length === 0) continue;
    const picks = pickN(candidates, Math.min(importCount, candidates.length), rand);
    m.imports = picks.map((p) => p.id);
  }

  // 3) Add cycles (~5% of feature triples get a cycle A→B→C→A among
  //    intermediate nodes of one feature). Cycles are drawn on top of the
  //    DAG: one of the edges goes back up across layers (this emulates real
  //    barrel cycles and compose cycles).
  const cycleCount = Math.max(1, Math.round(size * 0.005));
  const intermediateLayers: Layer[] = ['entities', 'features', 'widgets'];
  for (let c = 0; c < cycleCount; c++) {
    const feature = pick(features, rand);
    const pool = modules.filter(
      (m) => m.feature === feature && intermediateLayers.includes(m.layer),
    );
    if (pool.length < 3) continue;
    const trio = pickN(pool, 3, rand);
    if (trio.length < 3) continue;
    const [a, b, ccc] = trio as [Module, Module, Module];
    // A imports B, B imports C, C imports A — no DAG check, so a real
    // cycle is formed.
    if (!a.imports.includes(b.id)) a.imports.push(b.id);
    if (!b.imports.includes(ccc.id)) b.imports.push(ccc.id);
    if (!ccc.imports.includes(a.id)) ccc.imports.push(a.id);
  }

  return modules;
}

function fileContent(m: Module, idToModule: Map<string, Module>): string {
  const importLines = m.imports
    .map((id) => {
      const dep = idToModule.get(id);
      if (!dep) return '';
      // Always a relative path from the current file to the dependency.
      const fromParts = m.id.split('/');
      const toParts = dep.id.split('/');
      // Find the common prefix
      let i = 0;
      while (i < fromParts.length - 1 && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++;
      const upCount = fromParts.length - 1 - i;
      const ups = upCount > 0 ? '../'.repeat(upCount) : './';
      const rel = ups + toParts.slice(i).join('/');
      // Import via the named export `m` by default (for a clean parse).
      return `import { m as m${cleanName(dep.id)} } from '${rel}';`;
    })
    .filter(Boolean)
    .join('\n');

  if (m.ext === '.vue') {
    return `<script setup lang="ts">
${importLines}
const m = 1;
</script>

<template>
  <div>${m.id}</div>
</template>
`;
  }
  return `${importLines}

export const m = ${m.imports.length};
`;
}

function cleanName(id: string): string {
  return id.replace(/[/-]/gu, '_');
}

async function writeProject(modules: Module[], outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const idToModule = new Map<string, Module>();
  for (const m of modules) idToModule.set(m.id, m);

  // package.json + tsconfig.json — needed for a proper scan
  await writeFile(
    join(outDir, 'package.json'),
    JSON.stringify(
      {
        name: 'synth-large',
        private: true,
        version: '0.0.0',
        type: 'module',
        dependencies: { vue: '^3.5.0' },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(outDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          jsx: 'preserve',
          paths: { '@/*': ['src/*'] },
          baseUrl: '.',
        },
        include: ['src'],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(outDir, 'vite.config.ts'),
    `import { defineConfig } from 'vite';\nexport default defineConfig({ resolve: { alias: { '@': '/src' } } });\n`,
  );

  // Group by folder and write in batches
  const dirsCreated = new Set<string>();
  for (const m of modules) {
    const fullPath = join(outDir, m.id + m.ext);
    const dir = dirname(fullPath);
    if (!dirsCreated.has(dir)) {
      await mkdir(dir, { recursive: true });
      dirsCreated.add(dir);
    }
    await writeFile(fullPath, fileContent(m, idToModule));
  }
}

interface Args {
  size: number;
  out: string;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { size: 3000, out: '', seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--size') args.size = Number(argv[++i]);
    else if (a === '--out') args.out = String(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
  }
  if (!args.out) args.out = join(REPO_ROOT, 'tmp', `synth-${args.size}`);
  return args;
}

export async function generateSynthProject(size: number, outDir: string, seed = 42): Promise<void> {
  const modules = generate(size, seed);
  await writeProject(modules, outDir);
}

export async function ensureSynthProject(size: number, seed = 42): Promise<string> {
  const outDir = join(REPO_ROOT, 'tmp', `synth-${size}`);
  if (existsSync(join(outDir, 'package.json'))) return outDir;
  await generateSynthProject(size, outDir, seed);
  return outDir;
}

// CLI entry
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  console.log(`generating synth project: size=${args.size} out=${args.out}`);
  const t0 = Date.now();
  generateSynthProject(args.size, args.out, args.seed).then(() => {
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  });
}
