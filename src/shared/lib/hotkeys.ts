import { onBeforeUnmount, onMounted } from 'vue';

export type HotkeyHandler = (event: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalHotkeys(map: HotkeyMap): void {
  function onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Escape goes through even from inputs (so search can blur)
    if (e.key !== 'Escape' && isEditableTarget(e.target)) return;
    const handler = map[e.key];
    if (!handler) return;
    handler(e);
  }
  onMounted(() => document.addEventListener('keydown', onKey));
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
}
