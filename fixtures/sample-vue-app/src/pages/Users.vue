<script setup lang="ts">
import UserList from '@/components/UserList.vue';
import { useUsers } from '@/composables/useUsers';

const { items } = useUsers();
</script>

<template>
  <UserList :items="items" />
</template>
