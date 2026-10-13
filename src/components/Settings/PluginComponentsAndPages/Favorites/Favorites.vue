<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Radio from '~/components/Radio.vue'
import { settings } from '~/logic'
import type { FavoriteOrganizerProgress, FavoriteOrganizerResult } from '~/utils/favoriteOrganizer'
import { FavoriteOrganizerError, organizeDefaultFavoriteFolder } from '~/utils/favoriteOrganizer'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import FavoriteOrganizerRules from './FavoriteOrganizerRules.vue'

const { t } = useI18n()
const running = ref(false)
const progress = ref<FavoriteOrganizerProgress | null>(null)
const result = ref<FavoriteOrganizerResult | null>(null)
const errorMessage = ref('')
let abortController: AbortController | null = null

onBeforeUnmount(() => abortController?.abort())

const progressText = computed(() => {
  if (!progress.value)
    return ''
  return progress.value.phase === 'scan'
    ? t('settings.favorite_organizer.scanning', { count: progress.value.scanned })
    : t('settings.favorite_organizer.copying', { count: progress.value.copied })
})

function describeError(error: unknown) {
  if (error instanceof FavoriteOrganizerError) {
    switch (error.reason) {
      case 'not_logged_in':
        return t('common.please_log_in_first')
      case 'account_changed':
        return t('settings.favorite_organizer.account_changed')
      case 'no_rules':
        return t('settings.favorite_organizer.no_rules')
      case 'no_default_folder':
        return t('settings.favorite_organizer.no_default_folder')
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return t('settings.favorite_organizer.failed', { message })
}

async function startOrganize() {
  if (running.value)
    return

  running.value = true
  result.value = null
  errorMessage.value = ''
  progress.value = null
  abortController = new AbortController()
  const { signal } = abortController
  try {
    result.value = await organizeDefaultFavoriteFolder((value) => {
      progress.value = value
    }, signal)
  }
  catch (error) {
    errorMessage.value = signal.aborted ? t('settings.favorite_organizer.stopped') : describeError(error)
  }
  finally {
    running.value = false
    progress.value = null
    abortController = null
  }
}

function stopOrganize() {
  abortController?.abort()
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="t('settings.group_favorite_organizer')">
      <SettingsItem
        :title="t('settings.favorite_organizer.sync_after_triple')"
        :desc="t('settings.favorite_organizer.sync_after_triple_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.favoriteOrganizerSyncAfterTriple" />
      </SettingsItem>
      <SettingsItem
        :title="t('settings.favorite_organizer.batch_title')"
        :desc="t('settings.favorite_organizer.batch_desc')"
        right-width="auto"
      >
        <Button v-if="running" size="small" type="secondary" @click="stopOrganize">
          <template #left>
            <i i-mingcute:stop-circle-line />
          </template>
          {{ t('settings.favorite_organizer.stop') }}
        </Button>
        <Button v-else size="small" type="primary" @click="startOrganize">
          <template #left>
            <i i-mingcute:magic-2-line />
          </template>
          {{ t('settings.favorite_organizer.start') }}
        </Button>
        <template v-if="running || result || errorMessage" #bottom>
          <div class="organizer-status">
            <p v-if="running" class="organizer-status__progress">
              <span i-svg-spinners:ring-resize />
              {{ progressText || t('settings.favorite_organizer.preparing') }}
            </p>
            <p v-if="errorMessage" class="organizer-status__error">
              {{ errorMessage }}
            </p>
            <template v-if="result">
              <p>{{ t('settings.favorite_organizer.result_summary', { scanned: result.scanned }) }}</p>
              <ul>
                <li v-for="folder in result.folders" :key="folder.mediaId" :class="{ 'organizer-status__error': folder.error }">
                  {{ folder.error
                    ? t('settings.favorite_organizer.result_folder_failed', { title: folder.title, matched: folder.matched, copied: folder.copied, message: folder.error })
                    : t('settings.favorite_organizer.result_folder', { title: folder.title, matched: folder.matched, copied: folder.copied }) }}
                </li>
              </ul>
            </template>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="t('settings.favorite_organizer.rules_title')"
      :desc="t('settings.favorite_organizer.rules_desc')"
    >
      <FavoriteOrganizerRules />
    </SettingsItemGroup>
  </div>
</template>

<style scoped lang="scss">
.organizer-status {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-1);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  p,
  ul {
    margin: 0;
  }

  ul {
    padding-left: var(--bew-space-5);
  }
}

.organizer-status__progress {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.organizer-status__error {
  color: var(--bew-error-color);
}
</style>
