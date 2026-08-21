<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import browser from 'webextension-polyfill'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Radio from '~/components/Radio.vue'
import { useSettingsCloudSyncPreference } from '~/composables/useSettingsCloudSyncPreference'
import { settings } from '~/logic'
import { getBrowserInfo, parseBrowserInfo } from '~/utils/browserInfo'
import { sendMessage } from '~/utils/messaging'
import type { SettingsCloudSyncEnableResponse, SettingsCloudSyncStatus } from '~/utils/settingsCloudSyncProtocol'
import {
  SETTINGS_CLOUD_SYNC_ENABLE_MESSAGE,
  SETTINGS_CLOUD_SYNC_STATUS_MESSAGE,
} from '~/utils/settingsCloudSyncProtocol'

import { version } from '../../../../package.json'
import Maintenance from '../Advanced/Maintenance.vue'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const hasNewVersion = ref<boolean>(false)
const contributorsImageFailed = ref(false)
const contributorsImageUsingCloud = ref(false)
const contributorsImageSrc = ref(browser.runtime.getURL('/assets/contributors.svg'))
const settingsCloudSyncPreference = useSettingsCloudSyncPreference()
const browserInfo = ref(parseBrowserInfo())
const isCopyingEnvironmentInfo = ref(false)
const showSyncConflictDialog = ref(false)
const isSyncToggling = ref(false)
// The switch stays visually checked while the direction dialog is open because
// the underlying preference has not been written yet. Bumping this key
// remounts the switch so it snaps back off when enabling is cancelled.
const syncSwitchRenderTick = ref(0)
const pendingEnableChoice = ref(false)
const { t } = useI18n()
const toast = useToast()

const isDev = computed((): boolean => import.meta.env.DEV)

onMounted(async () => {
  checkGitHubRelease()
  browserInfo.value = await getBrowserInfo()
})

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

async function checkGitHubRelease() {
  const apiUrl = `https://api.github.com/repos/keleus/BewlyCat/releases/latest`

  try {
    const response = await fetch(apiUrl)
    if (!response.ok)
      throw new Error('Network response was not ok')

    const data = await response.json()
    const latestVersion = data.tag_name

    // Here you can compare `latestVersion` with your current version
    const currentVersion = `v${version}` // Replace with your actual current version

    if (latestVersion !== currentVersion)
      hasNewVersion.value = true
  }
  catch {
  }
}

function handleContributorImageError() {
  if (!contributorsImageUsingCloud.value) {
    contributorsImageUsingCloud.value = true
    contributorsImageSrc.value = 'https://contrib.rocks/image?repo=keleus/BewlyCat'
    return
  }

  contributorsImageFailed.value = true
}

async function handleCopyEnvironmentInfo() {
  if (isCopyingEnvironmentInfo.value)
    return

  const unknownValue = t('settings.environment_info_unknown')
  const text = [
    `- ${t('settings.environment_browser')}: ${browserInfo.value.name ?? unknownValue}`,
    `- ${t('settings.environment_browser_version')}: ${browserInfo.value.version ?? unknownValue}`,
    `- ${t('settings.environment_bewlycat_version')}: ${version}`,
  ].join('\n')

  isCopyingEnvironmentInfo.value = true
  try {
    await navigator.clipboard.writeText(text)
    toast.success(t('settings.environment_info_copied'))
  }
  catch {
    toast.error(t('settings.environment_info_copy_failed'))
  }
  finally {
    isCopyingEnvironmentInfo.value = false
  }
}
</script>

<template>
  <div :data-settings-title="$t('settings.menu_about')">
    <div class="about-content">
      <div relative w-200px m-auto>
        <img
          :src="`${browser.runtime.getURL('/assets/icon-512.png')}`" alt="" width="200"
        >

        <a
          v-if="hasNewVersion"
          href="https://github.com/keleus/BewlyCat/releases" target="_blank"
          pos="absolute bottom-0 right-0" transform="translate-x-50%" un-text="xs $bew-text-1" p="y-1 x-2" bg="$bew-fill-1"
          rounded="$bew-radius"
        >
          NEW
        </a>
      </div>
      <section class="about-brand" text-center mt-2>
        <p flex="inline gap-2">
          <span>BewlyCat</span>
          <span
            v-if="isDev"
            class="bew-warning-text"
            inline-block
          >
            Dev
          </span>
        </p>
        <p text-center>
          <a
            href="https://github.com/keleus/BewlyCat/releases" target="_blank"
            un-text="sm color-$bew-text-2 hover:color-$bew-text-3"
          >
            v{{ version }}
          </a>
        </p>
      </section>

      <section class="about-maintenance">
        <SettingsItemGroup :title="$t('settings.group_environment_info')">
          <SettingsItem
            :title="$t('settings.copy_environment_info')"
            :desc="$t('settings.copy_environment_info_desc')"
            right-width="auto"
          >
            <Button
              type="secondary"
              size="small"
              :disabled="isCopyingEnvironmentInfo"
              @click="handleCopyEnvironmentInfo"
            >
              <template #left>
                <div i-tabler:copy />
              </template>
              {{ $t('settings.copy_environment_info') }}
            </Button>
          </SettingsItem>
        </SettingsItemGroup>

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

        <SettingsItemGroup :title="$t('settings.group_version_reminder')">
          <SettingsItem
            :title="$t('settings.enable_version_reminder')"
            :desc="$t('settings.enable_version_reminder_desc')"
            right-width="auto"
          >
            <Radio v-model="settings.enableVersionReminder" />
          </SettingsItem>
        </SettingsItemGroup>

        <SettingsSectionHeading
          class="maintenance-heading"
          :title="$t('settings.maintenance.title')"
          :desc="$t('settings.category_advanced_maintenance_desc')"
          icon="i-mingcute:save-2-fill"
        />
        <Maintenance />
      </section>

      <section
        class="about-info-card"
      >
        <section w-full>
          <h3 class="title">
            {{ $t('settings.links') }}
          </h3>
          <div grid="~ xl:cols-6 lg:cols-5 md:cols-4 cols-3 gap-2">
            <a
              href="https://github.com/keleus/BewlyCat" target="_blank"
              class="link-card"
              bg="black dark:white !opacity-10 !hover:opacity-20"
              un-text="black dark:white"
            >
              <div i-tabler:brand-github /> GitHub
            </a>
            <a
              href="https://space.bilibili.com/32487218/dynamic" target="_blank"
              class="link-card"
              bg="#fb7299 dark:#ffa7c0 !opacity-10 !hover:opacity-20"
              un-text="#fb7299 dark:#ffa7c0"
            >
              <div i-tabler:brand-bilibili /> Bilibili
            </a>
            <a
              href="https://www.xiaohongshu.com/user/profile/5fb77085000000000100060d" target="_blank"
              class="link-card"
              bg="#FF2442 dark:#D7223A !opacity-10 !hover:opacity-20"
              un-text="#FF2442 dark:#D7223A"
            >
              <div i-tabler:book-2 /> {{ t('settings.xiaohongshu') }}
            </a>
          </div>
        </section>
        <section w-full>
          <h3 class="title">
            {{ $t('settings.current_contributors') }}
          </h3>
          <p v-if="contributorsImageFailed" class="contributors-error">
            {{ $t('settings.contributors_image_failed') }}
          </p>
          <a
            v-else
            href="https://github.com/keleus/BewlyCat/graphs/contributors"
            target="_blank"
            class="contributors-image-link"
          >
            <img
              :src="contributorsImageSrc"
              :alt="$t('settings.current_contributors')"
              loading="lazy"
              @error="handleContributorImageError"
            >
          </a>
        </section>
      </section>
    </div>

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
.title {
  --uno: "mb-2";
  font-weight: var(--bew-font-weight-bold);
}

.about-brand {
  margin-top: var(--bew-space-2);
  font-size: var(--bew-font-size-display);
  font-weight: var(--bew-font-weight-bold);
  line-height: var(--bew-line-height-data);
}

.about-info-card {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-6);
  margin: var(--bew-space-6) calc(var(--bew-space-4) * -1) 0;
  padding: var(--bew-space-4);
  background: var(--bew-fill-alt);
  border-radius: var(--bew-panel-radius);
  box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);
}

.contributors-image-link {
  display: block;

  img {
    display: block;
    max-width: 100%;
    height: auto;
  }
}

.about-maintenance {
  margin-top: var(--bew-space-6);
}

.maintenance-heading {
  margin-top: var(--bew-space-8);
}

.contributors-error {
  padding: var(--bew-space-4);
  color: var(--bew-error-color);
  text-align: center;
  background: var(--bew-fill-1);
  border-radius: var(--bew-panel-radius);
}

.link-card {
  --uno: "w-full h-48px px-4 py-2 flex items-center rounded-$bew-radius";
  --uno: "duration-300";

  > div {
    --uno: "mr-2 shrink-0";
  }
}
</style>
