<script setup lang="ts">
import browser from 'webextension-polyfill'

import Radio from '~/components/Radio.vue'
import { useSettingsCloudSyncPreference } from '~/composables/useSettingsCloudSyncPreference'
import { settings } from '~/logic'

import { version } from '../../../../package.json'
import Maintenance from '../Advanced/Maintenance.vue'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const hasNewVersion = ref<boolean>(false)
const contributorsImageFailed = ref(false)
const settingsCloudSyncPreference = useSettingsCloudSyncPreference()

const isDev = computed((): boolean => import.meta.env.DEV)

onMounted(() => {
  checkGitHubRelease()
})

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
  contributorsImageFailed.value = true
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
        <SettingsItemGroup :title="$t('settings.group_settings_sync')">
          <SettingsItem
            :title="$t('settings.enable_settings_sync')"
            :desc="$t('settings.enable_settings_sync_desc')"
            right-width="auto"
          >
            <Radio v-model="settingsCloudSyncPreference" />
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
              <div i-tabler:book-2 /> 小红书
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
              src="https://contrib.rocks/image?repo=keleus/BewlyCat"
              :alt="$t('settings.current_contributors')"
              loading="lazy"
              @error="handleContributorImageError"
            >
          </a>
        </section>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.btn {
  --b-button-color: var(--bew-fill-1);
  --b-button-color-hover: var(--bew-fill-2);
}

.title {
  --uno: "fw-bold mb-2";
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
