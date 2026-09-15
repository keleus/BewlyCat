<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ALink from '~/components/ALink.vue'

const props = defineProps<{
  mid: number
  name: string
  liveStatus?: number
  roomid?: number
}>()
const { t } = useI18n()
const href = computed(() => props.liveStatus === 1 && props.roomid && props.roomid > 0
  ? `https://live.bilibili.com/${props.roomid}`
  : `https://space.bilibili.com/${props.mid}`)
</script>

<template>
  <ALink
    :href="href"
    :title="liveStatus === 1 ? `${name} · ${t('user_card.live_now')}` : name"
    type="videoCard"
    stop-propagation
    class="user-avatar-link"
    :class="{ 'is-live': liveStatus === 1 }"
  >
    <slot />
    <span v-if="liveStatus === 1" class="live-badge">
      {{ t('user_card.live_now') }}
    </span>
  </ALink>
</template>

<style lang="scss" scoped>
.user-avatar-link {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  pointer-events: auto;

  &.is-live::before,
  &.is-live::after {
    content: "";
    position: absolute;
    inset: calc(-1 * var(--bew-space-1));
    border: 2px solid var(--bew-theme-color);
    border-radius: 50%;
    pointer-events: none;
    animation: live-avatar-ripple 2s var(--bew-ease-standard) infinite;
  }

  &.is-live::after {
    animation-delay: -1s;
  }
}

@keyframes live-avatar-ripple {
  from {
    transform: scale(1);
    opacity: 0.9;
  }

  to {
    transform: scale(1.16);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .user-avatar-link.is-live::before {
    animation: none;
    opacity: 0.9;
  }

  .user-avatar-link.is-live::after {
    display: none;
  }
}

.live-badge {
  position: absolute;
  z-index: 1;
  bottom: calc(-1 * var(--bew-space-1));
  left: 50%;
  transform: translateX(-50%);
  padding: 0 var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  background: var(--bew-theme-color);
  color: var(--bew-text-auto);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
  white-space: nowrap;
}
</style>
