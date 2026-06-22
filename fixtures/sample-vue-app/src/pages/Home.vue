<script setup lang="ts">
import UserCard from '@/components/UserCard.vue';
import { useUserStore } from '@/stores/userStore';
import { formatDate } from '@/utils/date';

const users = useUserStore();
const today = formatDate(new Date());
</script>

<template>
  <h1>Home {{ today }}</h1>
  <UserCard v-for="u in users.list" :key="u.id" :user="u" />
</template>
