<script setup lang="ts">
import UserCard from '@/components/UserCard.vue';
import { useUserStore } from '@/stores/userStore';

const store = useUserStore();
</script>

<template>
  <UserCard :user="store.current" />
</template>
