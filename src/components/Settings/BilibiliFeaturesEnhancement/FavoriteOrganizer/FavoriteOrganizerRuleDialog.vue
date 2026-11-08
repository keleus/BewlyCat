<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Dialog from '~/components/Dialog.vue'
import { VIDEO_ZONES } from '~/constants/videoZones'
import type { FavoriteOrganizerFolder, FavoriteOrganizerRule } from '~/logic'
import { getZoneName, hasRuleConditions, ruleCovers } from '~/utils/favoriteOrganizer'

import UserSearchPicker from '../../components/UserSearchPicker.vue'
import type { FavoriteOrganizerRuleDraft, UserSearchCandidate } from '../../types'
import FavoriteOrganizerZoneInput from './FavoriteOrganizerZoneInput.vue'
import { formatRuleSummary } from './ruleSummary'

const props = defineProps<{
  mode: 'create' | 'edit' | 'copy'
  initial?: FavoriteOrganizerRuleDraft
  folderOptions: { value: number, label: string }[]
  /** 已保存的规则，用于检查重复与包含 */
  folders: FavoriteOrganizerFolder[]
}>()

const emit = defineEmits<{
  (event: 'save', draft: FavoriteOrganizerRuleDraft, removeRuleIds: string[]): void
  (event: 'close'): void
}>()

const { t } = useI18n()
const dialogRef = ref<InstanceType<typeof Dialog>>()
const mediaId = ref(props.initial?.mediaId ?? 0)
const rule = reactive<FavoriteOrganizerRule>({
  // 复制时生成新 id，编辑时保留原 id 以便原位替换
  id: props.mode === 'edit' && props.initial ? props.initial.rule.id : createRuleId(),
  ups: props.initial?.rule.ups.map(up => ({ ...up })) ?? [],
  zones: [...props.initial?.rule.zones ?? []],
  titleKeywords: [...props.initial?.rule.titleKeywords ?? []],
})
const keywordInput = ref('')
const submitted = ref(false)

const title = computed(() => ({
  create: t('settings.favorite_organizer.new_rule'),
  edit: t('settings.favorite_organizer.edit_rule'),
  copy: t('settings.favorite_organizer.copy_rule'),
})[props.mode])

const siblingRules = computed(() => {
  const folder = props.folders.find(item => item.mediaId === mediaId.value)
  return folder?.rules.filter(item => item.id !== rule.id && hasRuleConditions(item)) ?? []
})
const coveringRule = computed(() => siblingRules.value.find(item => ruleCovers(item, rule)))
const isDuplicate = computed(() => Boolean(coveringRule.value && ruleCovers(rule, coveringRule.value)))
const coveredRules = computed(() => coveringRule.value
  ? []
  : siblingRules.value.filter(item => ruleCovers(rule, item)))

const error = computed(() => {
  if (coveringRule.value) {
    const summary = formatRuleSummary(coveringRule.value, t)
    return isDuplicate.value
      ? t('settings.favorite_organizer.rule_duplicate', { rule: summary })
      : t('settings.favorite_organizer.rule_covered', { rule: summary })
  }
  if (!submitted.value)
    return ''
  if (!mediaId.value)
    return t('settings.favorite_organizer.folder_required')
  if (!hasRuleConditions(rule))
    return t('settings.favorite_organizer.conditions_required')
  return ''
})

function createRuleId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function addUp(user: UserSearchCandidate) {
  if (rule.ups.some(item => item.mid === user.mid))
    return t('settings.favorite_organizer.up_already_added')
  rule.ups.push({ mid: user.mid, name: user.name })
}

function addZone(tid: number) {
  if (!tid || rule.zones.includes(tid))
    return
  // 主分区已包含其全部子分区，移除重复的子分区
  const childTids = new Set(VIDEO_ZONES.find(zone => zone.tid === tid)?.children.map(child => child.tid))
  rule.zones = [...rule.zones.filter(zoneTid => !childTids.has(zoneTid)), tid]
}

function addKeyword() {
  const keyword = keywordInput.value.trim()
  if (keyword && !rule.titleKeywords.some(item => item.toLowerCase() === keyword.toLowerCase()))
    rule.titleKeywords.push(keyword)
  keywordInput.value = ''
}

function save() {
  // 输入框里尚未回车的关键词一并保存
  addKeyword()
  submitted.value = true
  if (error.value)
    return
  emit('save', {
    mediaId: mediaId.value,
    rule: { id: rule.id, ups: [...rule.ups], zones: [...rule.zones], titleKeywords: [...rule.titleKeywords] },
  }, coveredRules.value.map(item => item.id))
  dialogRef.value?.close()
}
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="title"
    width="640px"
    max-width="calc(100vw - 32px)"
    content-max-height="calc(100vh - 220px)"
    :close-on-confirm="false"
    append-to-bewly-body
    @confirm="save"
    @close="emit('close')"
  >
    <!-- 阻止字段内的回车冒泡到 Dialog 的全局回车确认；Esc 仍可关闭弹窗 -->
    <div class="rule-editor" @keydown.enter.stop>
      <p class="rule-editor__desc">
        {{ t('settings.favorite_organizer.rule_editor_desc') }}
      </p>

      <div class="rule-editor__row">
        <span class="rule-editor__label">{{ t('settings.favorite_organizer.folder') }}</span>
        <Select v-model="mediaId" :options="folderOptions" in-dialog />
      </div>

      <div class="rule-editor__row">
        <span class="rule-editor__label">{{ t('settings.favorite_organizer.up') }}</span>
        <div class="rule-editor__values">
          <div v-if="rule.ups.length" class="rule-editor__chips">
            <span v-for="(up, upIndex) in rule.ups" :key="up.mid" class="rule-editor__chip" :title="`UID ${up.mid}`">
              {{ up.name || up.mid }}
              <button type="button" :aria-label="t('common.operation.delete')" @click="rule.ups.splice(upIndex, 1)">
                <i i-mingcute:close-line />
              </button>
            </span>
          </div>
          <UserSearchPicker
            size="small"
            :select="addUp"
            :exclude="rule.ups.map(up => up.mid)"
            :placeholder="t('settings.favorite_organizer.up_placeholder')"
          />
        </div>
      </div>

      <div class="rule-editor__row">
        <span class="rule-editor__label">{{ t('settings.favorite_organizer.zone') }}</span>
        <div class="rule-editor__values">
          <div v-if="rule.zones.length" class="rule-editor__chips">
            <span v-for="(tid, zoneIndex) in rule.zones" :key="tid" class="rule-editor__chip">
              {{ getZoneName(tid) }}
              <button type="button" :aria-label="t('common.operation.delete')" @click="rule.zones.splice(zoneIndex, 1)">
                <i i-mingcute:close-line />
              </button>
            </span>
          </div>
          <FavoriteOrganizerZoneInput :selected="rule.zones" @select="addZone" />
        </div>
      </div>

      <div class="rule-editor__row">
        <span class="rule-editor__label">{{ t('settings.favorite_organizer.title_keyword') }}</span>
        <div class="rule-editor__values">
          <div v-if="rule.titleKeywords.length" class="rule-editor__chips">
            <span v-for="(keyword, keywordIndex) in rule.titleKeywords" :key="keyword" class="rule-editor__chip">
              {{ keyword }}
              <button type="button" :aria-label="t('common.operation.delete')" @click="rule.titleKeywords.splice(keywordIndex, 1)">
                <i i-mingcute:close-line />
              </button>
            </span>
          </div>
          <Input
            v-model="keywordInput"
            size="small"
            :placeholder="t('settings.favorite_organizer.title_keyword_placeholder')"
            :aria-label="t('settings.favorite_organizer.title_keyword')"
            @enter="addKeyword"
          />
        </div>
      </div>

      <p v-if="error" class="rule-editor__message rule-editor__message--error" role="alert">
        <i i-mingcute:warning-line />{{ error }}
      </p>
      <div v-else-if="coveredRules.length" class="rule-editor__message rule-editor__message--warning" role="status">
        <i i-mingcute:information-line />
        <div>
          <p>{{ t('settings.favorite_organizer.rule_covers', { count: coveredRules.length }) }}</p>
          <ul>
            <li v-for="item in coveredRules" :key="item.id">
              {{ formatRuleSummary(item, t) }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.rule-editor {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-4);
  padding-bottom: var(--bew-space-2);
}

.rule-editor__desc {
  margin: 0;
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.rule-editor__row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: var(--bew-space-3);
  align-items: start;
}

.rule-editor__label {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  // 与 28px 高的小号输入框文字对齐
  line-height: 28px;
}

.rule-editor__values {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.rule-editor__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
}

.rule-editor__chip {
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
    width: 22px;
    height: 22px;
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

.rule-editor__message {
  display: flex;
  gap: var(--bew-space-2);
  margin: 0;
  padding: var(--bew-space-2) var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);

  > i {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-top: 1px;
  }

  p,
  ul {
    margin: 0;
  }

  ul {
    padding-left: var(--bew-space-4);
    color: var(--bew-text-2);
  }
}

.rule-editor__message--error {
  color: var(--bew-error-color);
  background: var(--bew-error-color-10);
}

.rule-editor__message--warning {
  color: var(--bew-warning-color);
  background: var(--bew-fill-1);
}

@media (max-width: 560px) {
  .rule-editor__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--bew-space-1);
  }

  .rule-editor__label {
    line-height: var(--bew-line-height-control);
  }
}
</style>
