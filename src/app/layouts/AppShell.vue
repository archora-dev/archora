<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterView, RouterLink, useRoute, useRouter } from 'vue-router';
import {
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Network,
  FolderOpen,
} from 'lucide-vue-next';
import { Button, IconButton, ErrorBoundary } from '@/shared/ui';
import { markStartup } from '@/shared/lib/startupTiming';
import { useThemeStore } from '@/app/stores/themeStore';
import type { ThemeMode } from '@/app/providers/themeProvider';
import { OPEN_SEARCH_EVENT, OPEN_PROJECT_EVENT, requestOpenProjectOnCockpit } from '@/shared/lib';
import { LicenseExpiryBanner } from '@/features/license-activation';
import { CommandPalette } from '@/widgets/command-palette';

markStartup('main layout setup');
const themeStore = useThemeStore();
const route = useRoute();
const router = useRouter();
const fullBleed = computed(() => Boolean(route.meta.fullBleed));

// Open a project from any route. On the cockpit, the page is already listening,
// so a window event triggers the directory picker immediately; from elsewhere we
// queue the request and route to the cockpit, which drains it on mount.
async function openProject(): Promise<void> {
  if (route.name === 'cockpit') {
    window.dispatchEvent(new CustomEvent(OPEN_PROJECT_EVENT));
    return;
  }
  requestOpenProjectOnCockpit();
  await router.push({ name: 'cockpit' });
}
const referenceShell = computed(() => fullBleed.value);
const sidebarCollapsed = computed(() => referenceShell.value || collapsed.value);

const collapsed = ref(false);

const themeIcon = computed(() => {
  if (themeStore.mode === 'light') return Sun;
  if (themeStore.mode === 'dark') return Moon;
  return Monitor;
});

function cycleTheme(): void {
  const order: ThemeMode[] = ['light', 'dark', 'system'];
  const idx = order.indexOf(themeStore.mode);
  const next = order[(idx + 1) % order.length] ?? 'system';
  themeStore.setMode(next);
}

// Cmd/Ctrl+K opens the command palette globally.
function onMetaKey(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
  }
}
onMounted(() => {
  markStartup('main layout mounted');
  document.addEventListener('keydown', onMetaKey);
});
onUnmounted(() => document.removeEventListener('keydown', onMetaKey));
</script>

<template>
  <div class="app-shell" :class="referenceShell ? 'app-shell-reference' : ''">
    <aside
      class="app-sidebar"
      :class="[
        sidebarCollapsed ? 'app-sidebar-collapsed' : 'app-sidebar-expanded',
        referenceShell ? 'reference-rail' : '',
      ]"
    >
      <div class="sidebar-brand" :class="sidebarCollapsed ? 'sidebar-brand-collapsed' : ''">
        <div class="brand-lockup">
          <span class="brand-mark">
            <Network v-if="referenceShell" :size="20" :stroke-width="1.85" />
            <template v-else>FS</template>
          </span>
          <span v-if="!sidebarCollapsed" class="brand-copy">
            <strong>Archora</strong>
            <small>Architecture</small>
          </span>
        </div>
        <IconButton
          v-if="!referenceShell"
          :icon="collapsed ? PanelLeftOpen : PanelLeftClose"
          :label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          size="sm"
          @click="collapsed = !collapsed"
        />
      </div>

      <div class="sidebar-open">
        <Button
          class="sidebar-open-button"
          :class="sidebarCollapsed ? 'sidebar-open-button-collapsed' : ''"
          variant="primary"
          title="Open project"
          data-test="rail-open-project"
          @click="openProject"
        >
          <FolderOpen :size="16" />
          <span v-if="!sidebarCollapsed">Open project</span>
        </Button>
      </div>

      <nav class="sidebar-nav">
        <RouterLink
          :to="{ name: 'cockpit' }"
          title="Cockpit"
          class="sidebar-link"
          :class="sidebarCollapsed ? 'sidebar-link-collapsed' : ''"
          active-class="sidebar-link-active"
          data-test="nav-cockpit"
        >
          <Network :size="16" />
          <span v-if="!sidebarCollapsed">Cockpit</span>
        </RouterLink>
        <RouterLink
          :to="{ name: 'history' }"
          title="History"
          class="sidebar-link"
          :class="sidebarCollapsed ? 'sidebar-link-collapsed' : ''"
          active-class="sidebar-link-active"
          data-test="nav-history"
        >
          <HistoryIcon :size="16" />
          <span v-if="!sidebarCollapsed">History</span>
        </RouterLink>
        <RouterLink
          :to="{ name: 'settings' }"
          title="Settings"
          class="sidebar-link"
          :class="sidebarCollapsed ? 'sidebar-link-collapsed' : ''"
          active-class="sidebar-link-active"
          data-test="nav-settings"
        >
          <SettingsIcon :size="16" />
          <span v-if="!sidebarCollapsed">Settings</span>
        </RouterLink>
      </nav>

      <div class="sidebar-bottom">
        <Button
          class="sidebar-link sidebar-control"
          :class="sidebarCollapsed ? 'sidebar-link-collapsed' : ''"
          :title="`Theme: ${themeStore.mode}`"
          variant="ghost"
          @click="cycleTheme"
        >
          <component :is="themeIcon" :size="16" />
          <span v-if="!sidebarCollapsed" class="capitalize">{{ themeStore.mode }}</span>
        </Button>
      </div>
    </aside>

    <div class="app-content">
      <LicenseExpiryBanner />
      <header v-if="!fullBleed" class="global-topbar">
        <div class="global-topbar-copy">
          <Command :size="15" />
          <span>A map of your frontend architecture</span>
        </div>
      </header>
      <main class="app-main" :class="fullBleed ? '' : 'app-main-padded'">
        <ErrorBoundary>
          <RouterView />
        </ErrorBoundary>
      </main>
    </div>
    <CommandPalette />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--color-bg);
}

.app-shell-reference {
  background: var(--color-bg);
  color: var(--color-text);
}

.app-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background:
    linear-gradient(180deg, rgb(124 109 255 / 0.08), transparent 13rem), var(--color-surface);
  transition: width var(--motion-base);
}

.app-sidebar-expanded {
  width: 16rem;
}

.app-sidebar-collapsed {
  width: 4.25rem;
}

.sidebar-brand {
  display: flex;
  min-height: 4.25rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.8rem;
  border-bottom: 1px solid var(--color-border);
}

.reference-rail {
  border-right-color: var(--color-border);
  background:
    linear-gradient(180deg, rgb(76 118 255 / 0.12), transparent 12rem), var(--color-surface);
}

.reference-rail .sidebar-brand {
  min-height: 3.65rem;
  border-bottom-color: var(--color-border);
  padding: 0.65rem;
}

.sidebar-brand-collapsed {
  justify-content: center;
}

.brand-lockup {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.7rem;
}

.brand-mark {
  display: grid;
  width: 2.15rem;
  height: 2.15rem;
  flex-shrink: 0;
  place-items: center;
  border: 1px solid rgb(124 109 255 / 0.5);
  border-radius: 0.55rem;
  color: var(--color-primary-fg);
  font-size: 0.72rem;
  font-weight: 850;
  background: linear-gradient(135deg, var(--color-primary), #4f7cff);
  box-shadow: 0 10px 28px -12px rgb(124 109 255 / 0.85);
}

.reference-rail .brand-mark {
  width: 2.05rem;
  height: 2.05rem;
  border-color: rgb(91 133 255 / 0.64);
  border-radius: 0.42rem;
  color: var(--color-primary);
  background:
    linear-gradient(135deg, rgb(73 105 255 / 0.22), rgb(24 215 197 / 0.1)), var(--color-surface-2);
  box-shadow: 0 0 0 1px rgb(91 133 255 / 0.12) inset;
}

.brand-copy {
  display: grid;
  min-width: 0;
  gap: 0.08rem;
}

.brand-copy strong {
  color: var(--color-text);
  font-size: 0.96rem;
  line-height: 1.1;
}

.brand-copy small {
  color: var(--color-text-subtle);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-open {
  padding: 0.75rem 0.75rem 0;
}

.reference-rail .sidebar-open {
  padding: 0.65rem 0.55rem 0;
}

.sidebar-open-button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
}

.sidebar-open-button-collapsed {
  padding-inline: 0;
}

.sidebar-nav,
.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem;
}

.reference-rail .sidebar-nav,
.reference-rail .sidebar-bottom {
  gap: 0.5rem;
  padding: 0.65rem 0.55rem;
}

.reference-rail .sidebar-bottom {
  border-top-color: transparent;
}

.sidebar-bottom {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
}

.sidebar-link {
  display: flex;
  min-height: 2.35rem;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  padding: 0 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  font-weight: 620;
  transition:
    background-color var(--motion-fast),
    border-color var(--motion-fast),
    color var(--motion-fast),
    box-shadow var(--motion-fast);
}

.reference-rail .sidebar-link {
  min-height: 2.35rem;
  border-color: transparent;
  border-radius: 0.48rem;
  color: var(--color-text-muted);
  background: transparent;
}

.reference-rail .sidebar-link:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.sidebar-link:hover {
  color: var(--color-text);
  background: var(--color-surface-2);
}

.sidebar-link-collapsed {
  justify-content: center;
  padding-inline: 0;
}

.sidebar-link-active {
  border-color: rgb(124 109 255 / 0.32);
  color: var(--color-text);
  background: linear-gradient(135deg, rgb(124 109 255 / 0.2), rgb(56 189 248 / 0.1));
  box-shadow:
    0 0 0 1px rgb(124 109 255 / 0.08) inset,
    0 12px 30px -18px var(--color-primary);
}

.reference-rail .sidebar-link-active {
  border-color: rgb(124 109 255 / 0.32);
  color: var(--color-text);
  background: linear-gradient(135deg, rgb(124 109 255 / 0.2), rgb(56 189 248 / 0.1));
  box-shadow:
    0 0 0 1px rgb(124 109 255 / 0.08) inset,
    0 12px 30px -18px var(--color-primary);
}

.project-link span {
  min-width: 0;
}

.sidebar-control {
  width: 100%;
  text-align: left;
}

.app-content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.app-shell-reference .app-content {
  background:
    radial-gradient(circle at 26% 6%, rgb(38 86 156 / 0.16), transparent 26rem), var(--color-bg);
}

.global-topbar {
  display: flex;
  height: 3rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--color-border);
  padding: 0 1rem;
  background: color-mix(in srgb, var(--color-surface) 88%, transparent);
}

.global-topbar-copy {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--color-text-muted);
}

.app-main {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-main-padded {
  padding: 1.5rem;
}
</style>
