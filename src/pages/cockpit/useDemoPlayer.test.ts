import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useScanStore } from '@/entities/scan';
import { useProjectStore } from '@/entities/project';
import { useDemoStore } from '@/features/demo-walkthrough';
import { useDemoPlayer } from './useDemoPlayer';

function mountPlayer(): ReturnType<typeof useDemoPlayer> {
  let api!: ReturnType<typeof useDemoPlayer>;
  const Harness = defineComponent({
    setup() {
      api = useDemoPlayer({ resolveCycleFindingId: () => null });
      return () => null;
    },
  });
  mount(Harness);
  return api;
}

describe('useDemoPlayer', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('loads the sample on start', () => {
    const player = mountPlayer();
    player.start();
    expect(useScanStore().result).not.toBeNull();
    expect(useProjectStore().current).not.toBeNull();
    expect(useDemoStore().active).toBe(true);
  });

  it('drops the sample and returns to the empty screen on exit', () => {
    const player = mountPlayer();
    player.start();
    player.exit();
    expect(useScanStore().result).toBeNull();
    expect(useProjectStore().current).toBeNull();
    expect(useDemoStore().active).toBe(false);
  });
});
