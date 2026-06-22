// Tests for watchProject.ts: debounce, dedup, lifecycle (start/stop), filtering
// out foreign watchId. The Tauri runtime is fully mocked - `tauriListen`/`tauriInvoke`
// are intercepted via vi.mock; an event is "emitted" by hand through the
// captured handler. This reproduces the behavior of `globalThis.__TAURI_EVENT__`
// without a real Tauri attached.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock('@/shared/lib', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib')>('@/shared/lib');
  return {
    ...actual,
    isTauri: () => true,
    tauriInvoke: (...args: unknown[]) => invokeMock(...args),
    tauriListen: (...args: unknown[]) => listenMock(...args),
  };
});

import { startWatching, type FsChangePayload } from '../watchProject';
import { useScanStore } from '@/entities/scan';

type Handler = (p: FsChangePayload) => void;

function setupListenCapture(): {
  fire: (p: FsChangePayload) => void;
  unlisten: ReturnType<typeof vi.fn>;
} {
  let captured: Handler | null = null;
  const unlisten = vi.fn();
  listenMock.mockImplementation(async (_event: string, handler: Handler) => {
    captured = handler;
    return unlisten;
  });
  return {
    fire: (p) => {
      if (!captured) throw new Error('listener not registered yet');
      captured(p);
    },
    unlisten,
  };
}

describe('watchProject', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    invokeMock.mockReset();
    listenMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a burst of changes into a single onChange call after debounceMs', async () => {
    const cap = setupListenCapture();
    invokeMock.mockResolvedValue('w-1');
    const onChange = vi.fn();

    const handle = await startWatching({ rootPath: '/r', onChange, debounceMs: 500 });
    expect(handle).not.toBeNull();

    cap.fire({ watchId: 'w-1', paths: ['a.ts'], at: 1 });
    cap.fire({ watchId: 'w-1', paths: ['a.ts', 'b.ts'], at: 2 });
    cap.fire({ watchId: 'w-1', paths: ['c.ts'], at: 3 });

    // within the debounce window the callback hasn't fired yet
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(onChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    // dedup within the batch: a.ts only once
    expect(onChange.mock.calls[0]?.[0]).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('ignores events from a foreign watchId (several watchers started)', async () => {
    const cap = setupListenCapture();
    invokeMock.mockResolvedValue('w-1');
    const onChange = vi.fn();
    await startWatching({ rootPath: '/r', onChange, debounceMs: 100 });

    cap.fire({ watchId: 'w-other', paths: ['x.ts'], at: 1 });
    vi.advanceTimersByTime(200);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('updates scan.lastChangeAt on every event (even before the debounce flush)', async () => {
    const cap = setupListenCapture();
    invokeMock.mockResolvedValue('w-1');
    await startWatching({ rootPath: '/r', onChange: vi.fn(), debounceMs: 500 });

    const scan = useScanStore();
    cap.fire({ watchId: 'w-1', paths: ['a.ts'], at: 12345 });
    expect(scan.lastChangeAt).toBe(12345);
    cap.fire({ watchId: 'w-1', paths: ['b.ts'], at: 67890 });
    expect(scan.lastChangeAt).toBe(67890);
  });

  it('start sets watchActive=true; stop unsubscribes the listener, calls stop_watch and clears the flag', async () => {
    const cap = setupListenCapture();
    invokeMock.mockResolvedValue('w-1');
    const handle = await startWatching({ rootPath: '/r', onChange: vi.fn() });
    const scan = useScanStore();
    expect(scan.watchActive).toBe(true);

    invokeMock.mockResolvedValueOnce(undefined);
    await handle!.stop();

    expect(cap.unlisten).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('stop_watch', { watchId: 'w-1' });
    expect(scan.watchActive).toBe(false);
  });

  it('after stop a pending debounce does not fire onChange', async () => {
    const cap = setupListenCapture();
    invokeMock.mockResolvedValue('w-1');
    const onChange = vi.fn();
    const handle = await startWatching({ rootPath: '/r', onChange, debounceMs: 500 });

    cap.fire({ watchId: 'w-1', paths: ['a.ts'], at: 1 });
    invokeMock.mockResolvedValueOnce(undefined);
    await handle!.stop();
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('returns null in a browser environment (isTauri=false)', async () => {
    vi.resetModules();
    vi.doMock('@/shared/lib', async () => {
      const actual = await vi.importActual<typeof import('@/shared/lib')>('@/shared/lib');
      return { ...actual, isTauri: () => false };
    });
    const { startWatching: startInBrowser } = await import('../watchProject');
    const handle = await startInBrowser({ rootPath: '/r', onChange: vi.fn() });
    expect(handle).toBeNull();
    vi.doUnmock('@/shared/lib');
  });
});
