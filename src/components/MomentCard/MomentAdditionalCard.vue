<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DisplayAdditional } from './types'
import { getMomentThumbnailUrl } from './utils'

// 动态附加卡：预约、UP 主推荐、商品、充电档位等。预约类附加卡提供原地预约按钮。
const { additional, charge = false, reservationLoading = false } = defineProps<{
  additional: DisplayAdditional
  /** 充电专属动态：不展示附加卡封面，操作使用充电配色 */
  charge?: boolean
  reservationLoading?: boolean
}>()

const emit = defineEmits<{
  open: [event: MouseEvent]
  toggleReservation: []
}>()

const { t } = useI18n()

const isReservation = computed(() => Boolean(
  additional.reservationId
  && (additional.isVideoReservation || additional.isLiveReservation),
))

const reservationActionLabel = computed(() =>
  additional.isReserved
    ? t('moment_card.cancel_reservation')
    : (additional.action || t('moment_card.reserve')),
)
</script>

<template>
  <div
    class="moment-card__additional moment-card__additional--footer"
    :class="{
      'moment-card__additional--no-cover': charge || !additional.cover,
      'moment-card__additional--charge': charge,
    }"
  >
    <a
      draggable="false"
      :href="additional.url || undefined"
      class="moment-card__additional-main"
      @click="emit('open', $event)"
    >
      <img
        v-if="additional.cover && !charge"
        :src="getMomentThumbnailUrl(additional.cover, 80)"
        alt=""
        loading="lazy"
        decoding="async"
      >
      <span>
        <strong>
          {{ additional.title || t('moment_card.additional') }}
        </strong>
        <small v-if="additional.desc">{{ additional.desc }}</small>
      </span>
    </a>
    <button
      v-if="isReservation"
      type="button"
      class="moment-card__additional-action"
      :class="{ 'is-reserved': additional.isReserved, 'is-loading': reservationLoading }"
      :aria-busy="reservationLoading || undefined"
      :aria-disabled="reservationLoading || undefined"
      :aria-label="reservationActionLabel"
      :aria-pressed="Boolean(additional.isReserved)"
      @click.stop="emit('toggleReservation')"
    >
      <span v-if="reservationLoading" i-svg-spinners:ring-resize aria-hidden="true" />
      <span v-else>{{ reservationActionLabel }}</span>
    </button>
    <a
      v-else
      draggable="false"
      :href="additional.url || undefined"
      class="moment-card__additional-action"
      @click="emit('open', $event)"
    >
      {{ additional.action }}
    </a>
  </div>
</template>

<style lang="scss" scoped>
@use "./styles/mixins";

.moment-card__additional {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bew-space-3);
  margin-top: var(--bew-space-4);
  padding: var(--bew-space-3) var(--bew-space-4);
  border-radius: var(--bew-interactive-radius);
  color: inherit;
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
  text-decoration: none;
  transition: background-color 0.16s ease;
}

.moment-card__additional:hover {
  background: var(--bew-fill-2);
}

.moment-card__additional--footer {
  margin: 0 var(--bew-space-4) var(--bew-space-3);
}

.moment-card__additional-main,
.moment-card__additional-action {
  @include mixins.interactive-layer;
}

.moment-card__additional-main {
  display: grid;
  min-width: 0;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: var(--bew-space-3);
  color: inherit;
  text-decoration: none;
}

.moment-card__additional--no-cover .moment-card__additional-main {
  grid-template-columns: minmax(0, 1fr);
}

.moment-card__additional-main img {
  width: 40px;
  height: 40px;
  border-radius: var(--bew-radius-md);
  object-fit: cover;
}

.moment-card__additional-main > span {
  display: flex;
  min-width: 0;
  min-height: 40px;
  flex-direction: column;
  justify-content: center;
}

.moment-card__additional-main strong,
.moment-card__additional-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.moment-card__additional-main strong {
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-card__additional-main small {
  margin-top: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
}

.moment-card__additional-action {
  display: inline-flex;
  min-width: 48px;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  padding: var(--bew-space-1) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-color);
  background: transparent;
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-decoration: none;
  white-space: nowrap;
  transition:
    color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-card__additional-action:hover {
  background: var(--bew-theme-color-10);
}

.moment-card__additional--charge .moment-card__additional-action {
  color: #fb7299;
}

.moment-card__additional-action.is-reserved {
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
}

.moment-card__additional-action:focus-visible {
  @include mixins.focus-ring;
}

.moment-card__additional-action.is-loading {
  cursor: wait;
  opacity: 0.65;
}
</style>
