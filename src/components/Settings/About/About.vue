<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import browser from 'webextension-polyfill'

import { originalSettings, settings } from '~/logic'

import { version } from '../../../../package.json'

const { t } = useI18n()

const importSettingsRef = ref<HTMLElement>()
const hasNewVersion = ref<boolean>(false)

const isDev = computed((): boolean => import.meta.env.DEV)

onMounted(() => {
  checkGitHubRelease()
})

function handleImportSettings() {
  if (importSettingsRef.value) {
    importSettingsRef.value.click()

    const handleChange = (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.files && input.files.length > 0) {
        // A file has been selected
        const selectedFile = input.files[0]
        // Clear all previous file contents
        input.value = ''

        const reader = new FileReader()
        reader.onload = (event: Event) => {
          const fileReaderTarget = event.target as FileReader
          const fileContent = fileReaderTarget.result as string
          const jsonObject = JSON.parse(fileContent) as any

          // Merge the new settings with the existing settings
          Object.keys(jsonObject).forEach((key) => {
            if (key in settings.value)
              (settings.value as any)[key] = jsonObject[key]
          })

          importSettingsRef.value?.removeEventListener('change', handleChange)
        }
        reader.readAsText(selectedFile)
      }
    }

    importSettingsRef.value.addEventListener('change', handleChange)
  }
}

function handleExportSettings() {
  const jsonStr = JSON.stringify(settings.value, null, 2) // Pretty print JSON
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date()
  const dateTimeStr = date.toLocaleString('sv-SE').replace(/[- :]/g, '')

  a.href = url
  a.download = `bewly-settings-${dateTimeStr}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleResetSettings() {
  const result = confirm(
    t('settings.reset_settings_confirm'),
  )
  if (result) {
    // Remember the last selected language when resetting settings
    originalSettings.language = settings.value.language
    settings.value = originalSettings
  }
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
</script>

<template>
  <div>
    <div max-w-800px mx-auto>
      <div relative w-200px m-auto>
        <img
          :src="`${browser.runtime.getURL('/assets/icon-512.png')}`" alt="" width="200"
        >

        <a
          v-if="hasNewVersion"
          href="https://github.com/keleus/BewlyCat/releases" target="_blank"
          pos="absolute bottom-0 right-0" transform="translate-x-50%" un-text="xs $bew-text-1" p="y-1 x-2" bg="$bew-fill-1"
          rounded-12
        >
          NEW
        </a>
      </div>
      <section text-2xl text-center mt-2>
        <p flex="inline gap-2" fw-900>
          <span>BewlyCat</span>
          <span
            v-if="isDev"
            inline-block text="$bew-warning-color"
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

      <section
        style="box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);"
        mt-6 p-4 bg="$bew-fill-alt" rounded="$bew-radius"
        flex="~ col items-center gap-6"
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
            {{ `${$t('settings.import_settings')} / ${$t('settings.export_settings')} / ${$t('settings.reset_settings')}` }}
          </h3>
          <div flex="~ gap-2">
            <Button class="btn" @click="handleImportSettings">
              <template #left>
                <div i-uil:import />
              </template>
              <input ref="importSettingsRef" type="file" accept=".json" hidden>
              {{ $t('settings.import_settings') }}
            </Button>
            <Tooltip placement="bottom" :content="$t('settings.export_settings_desc')">
              <Button class="btn" @click="handleExportSettings">
                <template #left>
                  <div i-uil:export />
                </template>
                {{ $t('settings.export_settings') }}
              </Button>
            </Tooltip>
            <Button class="btn" @click="handleResetSettings">
              <template #left>
                <i i-mingcute:back-line />
              </template>
              {{ $t('settings.reset_settings') }}
            </Button>
          </div>
        </section>
        <section>
          <h3 class="title">
            {{ $t('settings.contributors') }}
          </h3>
          <a
            href="https://github.com/hakadao/BewlyBewly/graphs/contributors" target="_blank"
          >
            <img
              src="https://contrib.rocks/image?repo=hakadao/BewlyBewly"
              w-full
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

.link-card {
  --uno: "w-full h-48px px-4 py-2 flex items-center rounded-$bew-radius";
  --uno: "duration-300";

  > div {
    --uno: "mr-2 shrink-0";
  }
}
</style>
