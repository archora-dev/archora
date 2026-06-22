// tiny pub/sub via window CustomEvents - used by app-shell signals
export const FOCUS_SEARCH_EVENT = 'archora:focus-search';
export const OPEN_SEARCH_EVENT = 'archora:open-search';
export const ARCHITECTURE_NAVIGATE_EVENT = 'archora:architecture-navigate';
export const OPEN_LAYER_RULES_EVENT = 'archora:open-layer-rules';
export const OPEN_PROJECT_EVENT = 'archora:open-project';

// Set when the open-project action fires from outside the cockpit route (e.g.
// the global top bar on History/Settings). The cockpit drains it on mount,
// since a route change cannot dispatch a window event to a not-yet-mounted
// listener.
let openProjectPending = false;

export function requestOpenProjectOnCockpit(): void {
  openProjectPending = true;
}

export function consumeOpenProjectRequest(): boolean {
  const requested = openProjectPending;
  openProjectPending = false;
  return requested;
}
