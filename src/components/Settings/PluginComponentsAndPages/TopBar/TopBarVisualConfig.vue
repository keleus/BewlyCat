<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import bilibiliBrandLogoUrl from '~/assets/branding/bilibili-brand-logo.png'
import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'

import { allChannelConfigs } from '../../../TopBar/constants/channels'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

type BadgeType = 'number' | 'dot' | 'none'

interface TopBarComponent {
  key: string
  i18nKey: string
  icon: string
  supportsBadge: boolean
}

const topBarComponents = computed<TopBarComponent[]>(() => [
  {
    key: 'moments',
    i18nKey: 'topbar.moments',
    icon: 'i-tabler:windmill',
    supportsBadge: true,
  },
  {
    key: 'favorites',
    i18nKey: 'topbar.favorites',
    icon: 'i-mingcute:star-line',
    supportsBadge: true,
  },
  {
    key: 'history',
    i18nKey: 'topbar.history',
    icon: 'i-mingcute:time-line',
    supportsBadge: true,
  },
  {
    key: 'watchLater',
    i18nKey: 'topbar.watch_later',
    icon: 'i-mingcute:carplay-line',
    supportsBadge: true,
  },
  {
    key: 'creatorCenter',
    i18nKey: 'topbar.creative_center',
    icon: 'i-mingcute:bulb-line',
    supportsBadge: false,
  },
  {
    key: 'upload',
    i18nKey: 'topbar.upload',
    icon: 'i-mingcute:upload-line',
    supportsBadge: false,
  },
  {
    key: 'notifications',
    i18nKey: 'topbar.notifications',
    icon: 'i-tabler:bell',
    supportsBadge: true,
  },
])

const badgeOptions = computed(() => [
  { label: t('settings.top_bar_icon_badges_opt.number'), value: 'number' },
  { label: t('settings.top_bar_icon_badges_opt.dot'), value: 'dot' },
  { label: t('settings.top_bar_icon_badges_opt.none'), value: 'none' },
])

const videoPageTopBarConfigOptions = computed(() => [
  { label: t('settings.video_page_top_bar_config_opt.alwaysShow'), value: VideoPageTopBarConfig.AlwaysShow },
  { label: t('settings.video_page_top_bar_config_opt.alwaysHide'), value: VideoPageTopBarConfig.AlwaysHide },
  { label: t('settings.video_page_top_bar_config_opt.showOnMouse'), value: VideoPageTopBarConfig.ShowOnMouse },
  { label: t('settings.video_page_top_bar_config_opt.showOnScroll'), value: VideoPageTopBarConfig.ShowOnScroll },
])

function createDefaultComponentConfig(component: TopBarComponent) {
  return {
    key: component.key,
    visible: true,
    badgeType: (component.supportsBadge ? 'number' : 'none') as BadgeType,
  }
}

function getComponentConfig(componentKey: string) {
  return settings.value.topBarComponentsConfig?.find(component => component.key === componentKey)
}

function resetTopBarComponents() {
  settings.value.topBarComponentsConfig = topBarComponents.value.map(createDefaultComponentConfig)
}

function ensureTopBarComponentsConfig() {
  const currentConfig = settings.value.topBarComponentsConfig ?? []
  const hasExpectedKeys = currentConfig.length === topBarComponents.value.length
    && topBarComponents.value.every((component, index) => currentConfig[index]?.key === component.key)

  if (hasExpectedKeys)
    return

  settings.value.topBarComponentsConfig = topBarComponents.value.map((component) => {
    return currentConfig.find(config => config.key === component.key) ?? createDefaultComponentConfig(component)
  })
}

function setComponentVisibility(componentKey: string, visible: boolean) {
  const config = getComponentConfig(componentKey)
  if (config)
    config.visible = visible
}

function setComponentBadgeType(componentKey: string, badgeType: BadgeType) {
  const config = getComponentConfig(componentKey)
  if (config)
    config.badgeType = badgeType
}

ensureTopBarComponentsConfig()
watch(topBarComponents, ensureTopBarComponentsConfig, { immediate: true })

function resetPinnedChannels() {
  settings.value.topBarPinnedChannels = []
}

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
</script>

<template>
  <div class="topbar-settings-groups" :data-settings-title="$t('settings.group_topbar')">
    <SettingsItemGroup
      :title="$t('settings.topbar_display_settings')"
      :desc="$t('settings.topbar_display_settings_desc')"
    >
      <SettingsItem
        v-if="!settings.touchScreenOptimization"
        :title="$t('settings.open_top_bar_items_in_bewly')"
        :desc="$t('settings.open_top_bar_items_in_bewly_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.openTopBarItemsInBewly" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.auto_hide_top_bar')" right-width="auto">
        <Radio v-model="settings.autoHideTopBar" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.video_page_top_bar_config')"
        :desc="$t('settings.video_page_top_bar_config_desc')"
        right-width="auto"
      >
        <Select v-model="settings.videoPageTopBarConfig" :options="videoPageTopBarConfigOptions" w="160px" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.always_use_transparent_top_bar')" right-width="auto">
        <Radio v-model="settings.alwaysUseTransparentTopBar" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.enable_top_bar_gradient')"
        :desc="$t('settings.enable_top_bar_gradient_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableTopBarGradient" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.show_top_bar_theme_color_gradient')" right-width="auto">
        <Radio v-model="settings.showTopBarThemeColorGradient" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.open_notifications_page_as_drawer')" right-width="auto">
        <Radio v-model="settings.openNotificationsPageAsDrawer" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.topbar_logo_and_channels')"
      :desc="$t('settings.topbar_logo_and_channels_desc')"
    >
      <SettingsItem
        :title="$t('settings.top_bar_logo_style')"
        :desc="$t('settings.top_bar_logo_style_desc')"
        right-width="auto"
      >
        <div
          class="logo-style-picker bew-segment-control bew-segment-control--surface bew-segment-control--static"
          role="radiogroup"
          :aria-label="$t('settings.top_bar_logo_style')"
        >
          <button
            type="button"
            class="bew-segment-control__item bew-segment-control__item--icon"
            :data-active="settings.topBarLogoStyle === 'icon'"
            role="radio"
            :aria-checked="settings.topBarLogoStyle === 'icon'"
            :title="$t('settings.top_bar_logo_style_opt.icon')"
            @click="settings.topBarLogoStyle = 'icon'"
          >
            <span class="bew-segment-control__icon i-tabler:brand-bilibili" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="logo-style-picker__brand-option bew-segment-control__item"
            :data-active="settings.topBarLogoStyle === 'brand'"
            role="radio"
            :aria-checked="settings.topBarLogoStyle === 'brand'"
            :title="$t('settings.top_bar_logo_style_opt.brand')"
            @click="settings.topBarLogoStyle = 'brand'"
          >
            <span
              class="logo-style-picker__brand"
              :style="{
                maskImage: `url(${bilibiliBrandLogoUrl})`,
                WebkitMaskImage: `url(${bilibiliBrandLogoUrl})`,
              }"
              aria-hidden="true"
            />
          </button>
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.touchScreenOptimization"
        :title="$t('settings.show_home_button_in_touch_mode')"
        :desc="$t('settings.show_home_button_in_touch_mode_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showHomeButtonInTouchMode" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_topbar_pinned_channels')"
      :desc="$t('settings.topbar_pinned_channels_desc')"
      icon="i-tabler:pin-filled"
      collapsible
      default-collapsed
    >
      <SettingsItem :title="$t('settings.topbar_pinned_channels_title')">
        <template #title>
          <div class="topbar-item-title-with-action">
            <span>{{ $t('settings.topbar_pinned_channels_title') }}</span>
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
              <span v-if="pinnedIndexMap.has(option.value)" class="channel-grid__overlay">
                {{ pinnedIndexMap.get(option.value) }}
              </span>
            </button>
          </div>
          <div class="channel-grid__tip">
            {{ pinnedChannelKeys.length ? $t('settings.topbar_pinned_channels_order_tip') : $t('settings.topbar_pinned_channels_empty') }}
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.topbar_switchers')"
      :desc="$t('settings.topbar_switchers_desc')"
    >
      <SettingsItem
        :title="$t('settings.show_bewly_or_bili_top_bar_switcher')"
        :desc="$t('settings.show_bewly_or_bili_top_bar_switcher_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showBewlyOrBiliTopBarSwitcher" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_search_bar')">
      <SettingsItem
        :title="$t('settings.show_hot_search_in_top_bar')"
        :desc="$t('settings.show_hot_search_in_top_bar_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showHotSearchInTopBar" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.show_search_recommendation')"
        :desc="$t('settings.show_search_recommendation_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showSearchRecommendation" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.topbar_actions')"
      :desc="$t('settings.topbar_actions_desc')"
    >
      <SettingsItem
        v-for="component in topBarComponents"
        :key="component.key"
        :title="$t(component.i18nKey)"
        right-width="auto"
      >
        <template #title>
          <span class="topbar-component-title">
            <span class="topbar-component-icon" :class="component.icon" aria-hidden="true" />
            <span>{{ $t(component.i18nKey) }}</span>
          </span>
        </template>
        <div class="topbar-component-controls">
          <div v-if="component.supportsBadge" class="topbar-component-control topbar-component-control--badge">
            <span class="topbar-component-control__label">{{ $t('settings.badge_type') }}</span>
            <Select
              :model-value="getComponentConfig(component.key)?.badgeType ?? 'number'"
              :options="badgeOptions"
              :disabled="!getComponentConfig(component.key)?.visible"
              w="160px"
              @update:model-value="setComponentBadgeType(component.key, $event as BadgeType)"
            />
          </div>
          <div class="topbar-component-control topbar-component-control--visibility">
            <Radio
              :model-value="getComponentConfig(component.key)?.visible ?? true"
              :label="$t('settings.visibility')"
              @update:model-value="setComponentVisibility(component.key, $event)"
            />
          </div>
        </div>
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.show_like_notification_reminder')"
        :desc="$t('settings.show_like_notification_reminder_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showLikeNotificationReminder" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.filter_articles_in_moments')"
        :desc="$t('settings.filter_articles_in_moments_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.filterArticlesInMoments" />
      </SettingsItem>

      <div class="topbar-section-actions">
        <Button size="small" type="secondary" @click="resetTopBarComponents">
          <template #left>
            <div i-mingcute:back-line />
          </template>
          {{ $t('common.operation.reset') }}
        </Button>
      </div>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.topbar_user_menu')">
      <SettingsItem
        :title="$t('settings.hide_lv6_last_login_location_in_top_bar_user_pop')"
        :desc="$t('settings.hide_lv6_last_login_location_in_top_bar_user_pop_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.hideTopBarUserPanelLv6LastLoginLocation" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.topbar-settings-groups {
  min-width: 0;
}

.topbar-item-title-with-action {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bew-space-3);
}

.topbar-component-title {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.topbar-component-icon {
  flex: 0 0 auto;
  color: var(--bew-theme-color);
  font-size: var(--bew-icon-size-md);
}

.topbar-component-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--bew-space-4);
}

.topbar-component-control {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  min-height: var(--bew-control-height);
}

.topbar-component-control--visibility {
  margin-left: auto;
}

.topbar-component-control__label {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  white-space: nowrap;
}

.topbar-section-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--bew-space-3);
}

.logo-style-picker {
  --bew-segment-item-active-bg: var(--bew-theme-color-20);
  --bew-segment-item-active-color: var(--bew-theme-color);
  --bew-segment-item-active-shadow: inset 0 0 0 1px var(--bew-theme-color-30);

  &__brand-option {
    padding-inline: var(--bew-space-3);
  }

  &__brand {
    display: block;
    width: calc(var(--bew-control-icon-size) * 4);
    height: var(--bew-control-icon-size);
    flex: none;
    background: currentColor;
    mask-position: center;
    mask-repeat: no-repeat;
    mask-size: contain;
    -webkit-mask-position: center;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-size: contain;
  }
}

.channel-grid {
  // 32px icon + 12px gap + 24px horizontal padding + 2px border + four CJK glyphs.
  --channel-grid-min-item-width: calc(
    var(--bew-icon-size-xl) + var(--bew-space-3) + var(--bew-space-6) + var(--bew-space-0-5) + 4em
  );

  display: grid;
  gap: var(--bew-space-3);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--channel-grid-min-item-width)), 1fr));
  width: 100%;
  grid-auto-flow: row dense;
  font-size: var(--bew-font-size-control);
}

.channel-grid__item {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-width: 0;
  min-height: var(--bew-control-height);
  padding: var(--bew-space-3);
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--bew-duration-normal) var(--bew-ease-standard),
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    color var(--bew-duration-normal) var(--bew-ease-standard),
    transform var(--bew-duration-normal) var(--bew-ease-emphasized);

  &:hover {
    background: var(--bew-fill-2);
    transform: translateY(-2px);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color-60);
    outline-offset: var(--bew-space-0-5);
  }

  &.selected {
    border-color: var(--bew-theme-color-30);
    background: color-mix(in oklab, var(--bew-theme-color-20), transparent 35%);
    color: var(--bew-theme-color);
    transform: none;

    &:hover {
      background: color-mix(in oklab, var(--bew-theme-color-20), transparent 20%);
    }
  }
}

.channel-grid__icon {
  display: grid;
  width: var(--bew-icon-size-xl);
  height: var(--bew-icon-size-xl);
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 30%);
  border-radius: var(--bew-interactive-radius);
  background: color-mix(in oklab, white, transparent 20%);

  svg {
    width: var(--bew-icon-size-lg);
    height: var(--bew-icon-size-lg);
  }

  i {
    font-size: var(--bew-icon-size-lg);
  }
}

.channel-grid__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-grid__overlay {
  display: grid;
  width: var(--bew-icon-size-md);
  height: var(--bew-icon-size-md);
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--bew-badge-radius);
  background: var(--bew-theme-color);
  color: var(--bew-text-auto);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  pointer-events: none;
}

.channel-grid__tip {
  margin-top: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

@media (max-width: 640px) {
  .topbar-component-controls {
    justify-content: flex-start;
  }
}
</style>
