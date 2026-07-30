<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Button from '~/components/Button.vue'
import Dialog from '~/components/Dialog.vue'
import Input from '~/components/Input.vue'
import Progress from '~/components/Progress.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import { genreChannelConfigs } from '~/components/TopBar/constants/channels'
import { useConfirmDialog } from '~/composables/useConfirmDialog'
import {
  favoriteVideoPartitions,
  getFavoriteVideoPartition,
  getFavoriteVideoPartitionValue,
} from '~/constants/videoPartitions'
import { settings } from '~/logic'
import type {
  FavoriteOrganizerCondition,
  FavoriteOrganizerConditionField,
  FavoriteOrganizerConditionValue,
  FavoriteOrganizerRule,
} from '~/logic/storage'
import { getFavoriteOrganizerConditionValues } from '~/logic/storage'
import type { List as FavoriteFolder } from '~/models/video/favoriteCategory'
import type {
  FavoriteOrganizerMode,
  FavoriteOrganizerProgress,
  FavoriteOrganizerResult,
} from '~/utils/favoriteOrganizer'
import {
  cleanInvalidFavorites,
  loadFavoriteOrganizerFolders,
  organizeFavorites,
} from '~/utils/favoriteOrganizer'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import FavoriteConditionValuePicker from './FavoriteConditionValuePicker.vue'
import FavoriteUploaderPicker from './FavoriteUploaderPicker.vue'

const { t } = useI18n()
const toast = useToast()
const { confirm } = useConfirmDialog()

const folders = ref<FavoriteFolder[]>([])
const foldersLoading = ref(false)
const foldersError = ref('')
const taskRunning = ref(false)
const taskProgress = ref<FavoriteOrganizerProgress>()
const taskResult = ref<FavoriteOrganizerResult>()
const taskKind = ref<'organize' | 'clean'>('organize')
const manualMode = ref<FavoriteOrganizerMode>('copy')
const showRuleEditor = ref(false)
const editingRuleIndex = ref<number | null>(null)
const ruleDraft = ref<FavoriteOrganizerRule>()

const conditionFieldOptions = computed(() => [
  { value: 'uploader' as const, label: t('settings.favorite_organizer_condition_uploader') },
  { value: 'category' as const, label: t('settings.favorite_organizer_condition_category') },
  { value: 'title' as const, label: t('settings.favorite_organizer_condition_title') },
  { value: 'tag' as const, label: t('settings.favorite_organizer_condition_tag') },
])

const manualModeOptions = computed(() => [
  { value: 'copy' as const, label: t('settings.favorite_organizer_copy') },
  { value: 'move' as const, label: t('settings.favorite_organizer_move') },
])

const favoritePartitionKeys = new Set(favoriteVideoPartitions.map(partition => partition.key))
const categoryOptions = computed(() => genreChannelConfigs
  .filter(channel => favoritePartitionKeys.has(channel.key))
  .map(channel => ({
    value: getFavoriteVideoPartitionValue(channel.key),
    label: t(channel.nameKey),
  })))

const targetFolders = computed(() => folders.value.slice(1))

const progressLabel = computed(() => {
  const progress = taskProgress.value
  if (!progress)
    return ''

  const phaseLabel = t(`settings.favorite_organizer_phase_${progress.phase}`)
  if (progress.total > 0 && progress.phase !== 'done') {
    return t('settings.favorite_organizer_progress_detail', {
      phase: phaseLabel,
      current: progress.current,
      total: progress.total,
    })
  }
  return phaseLabel
})

const resultLabel = computed(() => {
  if (!taskResult.value)
    return ''

  const values = { ...taskResult.value }
  return taskKind.value === 'clean'
    ? t('settings.favorite_organizer_cleanup_result', values)
    : t('settings.favorite_organizer_organize_result', values)
})

function createId(prefix: string) {
  if (typeof crypto.randomUUID === 'function')
    return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function conditionPlaceholder(field: FavoriteOrganizerConditionField) {
  return t(`settings.favorite_organizer_condition_${field}_placeholder`)
}

function getTargetOptions(rule: FavoriteOrganizerRule) {
  const options = targetFolders.value.map(folder => ({
    value: folder.id,
    label: folder.title,
  }))
  if (
    rule.targetFolderId != null
    && !options.some(option => option.value === rule.targetFolderId)
  ) {
    options.push({
      value: rule.targetFolderId,
      label: rule.targetFolderTitle || t('settings.favorite_organizer_missing_folder'),
    })
  }
  return options
}

function createRuleDraft(): FavoriteOrganizerRule {
  const target = targetFolders.value[0]
  return {
    id: createId('favorite-rule'),
    name: t('settings.favorite_organizer_new_rule', {
      number: settings.value.favoriteOrganizerRules.length + 1,
    }),
    enabled: true,
    targetFolderId: target?.id ?? null,
    targetFolderTitle: target?.title ?? '',
    conditions: [{
      id: createId('favorite-condition'),
      field: 'title',
      value: '',
      values: [],
    }],
  }
}

function cloneRule(rule: FavoriteOrganizerRule): FavoriteOrganizerRule {
  return {
    ...rule,
    conditions: rule.conditions.map(condition => ({
      ...condition,
      value: '',
      displayValue: '',
      values: getFavoriteOrganizerConditionValues(condition).map(item => ({ ...item })),
    })),
  }
}

function addRule() {
  editingRuleIndex.value = null
  ruleDraft.value = createRuleDraft()
  showRuleEditor.value = true
}

function editRule(rule: FavoriteOrganizerRule, index: number) {
  editingRuleIndex.value = index
  ruleDraft.value = cloneRule(rule)
  showRuleEditor.value = true
}

function closeRuleEditor() {
  showRuleEditor.value = false
  editingRuleIndex.value = null
  ruleDraft.value = undefined
}

function saveRuleDraft() {
  const draft = ruleDraft.value
  if (
    !draft
    || !draft.name.trim()
    || draft.targetFolderId == null
    || !draft.conditions.length
    || draft.conditions.some(condition => getFavoriteOrganizerConditionValues(condition).length === 0)
  ) {
    toast.warning(t('settings.favorite_organizer_rule_incomplete'))
    return
  }

  draft.name = draft.name.trim()
  const savedRule = cloneRule(draft)
  if (editingRuleIndex.value == null)
    settings.value.favoriteOrganizerRules.push(savedRule)
  else
    settings.value.favoriteOrganizerRules.splice(editingRuleIndex.value, 1, savedRule)
  closeRuleEditor()
}

function copyRule(rule: FavoriteOrganizerRule, index: number) {
  const copiedRule: FavoriteOrganizerRule = {
    ...rule,
    id: createId('favorite-rule'),
    name: t('settings.favorite_organizer_rule_copy_name', {
      name: rule.name || t('settings.favorite_organizer_new_rule', { number: index + 1 }),
    }),
    conditions: rule.conditions.map(condition => ({
      ...condition,
      id: createId('favorite-condition'),
      value: '',
      displayValue: '',
      values: getFavoriteOrganizerConditionValues(condition).map(item => ({ ...item })),
    })),
  }
  settings.value.favoriteOrganizerRules.splice(index + 1, 0, copiedRule)
}

async function removeRule(rule: FavoriteOrganizerRule, index: number) {
  const confirmed = await confirm(t('settings.favorite_organizer_delete_rule_confirm', {
    name: rule.name || t('settings.favorite_organizer_new_rule', { number: index + 1 }),
  }))
  if (confirmed)
    settings.value.favoriteOrganizerRules.splice(index, 1)
}

function addCondition(rule: FavoriteOrganizerRule) {
  rule.conditions.push({
    id: createId('favorite-condition'),
    field: 'title',
    value: '',
    values: [],
  })
}

function removeCondition(rule: FavoriteOrganizerRule, index: number) {
  rule.conditions.splice(index, 1)
}

function updateConditionField(
  condition: FavoriteOrganizerCondition,
  field: FavoriteOrganizerConditionField,
) {
  if (condition.field === field)
    return

  condition.field = field
  condition.value = ''
  condition.displayValue = ''
  condition.values = []
}

function updateTargetFolder(rule: FavoriteOrganizerRule, folderId: number) {
  rule.targetFolderId = folderId
  rule.targetFolderTitle = folders.value.find(folder => folder.id === folderId)?.title ?? rule.targetFolderTitle
}

function getRuleTargetTitle(rule: FavoriteOrganizerRule) {
  return folders.value.find(folder => folder.id === rule.targetFolderId)?.title
    || rule.targetFolderTitle
    || t('settings.favorite_organizer_missing_folder')
}

function getConditionValueLabel(
  condition: FavoriteOrganizerCondition,
  item: FavoriteOrganizerConditionValue,
) {
  if (condition.field === 'category') {
    const partition = getFavoriteVideoPartition(item.value)
    const value = partition ? getFavoriteVideoPartitionValue(partition.key) : item.value
    return categoryOptions.value.find(option => option.value === value)?.label
      || item.label
      || item.value
  }
  return item.label || item.value
}

function getConditionSummary(condition: FavoriteOrganizerCondition) {
  const values = getFavoriteOrganizerConditionValues(condition)
    .map(item => getConditionValueLabel(condition, item))
    .join(' / ')
  return `${t(`settings.favorite_organizer_condition_${condition.field}`)} ${values}`
}

async function refreshFolders(force = false) {
  if (foldersLoading.value)
    return

  foldersLoading.value = true
  foldersError.value = ''
  try {
    folders.value = await loadFavoriteOrganizerFolders(force)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    foldersError.value = message === 'LOGIN_REQUIRED'
      ? t('settings.favorite_organizer_login_required')
      : t('settings.favorite_organizer_folders_failed')
  }
  finally {
    foldersLoading.value = false
  }
}

function validateRules() {
  const rules = settings.value.favoriteOrganizerRules
  if (!rules.some(rule =>
    rule.enabled
    && rule.targetFolderId != null
    && rule.conditions.length > 0
    && rule.conditions.every(condition => getFavoriteOrganizerConditionValues(condition).length > 0),
  )) {
    toast.warning(t('settings.favorite_organizer_no_valid_rules'))
    return false
  }
  return true
}

function handleTaskError(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  const knownErrors: Record<string, string> = {
    LOGIN_REQUIRED: 'settings.favorite_organizer_login_required',
    DEFAULT_FAVORITE_FOLDER_MISSING: 'settings.favorite_organizer_default_missing',
    NO_VALID_FAVORITE_RULES: 'settings.favorite_organizer_no_valid_rules',
  }
  toast.error(t(knownErrors[message] ?? 'settings.favorite_organizer_task_failed'))
}

async function runOrganization() {
  if (taskRunning.value || !validateRules())
    return

  taskRunning.value = true
  taskKind.value = 'organize'
  taskProgress.value = undefined
  taskResult.value = undefined
  try {
    taskResult.value = await organizeFavorites(manualMode.value, (progress) => {
      taskProgress.value = progress
    })
    toast.success(t('settings.favorite_organizer_organize_complete'))
  }
  catch (error) {
    handleTaskError(error)
  }
  finally {
    taskRunning.value = false
  }
}

async function runCleanup() {
  if (taskRunning.value)
    return

  const confirmed = await confirm(t('settings.favorite_organizer_cleanup_confirm'))
  if (!confirmed)
    return

  taskRunning.value = true
  taskKind.value = 'clean'
  taskProgress.value = undefined
  taskResult.value = undefined
  try {
    taskResult.value = await cleanInvalidFavorites((progress) => {
      taskProgress.value = progress
    })
    toast.success(t('settings.favorite_organizer_cleanup_complete'))
  }
  catch (error) {
    handleTaskError(error)
  }
  finally {
    taskRunning.value = false
  }
}

onMounted(() => {
  void refreshFolders()
})
</script>

<template>
  <div>
    <SettingsItemGroup
      :title="$t('settings.favorite_organizer_rules')"
      :desc="$t('settings.favorite_organizer_rules_desc')"
    >
      <SettingsItem
        :title="$t('settings.favorite_organizer_auto')"
        :desc="$t('settings.favorite_organizer_auto_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.enableAutomaticFavoriteOrganization" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.favorite_organizer_rule_list')"
        :desc="$t('settings.favorite_organizer_rule_logic')"
      >
        <Button type="primary" @click="addRule">
          <template #left>
            <i i-mingcute:add-line />
          </template>
          {{ $t('settings.favorite_organizer_add_rule') }}
        </Button>

        <template #bottom>
          <p v-if="foldersLoading" class="organizer-hint">
            <i i-svg-spinners:ring-resize />
            {{ $t('settings.favorite_organizer_loading_folders') }}
          </p>
          <div v-else-if="foldersError" class="organizer-hint organizer-hint--error">
            <span>{{ foldersError }}</span>
            <Button size="small" type="secondary" @click="refreshFolders(true)">
              {{ $t('settings.favorite_organizer_reload_folders') }}
            </Button>
          </div>
          <p v-else-if="folders.length === 1" class="organizer-hint">
            {{ $t('settings.favorite_organizer_create_folder_first') }}
          </p>

          <div v-if="settings.favoriteOrganizerRules.length" class="rule-list">
            <article
              v-for="(rule, ruleIndex) in settings.favoriteOrganizerRules"
              :key="rule.id"
              class="rule-summary"
              :class="{ 'is-disabled': !rule.enabled }"
            >
              <div class="rule-summary__identity">
                <strong>{{ rule.name }}</strong>
                <span
                  class="rule-summary__status"
                  :class="{ 'is-enabled': rule.enabled }"
                >
                  {{ $t(rule.enabled
                    ? 'settings.favorite_organizer_rule_status_enabled'
                    : 'settings.favorite_organizer_rule_status_disabled') }}
                </span>
              </div>

              <div class="rule-summary__conditions">
                <span
                  v-for="condition in rule.conditions"
                  :key="condition.id"
                  class="rule-summary__condition"
                >
                  {{ getConditionSummary(condition) }}
                </span>
              </div>

              <div class="rule-summary__target">
                <i i-mingcute:folder-line />
                <div>
                  <span>{{ $t('settings.favorite_organizer_target_folder') }}</span>
                  <strong>{{ getRuleTargetTitle(rule) }}</strong>
                </div>
              </div>

              <div class="rule-summary__actions">
                <Button
                  type="tertiary"
                  class="rule-icon-button"
                  :aria-label="$t('settings.favorite_organizer_edit_rule')"
                  :title="$t('settings.favorite_organizer_edit_rule')"
                  @click="editRule(rule, ruleIndex)"
                >
                  <i i-mingcute:edit-2-line />
                </Button>
                <Button
                  type="tertiary"
                  class="rule-icon-button"
                  :aria-label="$t('settings.favorite_organizer_copy_rule')"
                  :title="$t('settings.favorite_organizer_copy_rule')"
                  @click="copyRule(rule, ruleIndex)"
                >
                  <i i-mingcute:copy-2-line />
                </Button>
                <Button
                  type="tertiary"
                  class="rule-icon-button"
                  :aria-label="$t('settings.favorite_organizer_delete_rule')"
                  :title="$t('settings.favorite_organizer_delete_rule')"
                  @click="removeRule(rule, ruleIndex)"
                >
                  <i i-mingcute:delete-2-line />
                </Button>
              </div>
            </article>
          </div>

          <div v-else class="empty-rules">
            <i i-mingcute:bookmark-line />
            <span>{{ $t('settings.favorite_organizer_empty_rules') }}</span>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.favorite_organizer_manual')"
      :desc="$t('settings.favorite_organizer_manual_desc')"
    >
      <SettingsItem
        :title="$t('settings.favorite_organizer_manual_mode')"
        :desc="$t('settings.favorite_organizer_manual_mode_desc')"
        right-width="auto"
      >
        <SettingsSegmentedControl
          v-model="manualMode"
          :options="manualModeOptions"
          :label="$t('settings.favorite_organizer_manual_mode')"
        />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.favorite_organizer_actions')"
        :desc="$t('settings.favorite_organizer_request_hint')"
      >
        <div class="action-buttons">
          <Button type="primary" :disabled="taskRunning" @click="runOrganization">
            <template #left>
              <i v-if="taskRunning && taskKind === 'organize'" i-svg-spinners:ring-resize />
              <i v-else i-mingcute:route-line />
            </template>
            {{ $t('settings.favorite_organizer_run') }}
          </Button>
          <Button type="error" :disabled="taskRunning" @click="runCleanup">
            <template #left>
              <i v-if="taskRunning && taskKind === 'clean'" i-svg-spinners:ring-resize />
              <i v-else i-mingcute:delete-2-line />
            </template>
            {{ $t('settings.favorite_organizer_cleanup') }}
          </Button>
        </div>

        <template v-if="taskProgress || taskResult" #bottom>
          <div class="task-progress" aria-live="polite">
            <div v-if="taskProgress" class="task-progress__header">
              <span>{{ progressLabel }}</span>
              <strong>{{ taskProgress.percentage }}%</strong>
            </div>
            <div v-if="taskProgress" class="task-progress__track">
              <Progress :percentage="taskProgress.percentage" height="8px" />
            </div>
            <p v-if="taskResult" class="task-progress__result">
              {{ resultLabel }}
            </p>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <Dialog
      v-if="showRuleEditor && ruleDraft"
      append-to-bewly-body
      width="min(760px, calc(100vw - 32px))"
      max-width="760px"
      content-max-height="min(620px, calc(100vh - 180px))"
      :title="$t(editingRuleIndex == null
        ? 'settings.favorite_organizer_add_rule_dialog_title'
        : 'settings.favorite_organizer_edit_rule_dialog_title')"
      :desc="$t('settings.favorite_organizer_rule_editor_desc')"
      :confirm-text="$t('settings.favorite_organizer_save_rule')"
      :close-on-confirm="false"
      :confirm-on-enter="false"
      @close="closeRuleEditor"
      @confirm="saveRuleDraft"
    >
      <div class="rule-editor">
        <section class="rule-editor__basics">
          <label class="rule-editor__field rule-editor__field--name">
            <span>{{ $t('settings.favorite_organizer_rule_name') }}</span>
            <Input
              v-model="ruleDraft.name"
              :placeholder="$t('settings.favorite_organizer_rule_name')"
            />
          </label>

          <label class="rule-editor__field rule-editor__field--target">
            <span>{{ $t('settings.favorite_organizer_target_folder') }}</span>
            <Select
              :model-value="ruleDraft.targetFolderId"
              :options="getTargetOptions(ruleDraft)"
              @update:model-value="updateTargetFolder(ruleDraft!, Number($event))"
            />
          </label>

          <label class="rule-editor__enabled">
            <span>{{ $t('settings.favorite_organizer_rule_enabled') }}</span>
            <Radio v-model="ruleDraft.enabled" />
          </label>
        </section>

        <section class="rule-editor__conditions">
          <div class="rule-editor__section-header">
            <div>
              <strong>{{ $t('settings.favorite_organizer_rule_conditions') }}</strong>
              <span>{{ $t('settings.favorite_organizer_rule_conditions_desc') }}</span>
            </div>
            <Button type="secondary" @click="addCondition(ruleDraft!)">
              <template #left>
                <i i-mingcute:add-line />
              </template>
              {{ $t('settings.favorite_organizer_add_condition') }}
            </Button>
          </div>

          <div class="condition-list">
            <div
              v-for="(condition, conditionIndex) in ruleDraft.conditions"
              :key="condition.id"
              class="condition-row"
            >
              <Select
                :model-value="condition.field"
                :options="conditionFieldOptions"
                class="condition-field"
                @update:model-value="updateConditionField(condition, $event as FavoriteOrganizerConditionField)"
              />
              <FavoriteUploaderPicker
                v-if="condition.field === 'uploader'"
                v-model="condition.values"
                class="condition-uploader"
              />
              <FavoriteConditionValuePicker
                v-else-if="condition.field === 'category'"
                v-model="condition.values"
                mode="select"
                :placeholder="conditionPlaceholder(condition.field)"
                :options="categoryOptions"
                class="condition-value"
              />
              <FavoriteConditionValuePicker
                v-else
                v-model="condition.values"
                mode="text"
                :placeholder="conditionPlaceholder(condition.field)"
                class="condition-value"
              />
              <Button
                type="tertiary"
                class="rule-icon-button"
                :disabled="ruleDraft.conditions.length === 1"
                :aria-label="$t('settings.favorite_organizer_delete_condition')"
                :title="$t('settings.favorite_organizer_delete_condition')"
                @click="removeCondition(ruleDraft!, conditionIndex)"
              >
                <i i-mingcute:close-line />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
.organizer-hint,
.empty-rules {
  display: flex;
  min-height: var(--bew-control-height);
  align-items: center;
  justify-content: center;
  gap: var(--bew-space-2);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.organizer-hint--error {
  justify-content: space-between;
  color: var(--bew-error-color);
}

.rule-list {
  display: grid;
  gap: var(--bew-space-3);
}

.rule-summary {
  display: grid;
  grid-template-columns:
    minmax(140px, 0.8fr)
    minmax(240px, 1.6fr)
    minmax(160px, 0.8fr)
    auto;
  align-items: center;
  gap: var(--bew-space-4);
  padding: var(--bew-space-3) var(--bew-space-4);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-card-radius);
  background: var(--bew-fill-1);
  transition: opacity var(--bew-duration-fast) var(--bew-ease-standard);
}

.rule-summary.is-disabled {
  opacity: 0.64;
}

.rule-summary__identity,
.rule-summary__target,
.rule-summary__actions,
.action-buttons,
.task-progress__header {
  display: flex;
  align-items: center;
  gap: var(--bew-space-2);
}

.rule-summary__identity {
  min-width: 0;
  flex-wrap: wrap;
}

.rule-summary__identity > strong {
  min-width: 0;
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-title);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-summary__status,
.rule-summary__condition {
  border-radius: var(--bew-badge-radius);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-caption);
}

.rule-summary__status {
  flex: 0 0 auto;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-text-2);
  background: var(--bew-fill-2);
}

.rule-summary__status.is-enabled {
  color: var(--bew-theme-color);
  background: var(--bew-theme-color-20);
}

.rule-summary__conditions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
}

.rule-summary__condition {
  max-width: 100%;
  overflow: hidden;
  padding: var(--bew-space-1) var(--bew-space-2);
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-summary__target {
  min-width: 0;
  color: var(--bew-text-2);
}

.rule-summary__target > i {
  flex: 0 0 auto;
  font-size: var(--bew-icon-size-md);
}

.rule-summary__target > div {
  display: grid;
  min-width: 0;
}

.rule-summary__target span {
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.rule-summary__target strong {
  overflow: hidden;
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-summary__actions {
  justify-content: flex-end;
}

.rule-icon-button {
  --b-button-width: var(--bew-control-height);
  --b-button-padding: 0px;

  height: var(--bew-control-height);
  min-height: var(--bew-control-height);
  flex: 0 0 var(--bew-control-height);
  justify-content: center;
}

.rule-editor {
  display: grid;
  gap: var(--bew-space-6);
}

.rule-editor__basics {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.8fr) auto;
  align-items: end;
  gap: var(--bew-space-3);
}

.rule-editor__field,
.rule-editor__enabled {
  display: grid;
  gap: var(--bew-space-2);
}

.rule-editor__field > span,
.rule-editor__enabled > span,
.rule-editor__section-header strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.rule-editor__enabled {
  justify-items: center;
}

.rule-editor__conditions {
  display: grid;
  gap: var(--bew-space-3);
  padding-top: var(--bew-space-4);
  border-top: 1px solid var(--bew-border-color);
}

.rule-editor__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
}

.rule-editor__section-header > div {
  display: grid;
  gap: var(--bew-space-1);
}

.rule-editor__section-header span {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.condition-list {
  display: grid;
  gap: var(--bew-space-2);
}

.condition-row {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr) var(--bew-control-height);
  align-items: start;
  gap: var(--bew-space-2);
}

.condition-row :deep(.b-input),
.condition-row :deep(.select-trigger) {
  height: var(--bew-control-height);
  min-height: var(--bew-control-height);
}

.condition-row :deep(.b-input input),
.condition-row :deep(.select-trigger) {
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.condition-row :deep(.select-trigger) {
  box-sizing: border-box;
  padding: 0 var(--bew-control-item-padding-x);
}

.condition-field,
.condition-value,
.condition-uploader {
  width: 100%;
  min-width: 0;
}

.action-buttons {
  flex-wrap: wrap;
}

.task-progress {
  display: grid;
  gap: var(--bew-space-2);
  padding: var(--bew-space-3);
  border-radius: var(--bew-panel-radius);
  background: var(--bew-fill-1);
}

.task-progress__header {
  justify-content: space-between;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.task-progress__header strong {
  color: var(--bew-text-1);
  font-weight: var(--bew-font-weight-semibold);
}

.task-progress__track {
  height: 8px;
  overflow: hidden;
  border-radius: var(--bew-radius-sm);
  background: var(--bew-fill-2);
}

.task-progress__result {
  margin: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

@media (max-width: 980px) {
  .rule-summary {
    grid-template-columns: minmax(140px, 0.8fr) minmax(240px, 1.4fr) auto;
  }

  .rule-summary__target {
    grid-column: 1 / 3;
    grid-row: 2;
  }

  .rule-summary__actions {
    grid-column: 3;
    grid-row: 1 / 3;
  }
}

@media (max-width: 760px) {
  .rule-summary {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--bew-space-3);
  }

  .rule-summary__conditions,
  .rule-summary__target {
    grid-column: 1 / -1;
  }

  .rule-summary__target {
    grid-row: auto;
  }

  .rule-summary__actions {
    grid-column: 2;
    grid-row: 1;
  }

  .rule-editor__basics,
  .condition-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .rule-editor__enabled {
    grid-auto-flow: column;
    align-items: center;
    justify-content: start;
  }

  .condition-row .rule-icon-button {
    justify-self: end;
  }
}
</style>
