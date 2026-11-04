<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Radio from '~/components/Radio.vue'
import { useSettingsCloudSyncPreference } from '~/composables/useSettingsCloudSyncPreference'
import { sendMessage } from '~/utils/messaging'
import type { SettingsCloudSyncEnableResponse, SettingsCloudSyncStatus } from '~/utils/settingsCloudSyncProtocol'
import {
  SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE,
  SETTINGS_CLOUD_SYNC_STATUS_MESSAGE,
} from '~/utils/settingsCloudSyncProtocol'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'
import Maintenance from './Maintenance.vue'

const settingsCloudSyncPreference = useSettingsCloudSyncPreference()
const showSyncConflictDialog = ref(false)
const isSyncToggling = ref(false)
// The switch stays visually checked while the direction dialog is open because
// the underlying preference has not been written yet. Bumping this key
// remounts the switch so it snaps back off when enabling is cancelled.
const syncSwitchRenderTick = ref(0)
const pendingEnableChoice = ref(false)
const { t } = useI18n()
const toast = useToast()

function revertSyncSwitch() {
  syncSwitchRenderTick.value++
}

function handleSyncToggle(value: boolean) {
  if (!value) {
    settingsCloudSyncPreference.value = false
    return
  }
  void requestEnableSettingsCloudSync()
}

async function sendEnableSettingsCloudSyncRequest(mode: 'auto' | 'pull' | 'push') {
  // The background runs the first coordination inline and reports the outcome;
  // the switch state mirrors back through storage.onChanged only on success.
  const response = await sendMessage<{ mode: 'auto' | 'pull' | 'push' }, SettingsCloudSyncEnableResponse>(
    SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE,
    { mode },
  )
  if (!response)
    throw new Error('Missing settings cloud sync bootstrap response')
  if (!response.ok && response.reason === 'initialization-failed')
    throw new Error('Settings cloud sync bootstrap failed')
  return response.ok
}

async function requestEnableSettingsCloudSync() {
  if (isSyncToggling.value)
    return

  isSyncToggling.value = true
  let failedPhase: 'status' | 'enable' = 'status'
  try {
    const status = await sendMessage<undefined, SettingsCloudSyncStatus>(SETTINGS_CLOUD_SYNC_STATUS_MESSAGE)
    if (!status)
      throw new Error('Missing cloud sync status response')

    if (status.state === 'compatible') {
      // Cloud already holds a snapshot: let the user pick which side takes
      // precedence instead of silently overwriting one of them.
      showSyncConflictDialog.value = true
      return
    }

    if (status.state === 'incompatible') {
      // The snapshot was written by a newer extension version; enabling here
      // would corrupt it.
      revertSyncSwitch()
      toast.error(t('settings.sync_cloud_incompatible'))
      return
    }

    failedPhase = 'enable'
    if (!await sendEnableSettingsCloudSyncRequest('auto')) {
      revertSyncSwitch()
      toast.error(t('settings.sync_cloud_incompatible'))
    }
  }
  catch (error) {
    console.error(error)
    revertSyncSwitch()
    toast.error(t(failedPhase === 'status'
      ? 'settings.sync_cloud_status_failed'
      : 'settings.sync_cloud_enable_failed'))
  }
  finally {
    isSyncToggling.value = false
  }
}

async function enableSyncWithMode(mode: 'pull' | 'push') {
  pendingEnableChoice.value = true
  showSyncConflictDialog.value = false
  try {
    if (!await sendEnableSettingsCloudSyncRequest(mode)) {
      revertSyncSwitch()
      toast.error(t('settings.sync_cloud_incompatible'))
    }
  }
  catch (error) {
    console.error(error)
    revertSyncSwitch()
    toast.error(t('settings.sync_cloud_enable_failed'))
  }
  finally {
    pendingEnableChoice.value = false
  }
}

function handleSyncDialogClose() {
  showSyncConflictDialog.value = false
  if (!pendingEnableChoice.value && settingsCloudSyncPreference.value !== true)
    revertSyncSwitch()
}
</script>

<template>
  <div>
    <SettingsSectionHeading
      :title="$t('settings.menu_data')"
      :desc="$t('settings.category_data_desc')"
      icon="i-mingcute:save-2-fill"
    />

    <SettingsItemGroup :title="$t('settings.group_settings_sync')">
      <SettingsItem
        :title="$t('settings.enable_settings_sync')"
        :desc="$t('settings.enable_settings_sync_desc')"
        right-width="auto"
      >
        <Radio
          :key="syncSwitchRenderTick"
          :model-value="settingsCloudSyncPreference === true"
          :disabled="isSyncToggling"
          @update:model-value="handleSyncToggle"
        />
      </SettingsItem>
    </SettingsItemGroup>

    <Maintenance class="data-maintenance" />

    <Dialog
      v-if="showSyncConflictDialog"
      :title="t('settings.sync_cloud_conflict_title')"
      width="440px"
      :show-footer="false"
      append-to-bewly-body
      @close="handleSyncDialogClose"
    >
      <div class="sync-conflict-body" flex="~ col gap-3">
        <p text="$bew-text-2 sm">
          {{ t('settings.sync_cloud_conflict_desc') }}
        </p>
        <Button type="primary" @click="enableSyncWithMode('pull')">
          {{ t('settings.sync_cloud_use_cloud') }}
        </Button>
        <Button type="secondary" @click="enableSyncWithMode('push')">
          {{ t('settings.sync_cloud_use_local') }}
        </Button>
      </div>
    </Dialog>
  </div>
</template>

<style lang="scss" scoped>
.data-maintenance {
  margin-top: var(--bew-space-6);
}
</style>
