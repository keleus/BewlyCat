<script setup lang="ts">
import UserCard from '~/components/UserCard/UserCard.vue'

import { convertUserCardData } from '../../searchTransforms'

defineProps<{
  users: any[]
  userRelations: Record<number, { isFollowing: boolean, isLoading: boolean }>
}>()

const emit = defineEmits<{
  followStateChanged: [data: { mid: number, isFollowing: boolean }]
}>()

function handleFollowStateChanged(mid: number, isFollowing: boolean) {
  emit('followStateChanged', { mid, isFollowing })
}
</script>

<template>
  <div class="user-grid">
    <UserCard
      v-for="user in users"
      :key="user.mid"
      v-bind="{
        ...convertUserCardData(user),
        isFollowed: userRelations[user.mid]?.isFollowing ? 1 : 0,
      }"
      :compact="true"
      @follow-state-changed="handleFollowStateChanged"
    />
  </div>
</template>

<style scoped lang="scss">
.user-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}
</style>
