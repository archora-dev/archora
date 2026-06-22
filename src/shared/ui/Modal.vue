<script setup lang="ts">
import { computed } from 'vue';
import {
  ArchDialog,
  ArchDialogContent,
  ArchDialogFooter,
  ArchDialogHeader,
  ArchDialogTitle,
} from '@archora/ui';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    closeOnBackdrop?: boolean;
    size?: ModalSize;
  }>(),
  { closeOnBackdrop: true, size: 'sm' },
);

defineEmits<{ 'update:open': [value: boolean]; close: [] }>();

const contentProps = computed(() => ({
  size: props.size ?? 'sm',
  closeOnOutside: props.closeOnBackdrop ?? true,
}));
</script>

<template>
  <ArchDialog
    :open="open"
    @update:open="
      (value) => {
        $emit('update:open', value);
        if (!value) $emit('close');
      }
    "
  >
    <ArchDialogContent v-bind="contentProps">
      <ArchDialogHeader v-if="title">
        <ArchDialogTitle>{{ title }}</ArchDialogTitle>
      </ArchDialogHeader>
      <div class="min-h-0 overflow-auto text-sm">
        <slot />
      </div>
      <ArchDialogFooter v-if="$slots.footer">
        <slot name="footer" />
      </ArchDialogFooter>
    </ArchDialogContent>
  </ArchDialog>
</template>
