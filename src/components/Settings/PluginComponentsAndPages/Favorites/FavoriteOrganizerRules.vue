<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { VIDEO_ZONES } from '~/constants/videoZones'
import type { FavoriteOrganizerFolder, FavoriteOrganizerRule, FavoriteOrganizerUp } from '~/logic'
import { settings } from '~/logic'
import type { List as FavoriteFolder } from '~/models/video/favoriteCategory'
import { getZoneName, hasRuleConditions, isDefaultFavoriteFolder, loadOwnFavoriteFolders } from '~/utils/favoriteOrganizer'
import { getUserID } from '~/utils/main'

import FavoriteOrganizerUpInput from './FavoriteOrganizerUpInput.vue'

const { t } = useI18n()
const accountId = getUserID()
const ownFolders = ref<FavoriteFolder[]>([])
const loading = ref(false)
const loaded = ref(false)
const loadError = ref('')
const addFolderSelectKey = ref(0)
const zoneSelectKeys = reactive<Record<string, number>>({})
const keywordInputs = reactive<Record<string, string>>({})

const configuredFolders = computed(() => settings.value.favoriteOrganizerFolders)
const ownFolderMap = computed(() => new Map(ownFolders.value.map(folder => [folder.id, folder])))

const addFolderOptions = computed(() => {
  const configured = new Set(configuredFolders.value.map(folder => folder.mediaId))
  return [
    { value: 0, label: t('settings.favorite_organizer.add_folder_placeholder') },
    ...ownFolders.value
      .filter(folder => !isDefaultFavoriteFolder(folder) && !configured.has(folder.id))
      .map(folder => ({ value: folder.id, label: folder.title })),
  ]
})

const zoneOptions = computed(() => [
  { value: 0, label: t('settings.favorite_organizer.zone_placeholder') },
  ...VIDEO_ZONES.flatMap(zone => [
    { value: zone.tid, label: zone.name },
    ...zone.children.map(child => ({ value: child.tid, label: `${zone.name} · ${child.name}` })),
  ]),
])

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

function createRule(): FavoriteOrganizerRule {
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ups: [],
    zones: [],
    titleKeywords: [],
  }
}

function folderTitle(folder: FavoriteOrganizerFolder) {
  return ownFolderMap.value.get(folder.mediaId)?.title || folder.title || String(folder.mediaId)
}

function addFolder(mediaId: number) {
  addFolderSelectKey.value++
  const folder = ownFolderMap.value.get(mediaId)
  if (!folder || configuredFolders.value.some(item => item.mediaId === mediaId))
    return
  configuredFolders.value.push({ mediaId, title: folder.title, rules: [createRule()] })
}

function removeFolder(index: number) {
  configuredFolders.value.splice(index, 1)
}

function addRule(folder: FavoriteOrganizerFolder) {
  folder.rules.push(createRule())
}

function removeRule(folder: FavoriteOrganizerFolder, index: number) {
  folder.rules.splice(index, 1)
}

function addUp(rule: FavoriteOrganizerRule, up: FavoriteOrganizerUp) {
  if (!rule.ups.some(item => item.mid === up.mid))
    rule.ups.push(up)
}

function addZone(rule: FavoriteOrganizerRule, tid: number) {
  zoneSelectKeys[rule.id] = (zoneSelectKeys[rule.id] ?? 0) + 1
  if (tid && !rule.zones.includes(tid))
    rule.zones.push(tid)
}

function addKeyword(rule: FavoriteOrganizerRule) {
  const keyword = (keywordInputs[rule.id] ?? '').trim()
  if (keyword && !rule.titleKeywords.some(item => item.toLowerCase() === keyword.toLowerCase()))
    rule.titleKeywords.push(keyword)
  keywordInputs[rule.id] = ''
}
</script>

<template>
  <div class="organizer-rules">
    <p v-if="!accountId" class="organizer-rules__hint">
      {{ t('common.please_log_in_first') }}
    </p>
    <template v-else>
      <div class="organizer-rules__toolbar">
        <Select
          :key="addFolderSelectKey"
          class="organizer-rules__folder-select"
          :options="addFolderOptions"
          :model-value="0"
          :disabled="!loaded || addFolderOptions.length <= 1"
          @change="addFolder"
        />
        <Button size="small" type="tertiary" :disabled="loading" @click="loadFolders">
          <template #left>
            <i :class="loading ? 'i-svg-spinners:ring-resize' : 'i-mingcute:refresh-2-line'" />
          </template>
          {{ t('common.operation.refresh') }}
        </Button>
      </div>
      <p v-if="loadError" class="organizer-rules__error">
        {{ loadError }}
      </p>

      <p v-if="!configuredFolders.length" class="organizer-rules__hint">
        {{ t('settings.favorite_organizer.empty') }}
      </p>

      <section
        v-for="(folder, folderIndex) in configuredFolders"
        :key="folder.mediaId"
        class="organizer-folder"
      >
        <header class="organizer-folder__header">
          <i i-mingcute:star-line />
          <strong>{{ folderTitle(folder) }}</strong>
          <span v-if="loaded && !ownFolderMap.has(folder.mediaId)" class="organizer-folder__missing">
            {{ t('settings.favorite_organizer.folder_missing') }}
          </span>
          <button
            type="button"
            class="organizer-icon-button"
            :aria-label="t('settings.favorite_organizer.remove_folder')"
            :title="t('settings.favorite_organizer.remove_folder')"
            @click="removeFolder(folderIndex)"
          >
            <i i-mingcute:delete-2-line />
          </button>
        </header>

        <template v-for="(rule, ruleIndex) in folder.rules" :key="rule.id">
          <div v-if="ruleIndex > 0" class="organizer-folder__or">
            {{ t('settings.favorite_organizer.or') }}
          </div>
          <div class="organizer-rule">
            <div class="organizer-rule__header">
              <span>{{ t('settings.favorite_organizer.rule_index', { index: ruleIndex + 1 }) }}</span>
              <span v-if="!hasRuleConditions(rule)" class="organizer-rule__warning">
                {{ t('settings.favorite_organizer.rule_empty') }}
              </span>
              <button
                type="button"
                class="organizer-icon-button"
                :aria-label="t('settings.favorite_organizer.remove_rule')"
                :title="t('settings.favorite_organizer.remove_rule')"
                @click="removeRule(folder, ruleIndex)"
              >
                <i i-mingcute:close-line />
              </button>
            </div>

            <div class="organizer-rule__row">
              <span class="organizer-rule__label">{{ t('settings.favorite_organizer.up') }}</span>
              <div class="organizer-rule__values">
                <div v-if="rule.ups.length" class="organizer-chips">
                  <span v-for="(up, upIndex) in rule.ups" :key="up.mid" class="organizer-chip" :title="`UID ${up.mid}`">
                    {{ up.name || up.mid }}
                    <button type="button" :aria-label="t('common.operation.delete')" @click="rule.ups.splice(upIndex, 1)">
                      <i i-mingcute:close-line />
                    </button>
                  </span>
                </div>
                <FavoriteOrganizerUpInput :exclude="rule.ups.map(up => up.mid)" @add="addUp(rule, $event)" />
              </div>
            </div>

            <div class="organizer-rule__row">
              <span class="organizer-rule__label">{{ t('settings.favorite_organizer.zone') }}</span>
              <div class="organizer-rule__values">
                <div v-if="rule.zones.length" class="organizer-chips">
                  <span v-for="(tid, zoneIndex) in rule.zones" :key="tid" class="organizer-chip">
                    {{ getZoneName(tid) }}
                    <button type="button" :aria-label="t('common.operation.delete')" @click="rule.zones.splice(zoneIndex, 1)">
                      <i i-mingcute:close-line />
                    </button>
                  </span>
                </div>
                <Select
                  :key="zoneSelectKeys[rule.id] ?? 0"
                  :options="zoneOptions"
                  :model-value="0"
                  @change="addZone(rule, $event)"
                />
              </div>
            </div>

            <div class="organizer-rule__row">
              <span class="organizer-rule__label">{{ t('settings.favorite_organizer.title_keyword') }}</span>
              <div class="organizer-rule__values">
                <div v-if="rule.titleKeywords.length" class="organizer-chips">
                  <span v-for="(keyword, keywordIndex) in rule.titleKeywords" :key="keyword" class="organizer-chip">
                    {{ keyword }}
                    <button type="button" :aria-label="t('common.operation.delete')" @click="rule.titleKeywords.splice(keywordIndex, 1)">
                      <i i-mingcute:close-line />
                    </button>
                  </span>
                </div>
                <Input
                  v-model="keywordInputs[rule.id]"
                  size="small"
                  :placeholder="t('settings.favorite_organizer.title_keyword_placeholder')"
                  :aria-label="t('settings.favorite_organizer.title_keyword')"
                  @enter="addKeyword(rule)"
                />
              </div>
            </div>
          </div>
        </template>

        <Button size="small" type="tertiary" @click="addRule(folder)">
          <template #left>
            <i i-mingcute:add-line />
          </template>
          {{ t('settings.favorite_organizer.add_rule') }}
        </Button>
      </section>
    </template>
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
  align-items: center;
  gap: var(--bew-space-2);
}

.organizer-rules__folder-select {
  min-width: 0;
  flex: 1;
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

.organizer-folder {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  border-radius: var(--bew-panel-radius);
  background: var(--bew-fill-1);
}

.organizer-folder__header {
  display: flex;
  align-self: stretch;
  align-items: center;
  gap: var(--bew-space-2);
  min-width: 0;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  line-height: var(--bew-line-height-title);

  strong {
    overflow: hidden;
    min-width: 0;
    font-weight: var(--bew-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .organizer-icon-button {
    margin-left: auto;
  }
}

.organizer-folder__missing,
.organizer-rule__warning {
  color: var(--bew-warning-color);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.organizer-folder__or {
  align-self: center;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.organizer-rule {
  display: flex;
  align-self: stretch;
  flex-direction: column;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-alt);
}

.organizer-rule__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);

  .organizer-icon-button {
    margin-left: auto;
  }
}

.organizer-rule__row {
  display: flex;
  align-items: flex-start;
  gap: var(--bew-space-3);
}

.organizer-rule__label {
  width: 80px;
  flex: 0 0 auto;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  // 与 28px 高的小号输入框文字基线对齐
  line-height: 28px;
}

.organizer-rule__values {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.organizer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
}

.organizer-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--bew-space-1);
  min-height: 26px;
  padding: 0 var(--bew-space-1) 0 var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  button {
    display: grid;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--bew-radius-full);
    color: inherit;
    background: transparent;
    place-items: center;
    cursor: pointer;

    &:hover {
      background: var(--bew-theme-color-20);
    }
  }
}

.organizer-icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-3);
  background: transparent;
  place-items: center;
  cursor: pointer;

  &:hover {
    color: var(--bew-error-color);
    background: var(--bew-error-color-10);
  }
}

@media (max-width: 560px) {
  .organizer-rule__row {
    flex-direction: column;
    gap: var(--bew-space-1);
  }

  .organizer-rule__label {
    width: auto;
    line-height: var(--bew-line-height-control);
  }
}
</style>
