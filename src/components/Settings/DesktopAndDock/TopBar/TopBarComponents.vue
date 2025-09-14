<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Select from '~/components/Select.vue'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

const { t } = useI18n()

// 顶栏图标角标选项
const badgeOptions = computed(() => {
  return [
    {
      label: t('settings.top_bar_icon_badges_opt.number'),
      value: 'number',
    },
    {
      label: t('settings.top_bar_icon_badges_opt.dot'),
      value: 'dot',
    },
    {
      label: t('settings.top_bar_icon_badges_opt.none'),
      value: 'none',
    },
  ]
})

// 顶栏组件配置
const topBarComponents = computed(() => {
  return [
    {
      key: 'moments',
      i18nKey: 'topbar.moments',
      icon: 'i-mingcute:planet-line',
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
      icon: 'i-mingcute:history-line',
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
      icon: 'i-mingcute:add-circle-line',
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
      icon: 'i-mingcute:notification-line',
      supportsBadge: true,
    },
  ]
})

// 重置顶栏组件配置
function resetTopBarComponents() {
  settings.value.topBarComponentsConfig = topBarComponents.value.map((component) => {
    return {
      key: component.key,
      visible: true,
      badgeType: component.supportsBadge ? 'number' : 'none',
    }
  })
}

// 切换组件可见性
function handleToggleComponent(index: number) {
  if (settings.value.topBarComponentsConfig[index]) {
    settings.value.topBarComponentsConfig[index].visible = !settings.value.topBarComponentsConfig[index].visible
  }
}

// 初始化配置（如果不存在）
if (!settings.value.topBarComponentsConfig || settings.value.topBarComponentsConfig.length === 0) {
  resetTopBarComponents()
}

// 确保配置数组与组件数组长度一致
watchEffect(() => {
  if (settings.value.topBarComponentsConfig && topBarComponents.value) {
    const configKeys = settings.value.topBarComponentsConfig.map(c => c.key)
    const componentKeys = topBarComponents.value.map(c => c.key)

    // 如果配置不完整，重新初始化
    if (configKeys.length !== componentKeys.length || !componentKeys.every(key => configKeys.includes(key))) {
      resetTopBarComponents()
    }
  }
})
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_topbar_components')">
    <SettingsItem :desc="$t('settings.topbar_components_adjustment_desc')">
      <template #title>
        <div flex="~ gap-4 items-center">
          {{ $t('settings.topbar_components_adjustment') }}
          <Button size="small" type="secondary" @click="resetTopBarComponents">
            <template #left>
              <div i-mingcute:back-line />
            </template>
            {{ $t('common.operation.reset') }}
          </Button>
        </div>
      </template>

      <template #bottom>
        <div
          style="display: flex; gap: 0.5rem; flex-wrap: wrap; flex-direction: column;"
        >
          <div
            v-for="(component, index) in topBarComponents"
            :key="component.key"
            flex="~ gap-2 justify-between items-center wrap"
            p="x-4 y-2"
            bg="$bew-fill-1"
            rounded="$bew-radius"
            cursor-pointer
            duration-300
            :style="{
              background: settings.topBarComponentsConfig[index]?.visible ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
              color: settings.topBarComponentsConfig[index]?.visible ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
            }"
            @click="handleToggleComponent(index)"
          >
            <div flex="~ gap-2 items-center">
              <div :class="component.icon" />
              <div w-80px text-ellipsis>
                {{ $t(component.i18nKey) }}
              </div>
            </div>
            <div flex="~ gap-4 items-center justify-between wrap" @click.stop>
              <div v-if="component.supportsBadge && settings.topBarComponentsConfig[index]?.visible" flex="~ items-center gap-2">
                {{ $t('settings.badge_type') }}
                <Select
                  v-model="settings.topBarComponentsConfig[index].badgeType"
                  :options="badgeOptions"
                  w="120px"
                />
              </div>
              <div v-else h="32px" />
            </div>
          </div>
        </div>
      </template>
    </SettingsItem>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
</style>
