<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue' // Assuming Button component exists
import Radio from '~/components/Radio.vue'
import { originalSettings, settings } from '~/logic'
import type {
  BaseShortcutSetting,
  ShortcutsSettings,
} from '~/logic/storage'
import { setupShortcutHandlers } from '~/utils/shortcuts'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

// 直接使用settings以保持响应式
// settings 是 RemovableRef<Settings> 类型，需要使用 settings 访问其值

const { t } = useI18n()

// --- 类型定义 ---
interface OfficialShortcut {
  key: string
  description: string
}

type ConfigurableShortcutId = keyof ShortcutsSettings

interface ConfigurableShortcutDefinition {
  id: ConfigurableShortcutId
  name: string
  description: string
  defaultKey: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ConfigurableShortcutDefinition[]
}

// --- 快捷键数据 ---
const officialShortcuts: OfficialShortcut[] = [
  { key: 'Space', description: t('settings.shortcuts.official.play_pause') },
  { key: '→', description: t('settings.shortcuts.official.forward') },
  { key: '←', description: t('settings.shortcuts.official.backward') },
  { key: '↑', description: t('settings.shortcuts.official.volume_up') },
  { key: '↓', description: t('settings.shortcuts.official.volume_down') },
  { key: 'Esc', description: t('settings.shortcuts.official.exit_fullscreen') },
  { key: 'F', description: t('settings.shortcuts.official.fullscreen') },
  { key: 'D', description: t('settings.shortcuts.official.danmu_toggle') },
  { key: 'M', description: t('settings.shortcuts.official.mute') },
  { key: '[', description: t('settings.shortcuts.official.prev_video') },
  { key: ']', description: t('settings.shortcuts.official.next_video') },
  { key: 'Shift + 1', description: t('settings.shortcuts.official.speed_1') },
  { key: 'Shift + 2', description: t('settings.shortcuts.official.speed_2') },
  { key: 'Enter', description: t('settings.shortcuts.official.input_danmu') },
]

const configurableShortcutsGroups: ShortcutGroup[] = [
  {
    title: t('settings.shortcuts.group.homepage'),
    shortcuts: [
      { id: 'homeRefresh', name: t('settings.shortcuts.home_refresh'), description: t('settings.shortcuts.home_refresh_desc'), defaultKey: 'R' },
    ],
  },
  {
    title: t('settings.shortcuts.group.general'),
    shortcuts: [
      { id: 'danmuStatus', name: t('settings.shortcuts.danmu_status'), description: t('settings.shortcuts.danmu_status_desc'), defaultKey: 'Shift+D' },
      { id: 'webFullscreen', name: t('settings.shortcuts.web_fullscreen'), description: t('settings.shortcuts.web_fullscreen_desc'), defaultKey: 'W' },
      { id: 'widescreen', name: t('settings.shortcuts.widescreen'), description: t('settings.shortcuts.widescreen_desc'), defaultKey: 'T' },
      { id: 'shortStepBackward', name: t('settings.shortcuts.short_step_backward'), description: t('settings.shortcuts.short_step_backward_desc'), defaultKey: 'J' },
      { id: 'longStepBackward', name: t('settings.shortcuts.long_step_backward'), description: t('settings.shortcuts.long_step_backward_desc'), defaultKey: 'Shift+J' },
      { id: 'playPause', name: t('settings.shortcuts.play_pause_ext'), description: t('settings.shortcuts.play_pause_ext_desc'), defaultKey: 'K' }, // Renamed to avoid conflict if 'playPause' is used for official
      { id: 'shortStepForward', name: t('settings.shortcuts.short_step_forward'), description: t('settings.shortcuts.short_step_forward_desc'), defaultKey: 'L' },
      { id: 'longStepForward', name: t('settings.shortcuts.long_step_forward'), description: t('settings.shortcuts.long_step_forward_desc'), defaultKey: 'Shift+L' },
      { id: 'pip', name: t('settings.shortcuts.pip'), description: t('settings.shortcuts.pip_desc'), defaultKey: 'P' },
      { id: 'turnOffLight', name: t('settings.shortcuts.turn_off_light'), description: t('settings.shortcuts.turn_off_light_desc'), defaultKey: 'I' },
      { id: 'caption', name: t('settings.shortcuts.caption'), description: t('settings.shortcuts.caption_desc'), defaultKey: 'C' },
      { id: 'increasePlaybackRate', name: t('settings.shortcuts.increase_playback_rate'), description: t('settings.shortcuts.increase_playback_rate_desc'), defaultKey: '+' },
      { id: 'decreasePlaybackRate', name: t('settings.shortcuts.decrease_playback_rate'), description: t('settings.shortcuts.decrease_playback_rate_desc'), defaultKey: '-' },
      { id: 'resetPlaybackRate', name: t('settings.shortcuts.reset_playback_rate'), description: t('settings.shortcuts.reset_playback_rate_desc'), defaultKey: '0' },
      { id: 'previousFrame', name: t('settings.shortcuts.previous_frame'), description: t('settings.shortcuts.previous_frame_desc'), defaultKey: ',' },
      { id: 'nextFrame', name: t('settings.shortcuts.next_frame'), description: t('settings.shortcuts.next_frame_desc'), defaultKey: '.' },
      { id: 'replay', name: t('settings.shortcuts.replay'), description: t('settings.shortcuts.replay_desc'), defaultKey: 'Shift+Backspace' },
      { id: 'toggleFollow', name: t('settings.shortcuts.toggle_follow'), description: t('settings.shortcuts.toggle_follow_desc'), defaultKey: 'Shift+F' },
    ],
  },
  {
    title: t('settings.shortcuts.group.fullscreen_mode'),
    shortcuts: [
      { id: 'increaseVideoSize', name: t('settings.shortcuts.increase_video_size'), description: t('settings.shortcuts.increase_video_size_desc'), defaultKey: 'Shift++' },
      { id: 'decreaseVideoSize', name: t('settings.shortcuts.decrease_video_size'), description: t('settings.shortcuts.decrease_video_size_desc'), defaultKey: 'Shift+-' },
      { id: 'resetVideoSize', name: t('settings.shortcuts.reset_video_size'), description: t('settings.shortcuts.reset_video_size_desc'), defaultKey: 'Shift+0' },
      { id: 'videoTitle', name: t('settings.shortcuts.video_title'), description: t('settings.shortcuts.video_title_desc'), defaultKey: 'B' },
      { id: 'videoTime', name: t('settings.shortcuts.video_time'), description: t('settings.shortcuts.video_time_desc'), defaultKey: 'G' },
      { id: 'clockTime', name: t('settings.shortcuts.clock_time'), description: t('settings.shortcuts.clock_time_desc'), defaultKey: 'H' },
    ],
  },
]

// --- Reactive State ---
const editingShortcutId = ref<ConfigurableShortcutId | null>(null)
const currentKeyCombo = ref<string[]>([])

// --- Helper Functions ---
function getShortcutSetting(id: ConfigurableShortcutId): BaseShortcutSetting | undefined {
  return settings.value.shortcuts?.[id]
}

function getDefaultShortcutSetting(id: ConfigurableShortcutId): BaseShortcutSetting | undefined {
  return originalSettings.shortcuts?.[id]
}

// --- Conflict Detection ---
// This function checks if a shortcut key is already used by another action
// Returns information about any conflicts found
function checkShortcutConflict(key: string, currentId: ConfigurableShortcutId): { hasConflict: boolean, conflictInfo: { id: string, name: string } | null } {
  if (!settings.value.shortcuts)
    return { hasConflict: false, conflictInfo: null }

  // Check for conflicts with other shortcuts
  for (const group of configurableShortcutsGroups) {
    for (const shortcut of group.shortcuts) {
      // Skip the current shortcut being edited
      if (shortcut.id === currentId)
        continue

      const shortcutSetting = settings.value.shortcuts[shortcut.id]
      if (shortcutSetting && typeof shortcutSetting === 'object' && shortcutSetting.key) {
        if (shortcutSetting.key.toLowerCase() === key.toLowerCase()) {
          return {
            hasConflict: true,
            conflictInfo: {
              id: String(shortcut.id), // Convert to string to fix type issue
              name: shortcut.name,
            },
          }
        }
      }
    }
  }

  // Check for conflicts with official shortcuts
  for (const shortcut of officialShortcuts) {
    if (shortcut.key.toLowerCase() === key.toLowerCase()) {
      return {
        hasConflict: true,
        conflictInfo: {
          id: 'official',
          name: shortcut.description,
        },
      }
    }
  }

  return { hasConflict: false, conflictInfo: null }
}

// --- Edit Functions ---
function startEditShortcut(id: ConfigurableShortcutId) {
  editingShortcutId.value = id
  currentKeyCombo.value = [] // 重置当前按键组合
}

function saveShortcutKey(id: ConfigurableShortcutId, newKey: string) {
  console.log('Saving shortcut key:', id, newKey)

  // 确保settings.value.shortcuts存在
  if (!settings.value.shortcuts) {
    settings.value.shortcuts = {}
  }

  // 如果快捷键设置不存在，创建一个新的
  if (!settings.value.shortcuts[id]) {
    // 查找默认配置
    const shortcutDef = configurableShortcutsGroups
      .flatMap(group => group.shortcuts)
      .find(def => def.id === id)

    if (shortcutDef) {
      // 创建基本设置
      settings.value.shortcuts[id] = { key: newKey, enabled: true }
    }
    else {
      // 如果找不到定义，创建基本设置
      settings.value.shortcuts[id] = { key: newKey, enabled: true }
    }
  }
  else {
    // 更新现有设置
    (settings.value.shortcuts[id] as BaseShortcutSetting).key = newKey
  }

  // Exit editing mode
  editingShortcutId.value = null
  currentKeyCombo.value = [] // 重置当前按键组合

  // Re-register shortcuts to ensure the new shortcut is immediately available
  try {
    setupShortcutHandlers()
  }
  catch (error) {
    console.error('Failed to re-register shortcuts:', error)
  }
}

function cancelEdit() {
  editingShortcutId.value = null
  currentKeyCombo.value = [] // 重置当前按键组合
}

function handleKeyDown(event: KeyboardEvent, id: ConfigurableShortcutId) {
  if (editingShortcutId.value !== id)
    return

  event.preventDefault()
  event.stopPropagation()

  // 忽略单独的修饰键
  if (['Control', 'Alt', 'Shift', 'Meta', 'Dead'].includes(event.key))
    return

  // Update current key combo
  const keyParts: string[] = []
  if (event.ctrlKey)
    keyParts.push('Ctrl')
  if (event.altKey)
    keyParts.push('Alt')
  if (event.shiftKey)
    keyParts.push('Shift')
  if (event.metaKey)
    keyParts.push('Meta')

  // 处理主按键
  let mainKey = event.key
  // 对于单字符按键转为大写
  if (mainKey.length === 1) {
    mainKey = mainKey.toUpperCase()
  }
  // 特殊按键处理
  else if (mainKey === ' ') {
    mainKey = 'Space'
  }
  else if (mainKey === 'ArrowUp') {
    mainKey = '↑'
  }
  else if (mainKey === 'ArrowDown') {
    mainKey = '↓'
  }
  else if (mainKey === 'ArrowLeft') {
    mainKey = '←'
  }
  else if (mainKey === 'ArrowRight') {
    mainKey = '→'
  }
  else if (mainKey === 'Backspace') {
    mainKey = 'Backspace'
  }
  else if (mainKey === 'Escape') {
    mainKey = 'Esc'
  }

  // 只有当主按键不是修饰键时才添加
  if (!['Control', 'Alt', 'Shift', 'Meta', 'Dead'].includes(mainKey)) {
    keyParts.push(mainKey)
  }

  // Update the current key combo
  currentKeyCombo.value = keyParts
}

function handleKeyUp(event: KeyboardEvent, id: ConfigurableShortcutId) {
  if (editingShortcutId.value !== id)
    return

  // 如果按下的是 Escape 键，取消编辑
  if (event.key === 'Escape') {
    cancelEdit()
    return
  }

  // 如果按下的是 Backspace 键，且没有其他按键，取消编辑
  if (event.key === 'Backspace' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    cancelEdit()
    return
  }

  // 如果所有按键都已释放，保存快捷键
  if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    if (currentKeyCombo.value.length > 0) {
      const keyCombo = currentKeyCombo.value.join('+')

      // 检查是否为空组合
      if (keyCombo.trim() === '') {
        cancelEdit()
        return
      }

      // Check for conflicts
      const conflictResult = checkShortcutConflict(keyCombo, id)

      if (conflictResult.hasConflict && conflictResult.conflictInfo) {
        // Use a generic message if translation is not available
        const message = `此快捷键与"${conflictResult.conflictInfo.name}"冲突。是否要覆盖它？`
        if (confirm(message)) {
          saveShortcutKey(id, keyCombo)
        }
        else {
          cancelEdit()
        }
      }
      else {
        // No conflict, save directly
        saveShortcutKey(id, keyCombo)
      }
    }
  }
}

// --- Reset and Toggle Functions ---
function resetToDefault(shortcutDef: ConfigurableShortcutDefinition) {
  if (!settings.value.shortcuts)
    settings.value.shortcuts = {}

  const defaultSetting = getDefaultShortcutSetting(shortcutDef.id)
  if (defaultSetting) {
    settings.value.shortcuts[shortcutDef.id] = JSON.parse(JSON.stringify(defaultSetting)) // Deep copy
  }
  else {
    // Fallback if not in originalSettings (should not happen with proper setup)
    const baseDefault: BaseShortcutSetting = { key: shortcutDef.defaultKey, enabled: true }
    settings.value.shortcuts[shortcutDef.id] = baseDefault
  }

  // 重新注册快捷键
  setupShortcutHandlers()
}

function resetAllShortcuts() {
  if (!settings.value.shortcuts)
    settings.value.shortcuts = {}

  configurableShortcutsGroups.forEach((group) => {
    group.shortcuts.forEach((shortcutDef) => {
      const defaultSetting = getDefaultShortcutSetting(shortcutDef.id)
      if (defaultSetting && settings.value.shortcuts) {
        settings.value.shortcuts[shortcutDef.id] = JSON.parse(JSON.stringify(defaultSetting))
      }
    })
  })

  // 重新注册快捷键
  setupShortcutHandlers()
}
</script>

<template>
  <div>
    <!-- General Keyboard Toggle -->
    <SettingsItemGroup>
      <SettingsItem :title="t('settings.shortcuts.enable_all_shortcuts_toggle')">
        <template #desc>
          <div v-html="t('settings.shortcuts.enable_all_shortcuts_toggle_desc')" />
        </template>
        <Radio v-model="settings.keyboard" />
      </SettingsItem>
    </SettingsItemGroup>

    <!-- Configurable Extension Shortcuts -->
    <template v-for="group in configurableShortcutsGroups" :key="group.title">
      <SettingsItemGroup :title="group.title">
        <template v-for="shortcutDef in group.shortcuts" :key="shortcutDef.id">
          <SettingsItem :title="shortcutDef.name" :desc="shortcutDef.description">
            <div class="shortcut-item-config">
              <!-- Key Configuration with Enabled Toggle -->
              <div class="flex items-center gap-2 mb-2">
                <!-- Shortcut Key Display/Edit -->
                <div
                  v-if="editingShortcutId === shortcutDef.id"
                  class="shortcut-edit-box border rounded px-3 py-1 min-w-[120px] text-center text-sm"
                  tabindex="0"
                  @keydown="handleKeyDown($event, shortcutDef.id)"
                  @keyup="handleKeyUp($event, shortcutDef.id)"
                  @blur="cancelEdit"
                >
                  {{ currentKeyCombo.length > 0 ? currentKeyCombo.join('+') : t('settings.shortcuts.press_keys') }}
                </div>
                <div v-else class="shortcut-key border rounded px-3 py-1 text-sm">
                  {{ getShortcutSetting(shortcutDef.id)?.key || shortcutDef.defaultKey }}
                </div>

                <!-- Action Buttons -->
                <div class="shortcut-actions flex gap-1">
                  <button
                    v-if="editingShortcutId !== shortcutDef.id"
                    class="edit-btn p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    :title="t('settings.shortcuts.item.edit_key')"
                    @click="startEditShortcut(shortcutDef.id)"
                  >
                    <i i-mingcute:edit-line />
                  </button>
                  <button
                    v-if="editingShortcutId === shortcutDef.id"
                    class="cancel-btn p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    :title="t('settings.shortcuts.item.cancel_edit')"
                    @click="cancelEdit"
                  >
                    <i i-mingcute:close-line />
                  </button>
                  <button
                    class="reset-btn p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    :title="t('settings.shortcuts.item.reset_default')"
                    @click="resetToDefault(shortcutDef)"
                  >
                    <i i-mingcute:refresh-1-line />
                  </button>
                </div>
                <Radio
                  :model-value="settings.shortcuts[shortcutDef.id]?.enabled ?? false"
                  @update:model-value="(value) => {
                    if (!settings.shortcuts[shortcutDef.id]) {
                      settings.shortcuts[shortcutDef.id] = { key: shortcutDef.defaultKey, enabled: value }
                    }
                    else {
                      (settings.shortcuts[shortcutDef.id] ??= { key: shortcutDef.defaultKey, enabled: false }).enabled = value
                    }
                  }"
                />
              </div>
            </div>
          </SettingsItem>
        </template>
      </SettingsItemGroup>
    </template>

    <!-- Global Actions -->
    <SettingsItemGroup :title="t('settings.shortcuts.group.global_actions')">
      <SettingsItem :title="t('settings.shortcuts.reset_all_ext_shortcuts')">
        <Button @click="resetAllShortcuts">
          {{ t('settings.shortcuts.reset_all_button') }}
        </Button>
      </SettingsItem>
    </SettingsItemGroup>

    <!-- Official Bilibili Shortcuts (Read-only) -->
    <SettingsItemGroup :title="t('settings.shortcuts.group.official_bilibili')">
      <SettingsItem
        v-for="shortcut in officialShortcuts"
        :key="shortcut.key"
        :title="shortcut.key"
        :desc="shortcut.description"
      >
        <div class="shortcut-key-readonly border rounded px-3 py-1 text-sm">
          {{ shortcut.key }}
        </div>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.shortcut-key-readonly,
.shortcut-key {
  background-color: var(--bew-elevated-solid);
  min-width: 60px; /* Ensure a minimum width for better alignment */
  text-align: center;
}

.shortcut-edit-box {
  background-color: var(--bew-elevated-solid);
  cursor: text;
  user-select: none;
  outline: none;
  &:focus {
    outline: 2px solid var(--bew-primary);
  }
  &:focus-visible {
    outline: 2px solid var(--bew-primary);
  }
}

.specific-config select,
.specific-config input[type="radio"] {
  color: var(--bew-text-1); // Ensure text color matches theme
}
.specific-config option {
  background-color: var(--bew-bg); // Ensure dropdown options have background
  color: var(--bew-text-1);
}

// Ensure buttons in shortcut actions are vertically aligned
.shortcut-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

// Add some spacing to SettingsItem content for better readability
:deep(.settings-item .content) {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}
</style>
