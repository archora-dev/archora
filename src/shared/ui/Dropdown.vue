<script setup lang="ts">
import { ArchDropdown, ArchDropdownContent, ArchDropdownTrigger } from '@archora/ui';

const props = withDefaults(defineProps<{ align?: 'left' | 'right' }>(), { align: 'left' });

function mapAlign(align: 'left' | 'right'): 'start' | 'end' {
  return align === 'right' ? 'end' : 'start';
}
</script>

<template>
  <ArchDropdown>
    <ArchDropdownTrigger>
      <slot name="trigger" :open="false" />
    </ArchDropdownTrigger>
    <ArchDropdownContent :align="mapAlign(props.align)">
      <slot />
    </ArchDropdownContent>
  </ArchDropdown>
</template>
