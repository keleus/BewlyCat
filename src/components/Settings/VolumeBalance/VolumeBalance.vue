<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'
import { clearAllUpVolumeConfigs, removeUpVolumeConfig, saveUpVolumeConfig } from '~/utils/volumeBalance'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()
const searchQuery = ref('')

// 过滤后的UP主配置列表
const filteredUpVolumeConfigs = computed(() => {
  if (!searchQuery.value.trim()) {
    return settings.value.upVolumeConfigs
  }

  const query = searchQuery.value.toLowerCase().trim()
  return settings.value.upVolumeConfigs.filter(config =>
    config.name.toLowerCase().includes(query)
    || config.uid.includes(query),
  )
})

function handleClearAllUpVolumeConfigs() {
  clearAllUpVolumeConfigs()
}

function handleRemoveUpVolumeConfig(uid: string) {
  removeUpVolumeConfig(uid)
}

function handleUpdateVolumeOffset(uid: string, name: string, newOffset: number) {
  // 确保偏移量在合理范围内
  const clampedOffset = Math.max(-100, Math.min(100, newOffset))
  saveUpVolumeConfig(uid, name, clampedOffset)
}
</script>

<template>
  <div>
    <!-- 音量均衡设置组 -->
    <SettingsItemGroup :title="t('settings.volume_balance.title')">
      <SettingsItem :title="t('settings.volume_balance.enable')" :desc="t('settings.volume_balance.enable_desc')">
        <Radio v-model="settings.enableVolumeBalance" />
      </SettingsItem>

      <SettingsItem v-if="settings.enableVolumeBalance" :title="t('settings.volume_balance.base_volume')" :desc="t('settings.volume_balance.base_volume_desc')">
        <div flex="~ justify-end items-center" w-full gap-2>
          <Input
            v-model="settings.baseVolume"
            type="number"
            :min="0"
            :max="100"
            w-20
          />
          <span text="sm $bew-text-2">%</span>
        </div>
      </SettingsItem>

      <SettingsItem
        v-if="settings.enableVolumeBalance"
        class="unrestricted-width-settings-item"
        :title="t('settings.volume_balance.up_configs')"
        :desc="t('settings.volume_balance.up_configs_desc')"
      >
        <template #bottom>
          <div v-if="settings.upVolumeConfigs.length === 0" text="sm $bew-text-2" p-4 text-center>
            {{ t('settings.volume_balance.no_configs') }}
          </div>
          <div v-else>
            <!-- 搜索框和清空按钮 -->
            <div flex="~ justify-between items-center" mb-4 gap-3>
              <div flex="~ items-center" gap-2 flex-1>
                <div i-mingcute:search-line text="$bew-text-2" />
                <Input
                  v-model="searchQuery"
                  :placeholder="t('settings.volume_balance.search_placeholder')"
                  flex-1
                />
              </div>
              <Button type="secondary" size="small" @click="handleClearAllUpVolumeConfigs">
                <template #left>
                  <div i-uil:trash />
                </template>
                {{ t('settings.volume_balance.clear_all_configs') }}
              </Button>
            </div>

            <!-- UP主配置列表 -->
            <div v-if="filteredUpVolumeConfigs.length === 0" text="sm $bew-text-2" p-4 text-center>
              {{ t('settings.volume_balance.no_search_results') }}
            </div>
            <div v-else space-y-2>
              <div
                v-for="config in filteredUpVolumeConfigs"
                :key="config.uid"
                flex="~ items-center justify-between"
                p-3
                bg="$bew-fill-2"
                rounded
              >
                <div flex="~ col" flex-1>
                  <div font-medium>
                    {{ config.name }}
                  </div>
                  <div text="sm $bew-text-2">
                    UID: {{ config.uid }}
                  </div>
                </div>
                <div flex="~ items-center" gap-3>
                  <!-- 可编辑的音量偏移 -->
                  <div flex="~ items-center" gap-1>
                    <Input
                      :model-value="config.volumeOffset"
                      type="number"
                      :min="-100"
                      :max="100"
                      w-16
                      text-center
                      @update:model-value="(value) => handleUpdateVolumeOffset(config.uid, config.name, Number(value))"
                    />
                    <span text="sm $bew-text-2">%</span>
                  </div>
                  <Button
                    type="secondary"
                    size="small"
                    @click="handleRemoveUpVolumeConfig(config.uid)"
                  >
                    {{ t('settings.volume_balance.delete') }}
                  </Button>
                </div>
              </div>
            </div>

            <!-- 搜索结果统计 -->
            <div v-if="searchQuery.trim()" text="sm $bew-text-2" mt-2 text-center>
              {{ t('settings.volume_balance.search_results_count', { current: filteredUpVolumeConfigs.length, total: settings.upVolumeConfigs.length }) }}
            </div>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <!-- 使用说明 -->
    <SettingsItemGroup :title="t('settings.volume_balance.usage_guide.title')">
      <SettingsItem :title="t('settings.volume_balance.usage_guide.title')">
        <template #desc>
          <div text="sm $bew-text-2" space-y-2 p-4>
            <pre>{{ t('settings.volume_balance.usage_guide.desc') }}</pre>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
