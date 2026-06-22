<script setup lang="ts">
import { listUsers } from '~/composables/useUsers';
const users = await listUsers();
</script>
<template>
  <ul>
    <li v-for="u in users" :key="u.id">{{ u.name }}</li>
  </ul>
</template>
