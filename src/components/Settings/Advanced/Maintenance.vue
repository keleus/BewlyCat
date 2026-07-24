<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { originalSettings, settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()
const toast = useToast()
const importSettingsRef = ref<HTMLInputElement>()

function handleImportSettings() {
  importSettingsRef.value?.click()
}

function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const selectedFile = input.files?.[0]
  input.value = ''

  if (!selectedFile)
    return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const importedSettings = JSON.parse(String(reader.result)) as Record<string, unknown>
      if (!importedSettings || Array.isArray(importedSettings) || typeof importedSettings !== 'object')
        throw new TypeError('Invalid settings backup')

      const currentSettings = settings.value as unknown as Record<string, unknown>
      let importedCount = 0
      let ignoredCount = 0
      Object.keys(importedSettings).forEach((key) => {
        if (key in settings.value) {
          currentSettings[key] = importedSettings[key]
          importedCount++
        }
        else {
          ignoredCount++
        }
      })

      if (importedCount === 0) {
        toast.warning(t('settings.maintenance.import_no_matches'))
        return
      }

      toast.success(t('settings.maintenance.import_success', {
        imported: importedCount,
        ignored: ignoredCount,
      }))
    }
    catch {
      toast.error(t('settings.maintenance.import_failed'))
    }
  }
  reader.readAsText(selectedFile)
}

function handleExportSettings() {
  const jsonStr = JSON.stringify(settings.value, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateTimeStr = new Date().toLocaleString('sv-SE').replace(/[- :]/g, '')

  link.href = url
  link.download = `bewly-settings-${dateTimeStr}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function handleResetSettings() {
  if (!confirm(t('settings.reset_settings_confirm')))
    return

  // 重置时保留用户当前使用的语言
  originalSettings.language = settings.value.language
  settings.value = originalSettings
}
</script>

<template>
  <div>
    <SettingsItemGroup
      :title="$t('settings.maintenance.backup_title')"
      :desc="$t('settings.maintenance.backup_desc')"
    >
      <SettingsItem
        :title="$t('settings.import_settings')"
        :desc="$t('settings.maintenance.import_desc')"
        right-width="auto"
      >
        <input
          ref="importSettingsRef"
          type="file"
          accept=".json"
          hidden
          @change="handleImportFile"
        >
        <Button @click="handleImportSettings">
          <template #left>
            <div i-uil:import />
          </template>
          {{ $t('settings.import_settings') }}
        </Button>
      </SettingsItem>
      <SettingsItem
        :title="$t('settings.export_settings')"
        :desc="$t('settings.export_settings_desc')"
        right-width="auto"
      >
        <Button @click="handleExportSettings">
          <template #left>
            <div i-uil:export />
          </template>
          {{ $t('settings.export_settings') }}
        </Button>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.maintenance.reset_title')"
      :desc="$t('settings.maintenance.reset_desc')"
    >
      <SettingsItem
        :title="$t('settings.reset_settings')"
        :desc="$t('settings.maintenance.reset_warning')"
        :badge="$t('settings.badge_irreversible')"
        right-width="auto"
      >
        <Button class="danger-button" @click="handleResetSettings">
          <template #left>
            <i i-mingcute:back-line />
          </template>
          {{ $t('settings.reset_settings') }}
        </Button>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.danger-button {
  color: var(--bew-error-color);
}
</style>
