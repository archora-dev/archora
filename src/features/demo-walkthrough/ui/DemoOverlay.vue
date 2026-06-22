<script setup lang="ts">
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-vue-next';
import { Button, IconButton } from '@/shared/ui';
import type { DemoStep } from '../model/demoSteps';

const props = defineProps<{
  step: DemoStep;
  index: number;
  total: number;
  paused: boolean;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'toggle-pause'): void;
  (e: 'exit'): void;
}>();
</script>

<template>
  <div class="demo-overlay" data-test="demo-overlay">
    <div class="demo-card" role="status" aria-live="polite">
      <div class="demo-card-head">
        <span class="demo-eyebrow">Guided demo · {{ props.index + 1 }} / {{ props.total }}</span>
        <IconButton
          :icon="X"
          size="sm"
          variant="ghost"
          label="Exit demo"
          data-test="demo-exit"
          @click="emit('exit')"
        />
      </div>

      <h3 class="demo-title">{{ props.step.title }}</h3>
      <p class="demo-caption" data-test="demo-caption">{{ props.step.caption }}</p>

      <div class="demo-dots" aria-hidden="true">
        <span
          v-for="i in props.total"
          :key="i"
          class="demo-dot"
          :class="{
            'demo-dot-active': i - 1 === props.index,
            'demo-dot-done': i - 1 < props.index,
          }"
        />
      </div>

      <div class="demo-controls">
        <IconButton
          :icon="ChevronLeft"
          size="sm"
          variant="ghost"
          label="Previous step"
          :disabled="props.isFirst"
          data-test="demo-prev"
          @click="emit('prev')"
        />
        <Button size="sm" variant="ghost" data-test="demo-pause" @click="emit('toggle-pause')">
          <Play v-if="props.paused" class="size-3.5" />
          <Pause v-else class="size-3.5" />
          {{ props.paused ? 'Play' : 'Pause' }}
        </Button>
        <Button
          v-if="props.isLast"
          size="sm"
          variant="primary"
          data-test="demo-finish"
          @click="emit('exit')"
        >
          Finish
        </Button>
        <IconButton
          v-else
          :icon="ChevronRight"
          size="sm"
          variant="secondary"
          label="Next step"
          data-test="demo-next"
          @click="emit('next')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-overlay {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  padding: 0 1rem 1.5rem;
  pointer-events: none;
}
.demo-card {
  pointer-events: auto;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1rem 1.1rem 0.9rem;
  border: 1px solid var(--arch-color-border, rgb(124 109 255 / 0.25));
  border-radius: var(--radius-lg, 0.75rem);
  background: var(--arch-color-surface, #14141c);
  box-shadow: 0 18px 48px rgb(0 0 0 / 0.4);
  animation: demo-rise var(--motion-base, 280ms) ease-out both;
}
@keyframes demo-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.demo-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.demo-eyebrow {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary, #7c6dff);
}
.demo-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 680;
  color: var(--arch-color-fg, #f4f4f8);
}
.demo-caption {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--arch-color-fg-muted, #b6b6c4);
}
.demo-dots {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.15rem;
}
.demo-dot {
  height: 0.3rem;
  flex: 1;
  border-radius: 999px;
  background: var(--arch-color-surface-2, rgb(124 109 255 / 0.12));
  transition: background var(--motion-fast, 120ms) ease-out;
}
.demo-dot-done {
  background: var(--color-primary, #7c6dff);
  opacity: 0.55;
}
.demo-dot-active {
  background: var(--color-primary, #7c6dff);
}
.demo-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.2rem;
}
.demo-controls > :last-child {
  margin-left: auto;
}
</style>
