// Runtime Tauri detection + lazy imports so the web build doesn't pull in tauri-api.
import { addDiagnostic } from './diagnostics';
import { endStartupSpan, startStartupSpan } from './startupTiming';

interface TauriGlobal {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as TauriGlobal;
  return w.__TAURI_INTERNALS__ !== undefined || w.__TAURI__ !== undefined;
}

export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  startStartupSpan(`tauri invoke ${cmd}`);
  const start = performance.now();
  addDiagnostic({
    scope: 'tauri',
    name: 'invoke started',
    level: 'debug',
    data: { invokeName: cmd, backendInvokeInFlight: 1 },
  });
  const { invoke } = await import('@tauri-apps/api/core');
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    addDiagnostic({
      scope: 'tauri',
      name: 'invoke failed',
      level: 'error',
      data: { invokeName: cmd, message: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  } finally {
    addDiagnostic({
      scope: 'tauri',
      name: 'invoke finished',
      level: 'debug',
      data: {
        invokeName: cmd,
        backendInvokeInFlight: 0,
        invokeDurationMs: Math.round(performance.now() - start),
      },
    });
    endStartupSpan(`tauri invoke ${cmd}`);
  }
}

export async function tauriPickFolder(): Promise<{ path: string; name: string } | null> {
  return tauriInvoke<{ path: string; name: string } | null>('pick_directory');
}

/**
 * Subscribe to a Tauri event. Returns an unlisten callback.
 * Test environments without a Tauri runtime get a noop unlistener so callers
 * don't need an `if (isTauri())` guard around the registration itself - they
 * can rely on the absence of events instead.
 */
export async function tauriListen<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  const off = await listen<T>(event, (e) => handler(e.payload));
  return off;
}
