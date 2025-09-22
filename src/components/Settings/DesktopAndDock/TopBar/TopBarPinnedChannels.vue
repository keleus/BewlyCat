<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import { settings } from '~/logic'

import { allChannelConfigs } from '../../../TopBar/constants/channels'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

interface ChannelOption {
  value: string
  label: string
  icon: string
  color?: string
}

const channelOptions = computed<ChannelOption[]>(() => {
  return allChannelConfigs.map((config) => {
    return {
      value: config.key,
      label: t(config.nameKey),
      icon: config.icon,
      color: config.color,
    }
  })
})

const pinnedChannelKeys = computed(() => settings.value.topBarPinnedChannels)

const pinnedIndexMap = computed(() => {
  const map = new Map<string, number>()
  pinnedChannelKeys.value.forEach((key, index) => {
    map.set(key, index + 1)
  })
  return map
})

function toggleChannel(value: string) {
  if (pinnedChannelKeys.value.includes(value))
    settings.value.topBarPinnedChannels = pinnedChannelKeys.value.filter(key => key !== value)
  else
    settings.value.topBarPinnedChannels = [...pinnedChannelKeys.value, value]
}

function resetPinnedChannels() {
  settings.value.topBarPinnedChannels = []
}
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_topbar_pinned_channels')" :desc="$t('settings.topbar_pinned_channels_desc')">
    <SettingsItem>
      <template #title>
        <div flex="~ gap-4 items-center wrap">
          {{ $t('settings.topbar_pinned_channels_title') }}
          <Button
            size="small"
            type="secondary"
            :disabled="!pinnedChannelKeys.length"
            @click="resetPinnedChannels"
          >
            <template #left>
              <div i-mingcute:back-line />
            </template>
            {{ $t('common.operation.reset') }}
          </Button>
        </div>
      </template>

      <template #desc>
        <span>{{ $t('settings.topbar_pinned_channels_hint') }}</span>
      </template>

      <template #bottom>
        <div class="channel-grid">
          <button
            v-for="option in channelOptions"
            :key="option.value"
            type="button"
            class="channel-grid__item"
            :class="{ selected: pinnedChannelKeys.includes(option.value) }"
            @click="toggleChannel(option.value)"
          >
            <div v-if="option.icon.startsWith('#')" class="channel-grid__icon">
              <svg aria-hidden="true">
                <use :xlink:href="option.icon" />
              </svg>
            </div>
            <div v-else class="channel-grid__icon">
              <i :class="option.icon" :style="{ color: option.color ?? '' }" />
            </div>
            <span class="channel-grid__label">{{ option.label }}</span>
            <div
              v-if="pinnedIndexMap.has(option.value)"
              class="channel-grid__overlay"
            >
              {{ pinnedIndexMap.get(option.value) }}
            </div>
          </button>
        </div>
        <div class="channel-grid__tip" text="$bew-text-3">
          {{ pinnedChannelKeys.length ? $t('settings.topbar_pinned_channels_order_tip') : $t('settings.topbar_pinned_channels_empty') }}
        </div>
      </template>
    </SettingsItem>
  </SettingsItemGroup>
</template>

<style scoped lang="scss">
.channel-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  width: 100%;
  grid-auto-flow: row dense;

  &__item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--bew-radius);
    background: var(--bew-fill-1);
    color: var(--bew-text-1);
    transition:
      background-color 0.3s ease,
      transform 0.2s ease;
    border: 1px solid transparent;

    &.selected {
      background: color-mix(in oklab, var(--bew-theme-color-20), transparent 35%);
      color: var(--bew-theme-color);
      border-color: var(--bew-theme-color-30);
      transform: none;

      &:hover {
        background: color-mix(in oklab, var(--bew-theme-color-20), transparent 20%);
      }
    }

    &:hover {
      background: var(--bew-fill-2);
      transform: translateY(-2px);
    }
  }

  &__icon {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;

    svg {
      width: 24px;
      height: 24px;
    }

    i {
      font-size: 22px;
    }
  }

  &__label {
    flex: 1;
    text-align: left;
    font-size: 14px;
  }

  &__overlay {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    pointer-events: none;
    font-size: 12px;
    font-weight: 600;
    color: white;
    background: var(--bew-theme-color);
  }

  &__tip {
    margin-top: 12px;
  }
}
</style>
