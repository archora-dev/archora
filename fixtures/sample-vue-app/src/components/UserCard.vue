<script setup lang="ts">
import type { User } from '@/types/user';
import Avatar from '@/components/Avatar.vue';
import Badge from '@/components/Badge.vue';
import { formatDate } from '@/utils/date';

defineProps<{ user: User }>();
</script>

<template>
  <article>
    <Avatar :src="user.avatar" />
    <strong>{{ user.name }}</strong>
    <Badge>{{ user.role }}</Badge>
    <time>{{ formatDate(user.joined) }}</time>
  </article>
</template>
