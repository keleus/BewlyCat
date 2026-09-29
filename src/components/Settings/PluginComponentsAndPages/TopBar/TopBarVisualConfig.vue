<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import bilibiliBrandLogoUrl from '~/assets/branding/bilibili-brand-logo.png'
import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'
import type { TopBarStyle } from '~/logic/storage'
import type { NotificationBadgeSettings } from '~/utils/notificationBadge'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import PinnedChannelsManager from './PinnedChannelsManager.vue'

const { t } = useI18n()

type BadgeType = 'number' | 'dot' | 'none'
type NotificationBadgeType = keyof NotificationBadgeSettings

const notificationTypes: { key: NotificationBadgeType, title: string }[] = [
  { key: 'showReplyNotificationReminder', title: 'topbar.noti_dropdown.replys' },
  { key: 'showAtNotificationReminder', title: 'topbar.noti_dropdown.mentions' },
  { key: 'showLikeNotificationReminder', title: 'topbar.noti_dropdown.likes' },
  { key: 'showSystemNotificationReminder', title: 'topbar.noti_dropdown.messages' },
  { key: 'showFollowedPrivateMessageUnreadCount', title: 'settings.notification_followed_private_messages' },
  { key: 'showUnfollowedPrivateMessageUnreadCount', title: 'settings.notification_unfollowed_private_messages' },
]

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
    supportsBadge: false,
  },
  {
    key: 'history',
    i18nKey: 'topbar.history',
    icon: 'i-mingcute:time-line',
    supportsBadge: false,
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
  {
    key: 'topBarSwitcher',
    i18nKey: 'topbar.top_bar_switcher',
    icon: 'i-mingcute:refresh-2-line',
    supportsBadge: false,
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

const topBarStyleOptions = computed<{ label: string, value: TopBarStyle }[]>(() => [
  { label: t('settings.top_bar_style_opt.default'), value: 'default' },
  { label: t('settings.top_bar_style_opt.frosted_glass'), value: 'frostedGlass' },
  { label: t('settings.top_bar_style_opt.transparent'), value: 'transparent' },
  { label: t('settings.top_bar_style_opt.exp_default'), value: 'expDefault' },
  { label: t('settings.top_bar_style_opt.exp_frosted_glass'), value: 'expFrostedGlass' },
  { label: t('settings.top_bar_style_opt.exp_transparent'), value: 'expTransparent' },
])

const topBarModeOptions = computed(() => [
  { label: t('settings.top_bar_mode_opt.original'), value: true },
  { label: t('settings.top_bar_mode_opt.bewly'), value: false },
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
  const currentConfig = settings.value.topBarComponentsConfig
  if (!Array.isArray(currentConfig)) {
    resetTopBarComponents()
    return
  }

  const missingConfig = topBarComponents.value
    .filter(component => !currentConfig.some(config => config.key === component.key))
    .map(createDefaultComponentConfig)

  if (missingConfig.length)
    settings.value.topBarComponentsConfig = [...currentConfig, ...missingConfig]
}

function setComponentVisibility(componentKey: string, visible: boolean) {
  const config = getComponentConfig(componentKey)
  if (config)
    config.visible = visible
}

function setComponentBadgeType(componentKey: string, badgeValue: BadgeType) {
  const config = getComponentConfig(componentKey)
  if (config)
    config.badgeType = badgeValue
}

ensureTopBarComponentsConfig()
watch(topBarComponents, ensureTopBarComponentsConfig, { immediate: true })
</script>

<template>
  <div class="topbar-settings-groups" :data-settings-title="$t('settings.group_topbar')">
    <SettingsItemGroup
      :title="$t('settings.topbar_style_settings')"
      :desc="$t('settings.topbar_style_settings_desc')"
    >
      <SettingsItem
        :title="$t('settings.top_bar_style')"
        :desc="$t('settings.top_bar_style_desc')"
        right-width="auto"
      >
        <Select v-model="settings.topBarStyle" :options="topBarStyleOptions" w="220px" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.show_top_bar_theme_color_gradient')" right-width="auto">
        <Radio v-model="settings.showTopBarThemeColorGradient" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.topbar_display_settings')"
      :desc="$t('settings.topbar_display_settings_desc')"
    >
      <SettingsItem :title="$t('settings.topbar_visibility')" :desc="$t('settings.topbar_visibility_desc')" right-width="auto">
        <Radio v-model="settings.enableTopBar" :label="settings.enableTopBar ? $t('settings.chk_box.show') : $t('settings.chk_box.hidden')" />
      </SettingsItem>
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
      <SettingsItem :title="$t('settings.open_notifications_page_as_drawer')" right-width="auto">
        <Radio v-model="settings.openNotificationsPageAsDrawer" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.filter_articles_in_moments')"
        :desc="$t('settings.filter_articles_in_moments_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.filterArticlesInMoments" />
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
            <span
              class="logo-style-picker__icon bew-segment-control__icon i-tabler:brand-bilibili"
              aria-hidden="true"
            />
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
      :title="$t('settings.topbar_switchers')"
      :desc="$t('settings.topbar_switchers_desc')"
    >
      <SettingsItem
        :title="$t('settings.show_bewly_or_bili_page_switcher')"
        :desc="$t('settings.show_bewly_or_bili_page_switcher_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showBewlyOrBiliPageSwitcher" />
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.show_bewly_or_bili_page_switcher_on_more_pages')"
        :desc="$t('settings.show_bewly_or_bili_page_switcher_on_more_pages_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showBewlyOrBiliPageSwitcherOnMorePages" />
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
      :title="$t('settings.notification_badge_types')"
      :desc="$t('settings.notification_badge_types_desc')"
    >
      <SettingsItem
        v-for="type in notificationTypes"
        :key="type.key"
        :title="$t(type.title)"
        right-width="auto"
      >
        <Radio v-model="settings[type.key]" />
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
          <div v-if="component.key === 'topBarSwitcher'" class="topbar-component-control topbar-component-control--mode">
            <span class="topbar-component-control__label">{{ $t('settings.top_bar_mode') }}</span>
            <Select
              v-model="settings.useOriginalBilibiliTopBar"
              :options="topBarModeOptions"
              :disabled="!settings.enableTopBar"
              w="160px"
            />
          </div>
          <div v-else-if="component.supportsBadge" class="topbar-component-control topbar-component-control--badge">
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

    <SettingsItemGroup
      :title="$t('settings.group_topbar_pinned_channels')"
      :desc="$t('settings.topbar_pinned_channels_desc')"
      icon="i-tabler:pin-filled"
    >
      <PinnedChannelsManager />
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
  padding: var(--bew-space-3) 0 var(--bew-space-4);
}

.logo-style-picker {
  --bew-segment-item-active-bg: var(--bew-theme-color-20);
  --bew-segment-item-active-color: var(--bew-theme-color);
  --bew-segment-item-active-shadow: inset 0 0 0 1px var(--bew-theme-color-30);

  &__brand-option {
    padding-inline: var(--bew-space-3);
  }

  &__icon {
    width: var(--bew-icon-size-md);
    height: var(--bew-icon-size-md);
    font-size: var(--bew-icon-size-md);
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

@media (max-width: 640px) {
  .topbar-component-controls {
    justify-content: flex-start;
  }
}
</style>
