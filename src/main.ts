import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from '@/app/App.vue';
import { router } from '@/app/router';
import { markStartup, markStartupAt } from '@/shared/lib/startupTiming';
import { addDiagnostic, installDiagnostics } from '@/shared/lib/diagnostics';
import { applyInitialTheme } from '@/app/providers/themeProvider';
import { useToast } from '@/shared/ui';
import '@fontsource-variable/inter/index.css';
import '@archora/ui/styles.css';
import '@/app/styles/index.css';

type StartupWindow = Window & {
  __frontScopeMainImportAt?: number;
  __frontScopeAppMountAt?: number;
};

const startupWindow = window as StartupWindow;
installDiagnostics(window);
startupWindow.__frontScopeMainImportAt = performance.now();
const navigation = performance.getEntriesByType('navigation')[0] as
  | PerformanceNavigationTiming
  | undefined;
markStartupAt('page load started', navigation?.startTime ?? 0, navigation?.type);
performance.mark('archora:main-ts-imported');
performance.mark('archora:vue-mount-start');
markStartup('app start');
markStartup('webview ready', document.readyState);
markStartup('main.ts imported');
markStartup('vue mount start');

applyInitialTheme();
markStartup('theme initial applied');

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

if (import.meta.env.DEV) {
  const devWindow = window as StartupWindow & {
    __FS_APP__?: typeof app;
    __FS_PINIA__?: typeof pinia;
    __FS_PROJECT_STORE__?: (typeof import('@/entities/project'))['useProjectStore'];
    __FS_SCAN_STORE__?: (typeof import('@/entities/scan'))['useScanStore'];
  };
  devWindow.__FS_APP__ = app;
  devWindow.__FS_PINIA__ = pinia;
  import('@/entities/project').then((module) => {
    devWindow.__FS_PROJECT_STORE__ = module.useProjectStore;
  });
  import('@/entities/scan').then((module) => {
    devWindow.__FS_SCAN_STORE__ = module.useScanStore;
  });
}

// uncaught errors -> toast + console; ErrorBoundary handles render-phase ones
const reportError = (err: unknown, source: string): void => {
  const message = err instanceof Error ? err.message : String(err);
  const toast = useToast();
  const title = 'Unexpected error';
  toast.danger(title, message);
  addDiagnostic({
    scope: 'error',
    name: source,
    level: 'error',
    data: { message, errorName: err instanceof Error ? err.name : typeof err },
  });

  console.error(`[${source}]`, err);
};

app.config.errorHandler = (err, _instance, info) => {
  reportError(err, `vue:${info}`);
};

window.addEventListener('error', (e) => {
  reportError(e.error ?? e.message, 'window.error');
});
window.addEventListener('unhandledrejection', (e) => {
  reportError(e.reason, 'unhandledrejection');
});
window.addEventListener(
  'load',
  () => {
    const loadedNavigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    markStartupAt(
      'page load finished',
      loadedNavigation?.loadEventEnd && loadedNavigation.loadEventEnd > 0
        ? loadedNavigation.loadEventEnd
        : performance.now(),
      document.readyState,
    );
  },
  { once: true },
);

app.mount('#app');
startupWindow.__frontScopeAppMountAt = performance.now();
performance.mark('archora:vue-app-mounted');
markStartup('Vue app mounted');
