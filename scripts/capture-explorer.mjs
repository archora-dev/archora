/* global process */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT_DIR = resolve(
  process.env.ARCHORA_SCREENSHOT_OUT_DIR ?? 'screenshots/architecture-explorer',
);
const DEFAULT_PORT = 6177;
const BASE_URL = process.env.FRONTSCOPE_EXPLORER_BASE_URL ?? `http://127.0.0.1:${DEFAULT_PORT}`;
const APP_URL = withSearchParam(BASE_URL, 'archoraVisualSmoke', '1');
const VIEWPORT = { width: 1440, height: 1000 };

mkdirSync(OUT_DIR, { recursive: true });

const server = process.env.FRONTSCOPE_EXPLORER_BASE_URL ? null : await startVite(DEFAULT_PORT);
const browser = await chromium.launch({ headless: true });

try {
  await captureStartupShell();

  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  page.on('console', (msg) => {
    if (/error|warn/iu.test(msg.type())) console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  await loadArchitectureWorkspace(page);
  await capture(page, 'overview-normal.png');

  await page.setViewportSize({ width: 1366, height: 950 });
  await settle(page);
  await capture(page, 'overview-1366.png');

  await page.setViewportSize({ width: 1280, height: 920 });
  await settle(page);
  await capture(page, 'overview-1280.png');

  await page.setViewportSize(VIEWPORT);
  await settle(page);

  await openTab(page, 'explorer');
  await byTestId(page, 'architecture-row-src/features/auth').click();
  await settle(page);
  await capture(page, 'explorer-selected-row-inspector.png');

  await openTab(page, 'matrix');
  await byTestId(page, 'architecture-matrix-cell-shared/api-features/auth').click();
  await settle(page);
  await capture(page, 'matrix-selected-cell-inspector.png');

  await byTestId(page, 'architecture-select-matrix-mode').click();
  await settle(page);
  await capture(page, 'matrix-dropdown-open.png');

  await openTab(page, 'cycles');
  await byTestId(page, 'architecture-cycle-cycle:auth').click();
  await settle(page);
  await capture(page, 'cycles-selected-cycle.png');

  await openTab(page, 'hotspots');
  await byTestId(page, 'architecture-hotspot-src/features/auth/model/session.ts').click();
  await settle(page);
  await capture(page, 'hotspots-selected-row-inspector.png');

  await openTab(page, 'impact');
  await capture(page, 'impact-selected-target-inspector.png');

  await openTab(page, 'rules');
  await byTestId(page, 'architecture-rule-shared-to-feature').click();
  await settle(page);
  await capture(page, 'rules-violations-inspector.png');

  await setScan(page, scanWithoutRuleViolations());
  await openTab(page, 'rules');
  await capture(page, 'rules-no-violations-empty-state.png');

  console.log(`Captured Architecture Explorer screenshots in ${OUT_DIR}`);
} finally {
  await browser.close();
  if (server) await stopProcess(server);
}

async function captureStartupShell() {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.route('**/src/main.ts', (route) => route.abort());
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await capture(page, 'startup-loading.png');
  await page.close();
}

async function loadArchitectureWorkspace(page) {
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45_000 });
  await page.waitForFunction(() => window.__FS_PROJECT_STORE__ && window.__FS_SCAN_STORE__);
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important;}',
  });
  await setScan(page, scanFixture());
  await page.waitForSelector('[data-test="architecture-tab-overview"]', { timeout: 20_000 });
  await settle(page);
}

async function setScan(page, scan) {
  await page.evaluate(async (nextScan) => {
    const project = window.__FS_PROJECT_STORE__();
    const scanStore = window.__FS_SCAN_STORE__();
    project.setCurrent(nextScan.project);
    scanStore.complete(nextScan);
    const router = window.__FS_APP__?.config.globalProperties.$router;
    if (router) {
      await router.push(`/project/${nextScan.project.id}`);
    } else {
      window.history.pushState({}, '', `/project/${nextScan.project.id}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, scan);
  await settle(page);
}

async function openTab(page, tab) {
  await byTestId(page, `architecture-tab-${tab}`).click();
  await settle(page);
}

function byTestId(page, id) {
  return page.locator(`[data-test="${id}"]`);
}

async function capture(page, fileName) {
  await settle(page);
  await assertStableWorkspaceLayout(page, fileName);
  await page.screenshot({
    path: resolve(OUT_DIR, fileName),
    fullPage: false,
    animations: 'disabled',
  });
  console.log(`wrote ${fileName}`);
}

async function assertStableWorkspaceLayout(page, label) {
  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const viewportWidth = doc.clientWidth;
    const horizontalOverflow = Math.max(doc.scrollWidth, body.scrollWidth) - viewportWidth;
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        styles.visibility !== 'hidden' &&
        styles.display !== 'none'
      );
    };
    const inspector = Array.from(document.querySelectorAll('.inspector-panel')).find(visible);
    const workbench = Array.from(
      document.querySelectorAll(
        '.table-card, .matrix-panel, .cycle-list-panel, .impact-screen > .screen-stack',
      ),
    ).find(visible);
    let overlap = false;
    if (inspector && workbench) {
      const a = inspector.getBoundingClientRect();
      const b = workbench.getBoundingClientRect();
      overlap = !(b.right <= a.left || a.right <= b.left || b.bottom <= a.top || a.bottom <= b.top);
    }
    return {
      horizontalOverflow,
      overlap,
      viewportWidth,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
    };
  });

  if (report.horizontalOverflow > 2) {
    throw new Error(
      `${label}: global horizontal overflow ${report.horizontalOverflow}px, viewport ${report.viewportWidth}px, doc ${report.docScrollWidth}px, body ${report.bodyScrollWidth}px`,
    );
  }
  if (report.overlap) {
    throw new Error(`${label}: visible workbench and inspector overlap`);
  }
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(120);
}

async function startVite(port) {
  if (await canFetch(BASE_URL)) return null;

  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite exited with ${child.exitCode}`);
    if (await canFetch(BASE_URL)) return child;
    await sleep(250);
  }
  throw new Error(`vite did not become ready at ${BASE_URL}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await new Promise((resolveStop) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      resolveStop();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolveStop();
    });
  });
}

async function canFetch(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function withSearchParam(url, key, value) {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function scanFixture() {
  return {
    project: {
      id: 'architecture-explorer-demo',
      name: 'Architecture Explorer Demo',
      rootPath: '/demo/archora',
      detectedFramework: 'vue',
    },
    modules: [
      moduleNode('src/app/main.ts', 'entry', 80),
      moduleNode('src/pages/project/ProjectPage.vue', 'route', 180, 'vue'),
      moduleNode('src/widgets/dashboard/ui/DashboardWidget.vue', 'component', 140, 'vue'),
      moduleNode('src/features/auth/model/session.ts', 'store', 120),
      moduleNode('src/features/auth/api/auth-service.ts', 'integration', 95),
      moduleNode('src/entities/user/model/user.ts', 'store', 70),
      moduleNode('src/shared/api/client.ts', 'integration', 110),
      moduleNode('src/shared/ui/Button.vue', 'component', 60, 'vue'),
      moduleNode('src/legacy/orphan.ts', 'util', 35),
    ],
    edges: [
      edge('src/app/main.ts', 'src/pages/project/ProjectPage.vue'),
      edge('src/pages/project/ProjectPage.vue', 'src/widgets/dashboard/ui/DashboardWidget.vue'),
      edge('src/widgets/dashboard/ui/DashboardWidget.vue', 'src/features/auth/model/session.ts'),
      edge('src/features/auth/model/session.ts', 'src/features/auth/api/auth-service.ts'),
      edge('src/features/auth/api/auth-service.ts', 'src/shared/api/client.ts'),
      edge('src/shared/api/client.ts', 'src/features/auth/model/session.ts'),
      edge('src/features/auth/model/session.ts', 'src/entities/user/model/user.ts', 'type-only'),
      edge('src/shared/ui/Button.vue', 'src/shared/api/client.ts'),
    ],
    cycles: [
      {
        id: 'cycle:auth',
        modules: [
          'src/features/auth/model/session.ts',
          'src/features/auth/api/auth-service.ts',
          'src/shared/api/client.ts',
        ],
        length: 3,
        severity: 'indirect',
      },
    ],
    metrics: {
      'src/app/main.ts': metric({ fanOut: 1, couplingScore: 8 }),
      'src/pages/project/ProjectPage.vue': metric({ fanIn: 1, fanOut: 1, couplingScore: 12 }),
      'src/widgets/dashboard/ui/DashboardWidget.vue': metric({
        fanIn: 1,
        fanOut: 1,
        couplingScore: 16,
      }),
      'src/features/auth/model/session.ts': metric({
        fanIn: 2,
        fanOut: 2,
        inCycle: true,
        couplingScore: 34,
        hotnessScore: 28,
      }),
      'src/features/auth/api/auth-service.ts': metric({
        fanIn: 1,
        fanOut: 1,
        inCycle: true,
        couplingScore: 18,
        hotnessScore: 12,
      }),
      'src/entities/user/model/user.ts': metric({ fanIn: 1, couplingScore: 6 }),
      'src/shared/api/client.ts': metric({
        fanIn: 2,
        fanOut: 1,
        inCycle: true,
        couplingScore: 30,
        hotnessScore: 22,
      }),
      'src/shared/ui/Button.vue': metric({ fanOut: 1, couplingScore: 6 }),
      'src/legacy/orphan.ts': metric(),
    },
    hotZones: ['src/features/auth/model/session.ts', 'src/shared/api/client.ts'],
    layerViolations: [
      {
        edgeId: 'shared-to-feature',
        from: 'src/shared/api/client.ts',
        to: 'src/features/auth/model/session.ts',
        fromLayer: 'shared',
        toLayer: 'features',
        severity: 'error',
      },
    ],
    archDebt: {
      score: 54,
      grade: 'C',
      breakdown: { cycles: 16, layerViolations: 18, hotZones: 12, coupling: 8 },
    },
    recommendations: [],
    contractViolations: [
      {
        id: 'contract:shared-api-boundary',
        ruleName: 'Shared API boundary',
        kind: 'boundary',
        severity: 'warning',
        modules: ['src/shared/api/client.ts', 'src/features/auth/model/session.ts'],
        edge: {
          from: 'src/shared/api/client.ts',
          to: 'src/features/auth/model/session.ts',
          kind: 'static',
          specifier: 'src/features/auth/model/session.ts',
          resolved: true,
        },
      },
    ],
    scannedAt: '2026-05-11T00:00:00.000Z',
    durationMs: 42,
    warnings: [],
  };
}

function scanWithoutRuleViolations() {
  const scan = scanFixture();
  return {
    ...scan,
    layerViolations: [],
    contractViolations: [],
    archDebt: {
      score: 24,
      grade: 'B',
      breakdown: { cycles: 12, layerViolations: 0, hotZones: 8, coupling: 4 },
    },
  };
}

function moduleNode(id, kind = 'util', loc = 60, language = 'ts') {
  return {
    id,
    absPath: `/demo/archora/${id}`,
    kind,
    language,
    loc,
    exports: [],
    isInfra: false,
  };
}

function edge(from, to, kind = 'static') {
  return { from, to, kind, specifier: to, resolved: true };
}

function metric(overrides = {}) {
  return {
    fanIn: 0,
    fanOut: 0,
    instability: 0,
    depth: 0,
    inCycle: false,
    couplingScore: 0,
    hotnessScore: 0,
    ...overrides,
  };
}
