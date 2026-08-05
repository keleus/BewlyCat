import { useStorageLocal } from '~/composables/useStorageLocal'
import { SETTINGS_CLOUD_SYNC_ENABLED_KEY } from '~/utils/settingsCloudSyncProtocol'

export function useSettingsCloudSyncPreference() {
  return useStorageLocal(SETTINGS_CLOUD_SYNC_ENABLED_KEY, false, {
    flush: 'sync',
    writeDefaults: false,
  })
}
