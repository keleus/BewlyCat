<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { VideoPageTopBarConfig } from '~/enums/appEnums'
import { settings } from '~/logic'

import { allChannelConfigs } from '../../../TopBar/constants/channels'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

// 当前选中的顶栏元素
const selectedElement = ref<string>('')

// 顶栏元素类型定义
interface TopBarElement {
  id: string
  label: string
  icon?: string
  type: 'logo' | 'pinnedChannels' | 'pageSwitcher' | 'search' | 'popIcon' | 'avatar'
  supportsBadge?: boolean
  visible?: boolean
}

// 顶栏元素列表
const topBarElements = computed<TopBarElement[]>(() => {
  const elements: TopBarElement[] = [
    {
      id: 'logoAndChannels',
      label: `Logo & ${t('settings.topbar_pinned_channels_title')}`,
      icon: 'i-tabler:brand-bilibili',
      type: 'logo',
    },
    {
      id: 'switchers',
      label: 'Bewly/Bili 切换器',
      icon: 'i-mingcute:arrows-left-right-line',
      type: 'pageSwitcher',
    },
    {
      id: 'search',
      label: t('settings.group_search_bar'),
      icon: 'i-mingcute:search-line',
      type: 'search',
    },
  ]

  // 添加PopIcons（顶栏组件）
  const popIcons = [
    {
      id: 'moments',
      label: t('topbar.moments'),
      icon: 'i-tabler:windmill',
      supportsBadge: true,
    },
    {
      id: 'favorites',
      label: t('topbar.favorites'),
      icon: 'i-mingcute:star-line',
      supportsBadge: true,
    },
    {
      id: 'history',
      label: t('topbar.history'),
      icon: 'i-mingcute:time-line',
      supportsBadge: true,
    },
    {
      id: 'watchLater',
      label: t('topbar.watch_later'),
      icon: 'i-mingcute:carplay-line',
      supportsBadge: true,
    },
    {
      id: 'creatorCenter',
      label: t('topbar.creative_center'),
      icon: 'i-mingcute:bulb-line',
      supportsBadge: false,
    },
    {
      id: 'upload',
      label: t('topbar.upload'),
      icon: 'i-mingcute:upload-line',
      supportsBadge: false,
    },
    {
      id: 'notifications',
      label: t('topbar.notifications'),
      icon: 'i-tabler:bell',
      supportsBadge: true,
    },
  ]

  popIcons.forEach((icon) => {
    const config = settings.value.topBarComponentsConfig?.find(c => c.key === icon.id)
    elements.push({
      ...icon,
      type: 'popIcon',
      visible: config?.visible ?? true,
    })
  })

  // 添加用户头像
  elements.push({
    id: 'avatar',
    label: t('topbar.user_dropdown.account_settings'),
    icon: 'i-mingcute:user-4-line',
    type: 'avatar',
  })

  return elements
})

// 点击顶栏元素
function selectElement(elementId: string) {
  selectedElement.value = selectedElement.value === elementId ? '' : elementId
}

// 获取元素的配置
function getElementConfig(elementId: string) {
  return settings.value.topBarComponentsConfig?.find(c => c.key === elementId)
}

// 角标类型选项
const badgeOptions = computed(() => [
  { label: t('settings.top_bar_icon_badges_opt.number'), value: 'number' },
  { label: t('settings.top_bar_icon_badges_opt.dot'), value: 'dot' },
  { label: t('settings.top_bar_icon_badges_opt.none'), value: 'none' },
])

// 视频页顶栏配置选项
const videoPageTopBarConfigOptions = computed(() => [
  { label: t('settings.video_page_top_bar_config_opt.alwaysShow'), value: VideoPageTopBarConfig.AlwaysShow },
  { label: t('settings.video_page_top_bar_config_opt.alwaysHide'), value: VideoPageTopBarConfig.AlwaysHide },
  { label: t('settings.video_page_top_bar_config_opt.showOnMouse'), value: VideoPageTopBarConfig.ShowOnMouse },
  { label: t('settings.video_page_top_bar_config_opt.showOnScroll'), value: VideoPageTopBarConfig.ShowOnScroll },
])

// 切换组件可见性
function toggleComponentVisibility(elementId: string) {
  const config = settings.value.topBarComponentsConfig?.find(c => c.key === elementId)
  if (config) {
    config.visible = !config.visible
  }
}

// 重置顶栏组件配置
function resetTopBarComponents() {
  const topBarComponents = [
    { key: 'moments', supportsBadge: true },
    { key: 'favorites', supportsBadge: true },
    { key: 'history', supportsBadge: true },
    { key: 'watchLater', supportsBadge: true },
    { key: 'creatorCenter', supportsBadge: false },
    { key: 'upload', supportsBadge: false },
    { key: 'notifications', supportsBadge: true },
  ]

  settings.value.topBarComponentsConfig = topBarComponents.map((component) => {
    return {
      key: component.key,
      visible: true,
      badgeType: component.supportsBadge ? 'number' : 'none',
    }
  })
}

// 重置固定分区
function resetPinnedChannels() {
  settings.value.topBarPinnedChannels = []
}

// 常驻分区相关
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
  <SettingsItemGroup :title="$t('settings.group_topbar')">
    <SettingsItem>
      <template #bottom>
        <!-- 提示文字 -->
        <div text-sm opacity-70 mb-3>
          点击顶栏对应元素进行设置
        </div>

        <!-- 缩略顶栏预览 -->
        <div
          class="topbar-preview"
          bg="$bew-fill-1" rounded="$bew-radius"
          p="x-6 y-3" mb-4
          border="1 $bew-border-color"
        >
          <div
            flex="~ items-center justify-between gap-4"
            w-full
          >
            <!-- 左侧：Logo(含固定分区) + 切换器 -->
            <div flex="~ items-center gap-2">
              <!-- Logo + 固定分区 -->
              <div
                class="topbar-element logo-element"
                :class="{ active: selectedElement === 'logoAndChannels' }"
                @click="selectElement('logoAndChannels')"
              >
                <div :class="topBarElements.find(e => e.id === 'logoAndChannels')?.icon" text-xl />
                <div v-if="pinnedChannelKeys.length > 0" class="pinned-count">
                  {{ pinnedChannelKeys.length }}
                </div>
              </div>

              <!-- Bewly/Bili 切换器 -->
              <div
                class="topbar-element switchers-element"
                :class="{ active: selectedElement === 'switchers' }"
                @click="selectElement('switchers')"
              >
                <div i-mingcute:transfer-3-line text-lg />
              </div>
            </div>

            <!-- 中间：搜索框 -->
            <div
              class="topbar-element search-element"
              :class="{ active: selectedElement === 'search' }"
              flex="1"
              @click="selectElement('search')"
            >
              <div :class="topBarElements.find(e => e.id === 'search')?.icon" text-base mr-2 />
              <div text-sm opacity-60>
                {{ $t('settings.group_search_bar') }}
              </div>
            </div>

            <!-- 右侧：PopIcons + 头像 -->
            <div flex="~ items-center gap-2">
              <!-- PopIcons -->
              <template
                v-for="element in topBarElements.filter(e => e.type === 'popIcon')"
                :key="element.id"
              >
                <div
                  class="topbar-element"
                  :class="{
                    active: selectedElement === element.id,
                    disabled: !element.visible,
                  }"
                  @click="selectElement(element.id)"
                >
                  <div :class="element.icon" text-base />
                  <div v-if="!element.visible" class="disabled-overlay" />
                </div>
              </template>

              <!-- 头像 -->
              <div
                class="topbar-element avatar-element"
                :class="{ active: selectedElement === 'avatar' }"
                @click="selectElement('avatar')"
              >
                <div :class="topBarElements.find(e => e.id === 'avatar')?.icon" text-base />
              </div>
            </div>
          </div>
        </div>

        <!-- 元素配置区域 -->
        <Transition name="fade" mode="out-in">
          <div v-if="selectedElement" class="element-config" bg="$bew-fill-2" rounded="$bew-radius" p-4>
            <!-- Logo + 固定分区配置 -->
            <div v-if="selectedElement === 'logoAndChannels'" flex="~ col gap-4">
              <div flex="~ items-center justify-between">
                <div text-lg font-semibold>
                  Logo & {{ $t('settings.topbar_pinned_channels_title') }}
                </div>
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
              <div text-sm opacity-80 mb-2>
                Logo 点击可展开频道列表，以下选择的频道将固定显示在顶栏上。{{ $t('settings.topbar_pinned_channels_hint') }}
              </div>

              <!-- 分区网格 -->
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
            </div>

            <!-- Bewly/Bili 切换器配置 -->
            <div v-else-if="selectedElement === 'switchers'" flex="~ col gap-4">
              <div text-lg font-semibold>
                Bewly/Bili 切换器
              </div>

              <div bg="$bew-fill-1" rounded="$bew-radius" p-3>
                <SettingsItem :title="$t('settings.show_bewly_or_bili_page_switcher')">
                  <Radio v-model="settings.showBewlyOrBiliPageSwitcher" />
                </SettingsItem>
                <div text-sm opacity-70 mt-2>
                  在首页顶栏 Logo 旁显示页面切换器，可在 BewlyCat 页面和 Bilibili 原版页面之间切换。
                </div>
              </div>

              <div bg="$bew-fill-1" rounded="$bew-radius" p-3>
                <SettingsItem :title="$t('settings.show_bewly_or_bili_top_bar_switcher')">
                  <Radio v-model="settings.showBewlyOrBiliTopBarSwitcher" />
                </SettingsItem>
                <div text-sm opacity-70 mt-2>
                  在页面顶部悬停时显示顶栏切换器，可在 BewlyCat 顶栏和 Bilibili 原版顶栏之间切换。
                </div>
              </div>
            </div>

            <!-- 搜索框配置 -->
            <div v-else-if="selectedElement === 'search'" flex="~ col gap-4">
              <div text-lg font-semibold>
                {{ $t('settings.group_search_bar') }}
              </div>
              <SettingsItem :title="$t('settings.show_hot_search_in_top_bar')" :desc="$t('settings.show_hot_search_in_top_bar_desc')">
                <Radio v-model="settings.showHotSearchInTopBar" />
              </SettingsItem>
              <SettingsItem :title="$t('settings.show_search_recommendation')" :desc="$t('settings.show_search_recommendation_desc')">
                <Radio v-model="settings.showSearchRecommendation" />
              </SettingsItem>
            </div>

            <!-- PopIcon 配置 -->
            <div
              v-else-if="topBarElements.find(e => e.id === selectedElement && e.type === 'popIcon')"
              flex="~ col gap-4"
            >
              <div text-lg font-semibold>
                {{ topBarElements.find(e => e.id === selectedElement)?.label }}
              </div>

              <SettingsItem :title="$t('settings.visibility')">
                <Radio
                  :model-value="getElementConfig(selectedElement)?.visible ?? true"
                  @update:model-value="toggleComponentVisibility(selectedElement)"
                />
              </SettingsItem>

              <SettingsItem
                v-if="topBarElements.find(e => e.id === selectedElement)?.supportsBadge"
                :title="$t('settings.badge_type')"
              >
                <Select
                  v-model="getElementConfig(selectedElement)!.badgeType"
                  :options="badgeOptions"
                  w="full"
                  :disabled="!getElementConfig(selectedElement)?.visible"
                />
              </SettingsItem>
            </div>

            <!-- 头像配置 -->
            <div v-else-if="selectedElement === 'avatar'" flex="~ col gap-4">
              <div text-lg font-semibold>
                {{ $t('topbar.user_dropdown.account_settings') }}
              </div>
              <SettingsItem :title="$t('settings.show_bcoin_receive_reminder')">
                <Radio v-model="settings.showBCoinReceiveReminder" />
              </SettingsItem>
              <SettingsItem
                v-if="settings.showBCoinReceiveReminder"
                :title="$t('settings.auto_receive_bcoin_coupon')"
                :desc="$t('settings.auto_receive_bcoin_coupon_desc')"
              >
                <Radio v-model="settings.autoReceiveBCoinCoupon" />
              </SettingsItem>
            </div>
          </div>
        </Transition>

        <!-- 全局设置 -->
        <div mt-6 pt-6 border-t="1 $bew-border-color">
          <div flex="~ col gap-4">
            <SettingsItem :title="$t('settings.auto_hide_top_bar')">
              <Radio v-model="settings.autoHideTopBar" />
            </SettingsItem>

            <SettingsItem
              :title="$t('settings.video_page_top_bar_config')"
              :desc="$t('settings.video_page_top_bar_config_desc')"
            >
              <Select v-model="settings.videoPageTopBarConfig" :options="videoPageTopBarConfigOptions" w="full" />
            </SettingsItem>

            <SettingsItem :title="$t('settings.always_use_transparent_top_bar')">
              <Radio v-model="settings.alwaysUseTransparentTopBar" />
            </SettingsItem>

            <SettingsItem :title="$t('settings.show_top_bar_theme_color_gradient')">
              <Radio v-model="settings.showTopBarThemeColorGradient" />
            </SettingsItem>

            <SettingsItem :title="$t('settings.open_notifications_page_as_drawer')">
              <Radio v-model="settings.openNotificationsPageAsDrawer" />
            </SettingsItem>

            <div flex="~ items-center justify-end" mt-4>
              <Button size="small" type="secondary" @click="resetTopBarComponents">
                <template #left>
                  <div i-mingcute:back-line />
                </template>
                {{ $t('common.operation.reset') }}
              </Button>
            </div>
          </div>
        </div>
      </template>
    </SettingsItem>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
.topbar-preview {
  position: relative;
}

.topbar-element {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  border-radius: var(--bew-radius);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--bew-text-2);
  position: relative;

  &:hover {
    background: var(--bew-fill-2);
    color: var(--bew-text-1);
  }

  &.active {
    background: var(--bew-theme-color-20);
    color: var(--bew-theme-color);
  }

  &.disabled {
    opacity: 0.4;

    &:hover {
      opacity: 0.6;
    }
  }

  .disabled-overlay {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      var(--bew-fill-3) 4px,
      var(--bew-fill-3) 8px
    );
    border-radius: inherit;
    opacity: 0.3;
    pointer-events: none;
  }
}

.search-element {
  max-width: 300px;
  justify-content: flex-start;
}

.avatar-element {
  border-radius: 50%;
}

.logo-element {
  position: relative;

  .pinned-count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--bew-theme-color);
    color: white;
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.element-config {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.link {
  color: var(--bew-theme-color);
  text-decoration: underline;
}

.topbar-switcher {
  min-width: 80px;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
}

.switchers-element {
  min-width: 40px;
  justify-content: center;
}

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
    border-radius: 12px;
    background: color-mix(in oklab, white, transparent 20%);
    border: 1px solid color-mix(in oklab, var(--bew-border-color), transparent 30%);

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
