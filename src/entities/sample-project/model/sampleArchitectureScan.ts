import type {
  DependencyEdge,
  ModuleId,
  ModuleMetrics,
  ModuleNode,
  ScanResult,
} from '@/core/analyzer/types';

const projectRoot = '/sample/archora-commerce';
export const SAMPLE_PROJECT_ID = 'sample-archora-commerce';

type SampleModuleSpec = {
  id: ModuleId;
  kind: ModuleNode['kind'];
  language: ModuleNode['language'];
  loc: number;
  exports: string[];
};

const moduleSpecs: SampleModuleSpec[] = [
  {
    id: 'src/app/App.vue',
    kind: 'component',
    language: 'vue',
    loc: 120,
    exports: ['default'],
  },
  {
    id: 'src/pages/orders/OrdersPage.vue',
    kind: 'route',
    language: 'vue',
    loc: 190,
    exports: ['default'],
  },
  {
    id: 'src/widgets/order-table/OrderTable.vue',
    kind: 'component',
    language: 'vue',
    loc: 210,
    exports: ['default'],
  },
  {
    id: 'src/features/order-filter/useOrderFilter.ts',
    kind: 'composable',
    language: 'ts',
    loc: 96,
    exports: ['useOrderFilter'],
  },
  {
    id: 'src/entities/order/model/orderStore.ts',
    kind: 'store',
    language: 'ts',
    loc: 144,
    exports: ['useOrderStore'],
  },
  {
    id: 'src/entities/order/api/orderApi.ts',
    kind: 'integration',
    language: 'ts',
    loc: 110,
    exports: ['fetchOrders'],
  },
  {
    id: 'src/shared/api/httpClient.ts',
    kind: 'integration',
    language: 'ts',
    loc: 88,
    exports: ['httpClient'],
  },
  {
    id: 'src/shared/ui/DataTable.vue',
    kind: 'component',
    language: 'vue',
    loc: 168,
    exports: ['default'],
  },
  {
    id: 'src/widgets/order-table/useOrderColumns.ts',
    kind: 'composable',
    language: 'ts',
    loc: 82,
    exports: ['useOrderColumns'],
  },
  {
    id: 'src/features/order-filter/filterSchema.ts',
    kind: 'util',
    language: 'ts',
    loc: 62,
    exports: ['orderFilterSchema'],
  },
  {
    id: 'src/shared/lib/date.ts',
    kind: 'util',
    language: 'ts',
    loc: 41,
    exports: ['formatDate'],
  },
  {
    id: 'src/pages/dashboard/DashboardPage.vue',
    kind: 'route',
    language: 'vue',
    loc: 136,
    exports: ['default'],
  },
];

const edges: DependencyEdge[] = [
  edge('src/app/App.vue', 'src/pages/orders/OrdersPage.vue', '@/pages/orders'),
  edge(
    'src/pages/orders/OrdersPage.vue',
    'src/widgets/order-table/OrderTable.vue',
    '@/widgets/order-table',
  ),
  edge(
    'src/pages/orders/OrdersPage.vue',
    'src/features/order-filter/useOrderFilter.ts',
    '@/features/order-filter',
  ),
  edge(
    'src/widgets/order-table/OrderTable.vue',
    'src/entities/order/model/orderStore.ts',
    '@/entities/order',
  ),
  edge('src/widgets/order-table/OrderTable.vue', 'src/shared/ui/DataTable.vue', '@/shared/ui'),
  edge(
    'src/widgets/order-table/OrderTable.vue',
    'src/widgets/order-table/useOrderColumns.ts',
    './useOrderColumns',
  ),
  edge(
    'src/widgets/order-table/useOrderColumns.ts',
    'src/entities/order/model/orderStore.ts',
    '@/entities/order',
  ),
  edge(
    'src/features/order-filter/useOrderFilter.ts',
    'src/features/order-filter/filterSchema.ts',
    './filterSchema',
  ),
  edge(
    'src/features/order-filter/useOrderFilter.ts',
    'src/entities/order/model/orderStore.ts',
    '@/entities/order',
  ),
  edge(
    'src/entities/order/model/orderStore.ts',
    'src/entities/order/api/orderApi.ts',
    '../api/orderApi',
  ),
  edge('src/entities/order/api/orderApi.ts', 'src/shared/api/httpClient.ts', '@/shared/api'),
  edge('src/entities/order/api/orderApi.ts', 'src/shared/lib/date.ts', '@/shared/lib/date'),
  edge('src/pages/dashboard/DashboardPage.vue', 'src/shared/ui/DataTable.vue', '@/shared/ui'),
  edge(
    'src/entities/order/model/orderStore.ts',
    'src/widgets/order-table/useOrderColumns.ts',
    '@/widgets/order-table/useOrderColumns',
  ),
  edge(
    'src/features/order-filter/filterSchema.ts',
    'src/entities/order/model/orderStore.ts',
    '@/entities/order',
  ),
];

export function buildSampleArchitectureScan(now = new Date().toISOString()): ScanResult {
  const modules = moduleSpecs.map<ModuleNode>((module) => ({
    ...module,
    absPath: `${projectRoot}/${module.id}`,
    isInfra: false,
    runtime: 'client',
  }));

  return {
    project: {
      id: SAMPLE_PROJECT_ID,
      name: 'archora-commerce',
      rootPath: projectRoot,
      detectedFramework: 'vue',
    },
    modules,
    edges,
    cycles: [
      {
        id: 'src/entities/order/model/orderStore.ts|src/widgets/order-table/useOrderColumns.ts',
        modules: [
          'src/entities/order/model/orderStore.ts',
          'src/widgets/order-table/useOrderColumns.ts',
          'src/entities/order/model/orderStore.ts',
        ],
        length: 2,
        severity: 'indirect',
      },
    ],
    metrics: buildMetrics(modules, edges),
    hotZones: [
      'src/entities/order/model/orderStore.ts',
      'src/widgets/order-table/OrderTable.vue',
      'src/features/order-filter/useOrderFilter.ts',
    ],
    layerViolations: [
      {
        edgeId:
          'src/entities/order/model/orderStore.ts->src/widgets/order-table/useOrderColumns.ts',
        from: 'src/entities/order/model/orderStore.ts',
        to: 'src/widgets/order-table/useOrderColumns.ts',
        fromLayer: 'entities',
        toLayer: 'widgets',
        severity: 'error',
      },
    ],
    archDebt: {
      score: 43,
      grade: 'C',
      breakdown: {
        cycles: 18,
        layerViolations: 14,
        hotZones: 8,
        coupling: 3,
      },
    },
    recommendations: [
      {
        id: 'sample-break-order-cycle',
        kind: 'cycle-break-cluster',
        modules: [
          'src/entities/order/model/orderStore.ts',
          'src/widgets/order-table/useOrderColumns.ts',
        ],
        params: {
          reason: 'layer violation',
          feedbackEdges: [
            {
              from: 'src/entities/order/model/orderStore.ts',
              to: 'src/widgets/order-table/useOrderColumns.ts',
              broken: 1,
              partial: false,
            },
          ],
        },
        weight: 18,
      },
      {
        id: 'sample-fix-layer-boundary',
        kind: 'misplaced-by-layer',
        modules: [
          'src/entities/order/model/orderStore.ts',
          'src/widgets/order-table/useOrderColumns.ts',
        ],
        params: {
          fromLayer: 'entities',
          toLayer: 'widgets',
        },
        weight: 14,
      },
      {
        id: 'sample-stabilize-order-store',
        kind: 'split-god-module',
        modules: ['src/entities/order/model/orderStore.ts'],
        params: {
          fanIn: 4,
          fanOut: 2,
        },
        weight: 8,
      },
    ],
    signals: [],
    insights: [],
    parserFacts: [],
    contractViolations: [],
    scannedAt: now,
    durationMs: 420,
    warnings: [],
  };
}

function edge(from: ModuleId, to: ModuleId, specifier: string): DependencyEdge {
  return {
    from,
    to,
    specifier,
    kind: 'static',
    resolved: true,
    confidence: 'high',
    resolutionKind: 'literal',
  };
}

function buildMetrics(
  modules: ModuleNode[],
  dependencyEdges: DependencyEdge[],
): Record<ModuleId, ModuleMetrics> {
  const metrics: Record<ModuleId, ModuleMetrics> = Object.fromEntries(
    modules.map((module) => [
      module.id,
      {
        fanIn: 0,
        fanOut: 0,
        instability: 0,
        depth: module.id.split('/').length - 1,
        inCycle:
          module.id === 'src/entities/order/model/orderStore.ts' ||
          module.id === 'src/widgets/order-table/useOrderColumns.ts',
        couplingScore: 0,
        hotnessScore: 0,
      },
    ]),
  );

  for (const dependency of dependencyEdges) {
    const from = metrics[dependency.from];
    const to = metrics[dependency.to];
    if (from) from.fanOut++;
    if (to) to.fanIn++;
  }

  for (const module of modules) {
    const metric = metrics[module.id];
    if (!metric) continue;
    const total = metric.fanIn + metric.fanOut;
    metric.instability = total ? Number((metric.fanOut / total).toFixed(2)) : 0;
    metric.couplingScore = metric.fanIn * 1.2 + metric.fanOut * 1.5 + (metric.inCycle ? 10 : 0);
    metric.hotnessScore = Number((metric.couplingScore + module.loc / 60).toFixed(1));
  }

  return metrics;
}
