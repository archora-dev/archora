<script setup lang="ts">
import type { User } from '@/types/user';
import UserCard from '@/components/UserCard.vue';

defineProps<{ items: User[] }>();
</script>

<template>
  <ul>
    <li v-for="u in items" :key="u.id"><UserCard :user="u" /></li>
  </ul>
</template>
