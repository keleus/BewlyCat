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

import { genreChannelConfigs, MAX_PINNED_CHANNELS, otherChannelConfigs } from '../../../TopBar/constants/channels'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

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

const showChannelPicker = ref(false)
const channelQuery = ref('')
const undoPinnedKeys = ref<string[] | null>(null)

interface ChannelOption {
  value: string
  label: string
  icon: string
  color?: string
}

function toChannelOptions(configs: typeof genreChannelConfigs): ChannelOption[] {
  return configs.map((config) => {
    return {
      value: config.key,
      label: t(config.nameKey),
      icon: config.icon,
      color: config.color,
    }
  })
}

const genreOptions = computed(() => toChannelOptions(genreChannelConfigs))
const otherOptions = computed(() => toChannelOptions(otherChannelConfigs))
const channelOptions = computed(() => [...genreOptions.value, ...otherOptions.value])

const pinnedChannelKeys = computed(() => settings.value.topBarPinnedChannels)

function toggleChannelPicker() {
  showChannelPicker.value = !showChannelPicker.value
  if (showChannelPicker.value)
    channelQuery.value = ''
}

function resetPinnedChannels() {
  undoPinnedKeys.value = [...pinnedChannelKeys.value]
  settings.value.topBarPinnedChannels = []
  showChannelPicker.value = false
}

const selectedChannelOptions = computed(() => pinnedChannelKeys.value.map(key =>
  channelOptions.value.find(option => option.value === key) ?? { value: key, label: key, icon: 'i-mingcute:question-line' },
))

function availableOptions(options: ChannelOption[]) {
  const query = channelQuery.value.trim().toLocaleLowerCase()
  return options.filter(option => !pinnedChannelKeys.value.includes(option.value)
    && (!query || option.label.toLocaleLowerCase().includes(query)))
}

const availableGenreOptions = computed(() => availableOptions(genreOptions.value))
const availableOtherOptions = computed(() => availableOptions(otherOptions.value))

function addChannel(value: string) {
  if (pinnedChannelKeys.value.length >= MAX_PINNED_CHANNELS || pinnedChannelKeys.value.includes(value))
    return
  undoPinnedKeys.value = null
  settings.value.topBarPinnedChannels = [...pinnedChannelKeys.value, value]
  if (settings.value.topBarPinnedChannels.length >= MAX_PINNED_CHANNELS)
    showChannelPicker.value = false
}

function removeChannel(index: number) {
  undoPinnedKeys.value = null
  settings.value.topBarPinnedChannels = pinnedChannelKeys.value.filter((_, currentIndex) => currentIndex !== index)
}

function moveChannel(index: number, offset: -1 | 1) {
  const target = index + offset
  if (target < 0 || target >= pinnedChannelKeys.value.length)
    return
  undoPinnedKeys.value = null
  const reordered = [...pinnedChannelKeys.value]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  settings.value.topBarPinnedChannels = reordered
}

function undoResetPinnedChannels() {
  if (!undoPinnedKeys.value)
    return
  settings.value.topBarPinnedChannels = undoPinnedKeys.value
  undoPinnedKeys.value = null
}
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
          <div class="pinned-channel-toolbar">
            <span>{{ $t('settings.topbar_pinned_channels_count', { count: pinnedChannelKeys.length, max: MAX_PINNED_CHANNELS }) }}</span>
            <button
              type="button"
              class="pinned-channel-action"
              :disabled="pinnedChannelKeys.length >= MAX_PINNED_CHANNELS"
              :aria-expanded="showChannelPicker"
              @click="toggleChannelPicker"
            >
              <i i-mingcute:add-line aria-hidden="true" />
              {{ $t('settings.topbar_pinned_channels_add') }}
            </button>
          </div>
          <p v-if="pinnedChannelKeys.length > MAX_PINNED_CHANNELS" class="pinned-channel-message" role="status">
            {{ $t('settings.topbar_pinned_channels_legacy_limit') }}
          </p>
          <p v-else-if="pinnedChannelKeys.length === MAX_PINNED_CHANNELS" class="pinned-channel-message" role="status">
            {{ $t('settings.topbar_pinned_channels_limit') }}
          </p>
          <p v-if="!selectedChannelOptions.length" class="pinned-channel-message">
            {{ $t('settings.topbar_pinned_channels_empty') }}
          </p>
          <ol v-else class="pinned-channel-list">
            <li v-for="(option, index) in selectedChannelOptions" :key="`${option.value}-${index}`" class="pinned-channel-list__item">
              <span class="pinned-channel-list__order">{{ index + 1 }}</span>
              <span class="channel-grid__icon">
                <svg v-if="option.icon.startsWith('#')" aria-hidden="true"><use :xlink:href="option.icon" /></svg>
                <i v-else :class="option.icon" :style="{ color: option.color ?? '' }" aria-hidden="true" />
              </span>
              <span class="pinned-channel-list__label">{{ option.label }}</span>
              <span v-if="index >= MAX_PINNED_CHANNELS" class="pinned-channel-list__overflow">{{ $t('settings.topbar_pinned_channels_overflow') }}</span>
              <div class="pinned-channel-list__actions">
                <button type="button" :disabled="index === 0" :aria-label="$t('settings.topbar_pinned_channels_move_up', { name: option.label })" @click="moveChannel(index, -1)">
                  <i i-mingcute:up-line aria-hidden="true" />
                </button>
                <button type="button" :disabled="index === pinnedChannelKeys.length - 1" :aria-label="$t('settings.topbar_pinned_channels_move_down', { name: option.label })" @click="moveChannel(index, 1)">
                  <i i-mingcute:down-line aria-hidden="true" />
                </button>
                <button type="button" :aria-label="$t('settings.topbar_pinned_channels_remove', { name: option.label })" @click="removeChannel(index)">
                  <i i-mingcute:close-line aria-hidden="true" />
                </button>
              </div>
            </li>
          </ol>
          <div v-if="undoPinnedKeys" class="pinned-channel-message" role="status">
            {{ $t('settings.topbar_pinned_channels_cleared') }}
            <button type="button" class="pinned-channel-action" @click="undoResetPinnedChannels">
              {{ $t('settings.topbar_pinned_channels_undo') }}
            </button>
          </div>
          <p class="channel-grid__tip">
            {{ $t('settings.topbar_pinned_channels_order_tip') }}
          </p>
          <div v-if="showChannelPicker && pinnedChannelKeys.length < MAX_PINNED_CHANNELS" class="channel-picker">
            <div class="channel-picker__header">
              <input v-model="channelQuery" type="search" :placeholder="$t('settings.topbar_pinned_channels_search')" :aria-label="$t('settings.topbar_pinned_channels_search')">
              <button type="button" :aria-label="$t('settings.topbar_pinned_channels_close')" @click="showChannelPicker = false">
                <i i-mingcute:close-line aria-hidden="true" />
              </button>
            </div>
            <div class="channel-picker__results">
              <template v-for="group in [{ key: 'genre', title: $t('settings.topbar_pinned_channels_genres'), options: availableGenreOptions }, { key: 'other', title: $t('settings.topbar_pinned_channels_others'), options: availableOtherOptions }]" :key="group.key">
                <div v-if="group.options.length" class="channel-picker__group">
                  <h4>{{ group.title }}</h4>
                  <div class="channel-grid">
                    <button v-for="option in group.options" :key="option.value" type="button" class="channel-grid__item" @click="addChannel(option.value)">
                      <span class="channel-grid__icon">
                        <svg v-if="option.icon.startsWith('#')" aria-hidden="true"><use :xlink:href="option.icon" /></svg>
                        <i v-else :class="option.icon" :style="{ color: option.color ?? '' }" aria-hidden="true" />
                      </span>
                      <span class="channel-grid__label">{{ option.label }}</span>
                    </button>
                  </div>
                </div>
              </template>
              <p v-if="!availableGenreOptions.length && !availableOtherOptions.length" class="pinned-channel-message">
                {{ $t('settings.topbar_pinned_channels_no_results') }}
              </p>
            </div>
          </div>
        </template>
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

.channel-grid__tip {
  margin-top: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.pinned-channel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.pinned-channel-action,
.channel-picker__header button,
.pinned-channel-list__actions button {
  display: inline-flex;
  min-width: var(--bew-control-height);
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-1);
  padding: var(--bew-space-1);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--bew-fill-2);
  }

  &:focus-visible {
    outline: 2px solid var(--bew-theme-color);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.pinned-channel-message {
  margin-top: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.pinned-channel-list {
  display: grid;
  gap: var(--bew-space-2);
  margin: var(--bew-space-3) 0 0;
  padding: 0;
  list-style: none;
}

.pinned-channel-list__item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
}

.pinned-channel-list__order {
  min-width: var(--bew-icon-size-md);
  color: var(--bew-text-2);
  text-align: center;
}

.pinned-channel-list__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pinned-channel-list__overflow {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
}

.pinned-channel-list__actions {
  display: flex;
  flex: none;
  gap: var(--bew-space-1);
}

.channel-picker {
  margin-top: var(--bew-space-3);
  padding: var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-panel-radius);
  background: var(--bew-elevated);
}

.channel-picker__header {
  display: flex;
  gap: var(--bew-space-2);

  input {
    min-width: 0;
    height: var(--bew-control-height);
    flex: 1;
    padding-inline: var(--bew-space-3);
    border: 1px solid var(--bew-border-color);
    border-radius: var(--bew-interactive-radius);
    background: var(--bew-fill-1);
    color: var(--bew-text-1);
  }
}

.channel-picker__results {
  max-height: min(50dvh, 440px);
  margin-top: var(--bew-space-3);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.channel-picker__group + .channel-picker__group {
  margin-top: var(--bew-space-4);
}

.channel-picker__group h4 {
  margin: 0 0 var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
}

@media (max-width: 640px) {
  .topbar-component-controls {
    justify-content: flex-start;
  }
}
</style>
