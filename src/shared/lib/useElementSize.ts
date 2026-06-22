import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export function useElementSize(target: Ref<HTMLElement | null>): {
  width: Ref<number>;
  height: Ref<number>;
} {
  const width = ref(0);
  const height = ref(0);
  let observer: ResizeObserver | null = null;

  function measure(el: HTMLElement): void {
    width.value = el.clientWidth;
    height.value = el.clientHeight;
  }

  onMounted(() => {
    const el = target.value;
    if (!el) return;
    measure(el);
    if (typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(() => measure(el));
    observer.observe(el);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return { width, height };
}
