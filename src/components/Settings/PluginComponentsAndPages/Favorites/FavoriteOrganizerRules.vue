<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { FavoriteOrganizerFolder, FavoriteOrganizerRule } from '~/logic'
import { settings } from '~/logic'
import type { List as FavoriteFolder } from '~/models/video/favoriteCategory'
import { hasRuleConditions, isDefaultFavoriteFolder, loadOwnFavoriteFolders } from '~/utils/favoriteOrganizer'
import { getUserID } from '~/utils/main'

import type { FavoriteOrganizerRuleDraft } from '../../types'
import FavoriteOrganizerRuleDialog from './FavoriteOrganizerRuleDialog.vue'
import { getRuleSummaryParts } from './ruleSummary'

interface EditorState {
  mode: 'create' | 'edit' | 'copy'
  initial?: FavoriteOrganizerRuleDraft
}

const { t } = useI18n()
const accountId = getUserID()
const ownFolders = ref<FavoriteFolder[]>([])
const loading = ref(false)
const loaded = ref(false)
const loadError = ref('')
const editor = ref<EditorState | null>(null)

const configuredFolders = computed(() => settings.value.favoriteOrganizerFolders)
const ownFolderMap = computed(() => new Map(ownFolders.value.map(folder => [folder.id, folder])))
const ruleRows = computed(() => configuredFolders.value.flatMap(folder => folder.rules.map(rule => ({ folder, rule }))))

const folderOptions = computed(() => {
  const options = [
    { value: 0, label: t('settings.favorite_organizer.folder_placeholder') },
    ...ownFolders.value
      .filter(folder => !isDefaultFavoriteFolder(folder))
      .map(folder => ({ value: folder.id, label: folder.title })),
  ]
  // 编辑已失效收藏夹的规则时保留原选项，避免被静默改成其他收藏夹
  const mediaId = editor.value?.initial?.mediaId
  if (mediaId && !options.some(option => option.value === mediaId)) {
    const folder = configuredFolders.value.find(item => item.mediaId === mediaId)
    options.push({ value: mediaId, label: t('settings.favorite_organizer.folder_missing_option', { title: folder?.title || mediaId }) })
  }
  return options
})

onMounted(loadFolders)

async function loadFolders() {
  if (!accountId || loading.value)
    return
  loading.value = true
  loadError.value = ''
  try {
    ownFolders.value = await loadOwnFavoriteFolders(accountId)
    loaded.value = true
  }
  catch {
    loadError.value = t('settings.favorite_organizer.load_folders_failed')
  }
  finally {
    loading.value = false
  }
}

function folderTitle(folder: FavoriteOrganizerFolder) {
  return ownFolderMap.value.get(folder.mediaId)?.title || folder.title || String(folder.mediaId)
}

function openEditor(mode: EditorState['mode'], folder?: FavoriteOrganizerFolder, rule?: FavoriteOrganizerRule) {
  editor.value = {
    mode,
    initial: folder && rule ? { mediaId: folder.mediaId, rule } : undefined,
  }
}

function saveRule(draft: FavoriteOrganizerRuleDraft, removeRuleIds: string[]) {
  const removed = new Set(removeRuleIds)
  const folders = configuredFolders.value.map(folder => ({ ...folder, rules: [...folder.rules] }))
  const previousFolder = folders.find(folder => folder.rules.some(rule => rule.id === draft.rule.id))
  let target = folders.find(folder => folder.mediaId === draft.mediaId)
  if (!target) {
    target = { mediaId: draft.mediaId, title: '', rules: [] }
    folders.push(target)
  }
  target.title = ownFolderMap.value.get(draft.mediaId)?.title || target.title

  if (previousFolder === target) {
    // 原收藏夹内编辑时保持位置不变
    const index = target.rules.findIndex(rule => rule.id === draft.rule.id)
    target.rules.splice(index, 1, draft.rule)
  }
  else {
    if (previousFolder)
      previousFolder.rules = previousFolder.rules.filter(rule => rule.id !== draft.rule.id)
    target.rules.push(draft.rule)
  }
  target.rules = target.rules.filter(rule => !removed.has(rule.id))

  settings.value.favoriteOrganizerFolders = folders.filter(folder => folder.rules.length)
}

function removeRule(folder: FavoriteOrganizerFolder, rule: FavoriteOrganizerRule) {
  settings.value.favoriteOrganizerFolders = configuredFolders.value
    .map(item => item === folder ? { ...item, rules: item.rules.filter(itemRule => itemRule.id !== rule.id) } : item)
    .filter(item => item.rules.length)
}
</script>

<template>
  <div class="organizer-rules">
    <p v-if="!accountId" class="organizer-rules__hint">
      {{ t('common.please_log_in_first') }}
    </p>
    <template v-else>
      <div class="organizer-rules__toolbar">
        <Button size="small" type="primary" :disabled="!loaded" @click="openEditor('create')">
          <template #left>
            <i i-mingcute:add-line />
          </template>
          {{ t('settings.favorite_organizer.new_rule') }}
        </Button>
        <Button size="small" type="tertiary" :disabled="loading" @click="loadFolders">
          <template #left>
            <i :class="loading ? 'i-svg-spinners:ring-resize' : 'i-mingcute:refresh-2-line'" />
          </template>
          {{ t('settings.favorite_organizer.refresh_folders') }}
        </Button>
      </div>
      <p v-if="loadError" class="organizer-rules__error">
        {{ loadError }}
      </p>

      <p v-if="!ruleRows.length" class="organizer-rules__hint">
        {{ t('settings.favorite_organizer.empty') }}
      </p>
      <ul v-else class="organizer-rules__list">
        <li v-for="{ folder, rule } in ruleRows" :key="rule.id" class="organizer-rule-row">
          <div class="organizer-rule-row__main">
            <div class="organizer-rule-row__folder">
              <i i-mingcute:star-line />
              <strong>{{ folderTitle(folder) }}</strong>
              <span v-if="loaded && !ownFolderMap.has(folder.mediaId)" class="organizer-rule-row__warning">
                {{ t('settings.favorite_organizer.folder_missing') }}
              </span>
            </div>
            <p v-if="hasRuleConditions(rule)" class="organizer-rule-row__conditions">
              <span v-for="part in getRuleSummaryParts(rule, t)" :key="part.label">
                <em>{{ part.label }}</em>{{ part.value }}
              </span>
            </p>
            <p v-else class="organizer-rule-row__conditions organizer-rule-row__warning">
              {{ t('settings.favorite_organizer.rule_empty') }}
            </p>
          </div>
          <div class="organizer-rule-row__actions">
            <button
              type="button"
              :disabled="!loaded"
              :aria-label="t('settings.favorite_organizer.copy_rule')"
              :title="t('settings.favorite_organizer.copy_rule')"
              @click="openEditor('copy', folder, rule)"
            >
              <i i-mingcute:copy-2-line />
            </button>
            <button
              type="button"
              :disabled="!loaded"
              :aria-label="t('settings.favorite_organizer.edit_rule')"
              :title="t('settings.favorite_organizer.edit_rule')"
              @click="openEditor('edit', folder, rule)"
            >
              <i i-mingcute:edit-2-line />
            </button>
            <button
              type="button"
              class="organizer-rule-row__delete"
              :aria-label="t('settings.favorite_organizer.remove_rule')"
              :title="t('settings.favorite_organizer.remove_rule')"
              @click="removeRule(folder, rule)"
            >
              <i i-mingcute:delete-2-line />
            </button>
          </div>
        </li>
      </ul>
    </template>

    <FavoriteOrganizerRuleDialog
      v-if="editor"
      :mode="editor.mode"
      :initial="editor.initial"
      :folder-options="folderOptions"
      :folders="configuredFolders"
      @save="saveRule"
      @close="editor = null"
    />
  </div>
</template>

<style scoped lang="scss">
.organizer-rules {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  padding: var(--bew-space-4) 0;
}

.organizer-rules__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bew-space-2);
}

.organizer-rules__hint,
.organizer-rules__error {
  margin: 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.organizer-rules__error {
  color: var(--bew-error-color);
}

.organizer-rules__list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  list-style: none;
}

.organizer-rule-row {
  display: flex;
  align-items: center;
  gap: var(--bew-space-3);
  min-height: 52px;
  padding: var(--bew-space-2) var(--bew-space-2) var(--bew-space-2) var(--bew-space-3);
  background: var(--bew-fill-1);
  transition: background-color var(--bew-duration-fast) var(--bew-ease-standard);

  & + & {
    border-top: 1px solid var(--bew-border-color);
  }

  &:hover {
    background: var(--bew-fill-2);
  }
}

.organizer-rule-row__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: var(--bew-space-0-5);
}

.organizer-rule-row__folder {
  display: flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-width: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  i {
    flex: 0 0 auto;
    color: var(--bew-theme-color);
  }

  strong {
    overflow: hidden;
    min-width: 0;
    font-weight: var(--bew-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.organizer-rule-row__conditions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-0-5) var(--bew-space-3);
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  em {
    margin-right: var(--bew-space-1);
    color: var(--bew-text-3);
    font-style: normal;
  }
}

.organizer-rule-row__warning {
  color: var(--bew-warning-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.organizer-rule-row__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--bew-space-0-5);

  button {
    display: grid;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--bew-interactive-radius);
    color: var(--bew-text-3);
    background: transparent;
    place-items: center;
    cursor: pointer;
    transition:
      color var(--bew-duration-fast) var(--bew-ease-standard),
      background-color var(--bew-duration-fast) var(--bew-ease-standard);

    &:hover:not(:disabled) {
      color: var(--bew-theme-color);
      background: var(--bew-theme-color-10);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .organizer-rule-row__delete:hover:not(:disabled) {
    color: var(--bew-error-color);
    background: var(--bew-error-color-10);
  }
}
</style>
