<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Dialog from '~/components/Dialog.vue'
import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

const props = defineProps<{
  momentId: string
  authorMid: string
}>()
const emit = defineEmits<{ close: [] }>()

const REMARK_MAX_LENGTH = 60
// 理由与取值和 Web 端动态举报弹窗一致，0 为“其他”且必须填写说明。
const REPORT_REASONS = [
  { value: 4, key: 'spam' },
  { value: 8, key: 'inciting_conflict' },
  { value: 1, key: 'pornography' },
  { value: 5, key: 'personal_attack' },
  { value: 3, key: 'illegal_content' },
  { value: 9, key: 'political_rumors' },
  { value: 10, key: 'social_event_rumor' },
  { value: 12, key: 'false_information' },
  { value: 13, key: 'illegal_link' },
  { value: 0, key: 'other' },
] as const

const { t } = useI18n()
const toast = useToast()
const radioName = `moment-report-${useId()}`
const dialogRef = ref<InstanceType<typeof Dialog> | null>(null)
const selected = ref<number | null>(null)
const remark = ref('')
const submitting = ref(false)
const reasons = computed(() => REPORT_REASONS.map(reason => ({
  value: reason.value,
  label: t(`moment_card.report_reasons.${reason.key}`),
})))

async function submit() {
  if (submitting.value)
    return
  if (selected.value === null) {
    toast.warning(t('moment_card.report_select_reason'))
    return
  }
  const description = remark.value.trim()
  if (selected.value === 0 && !description) {
    toast.warning(t('moment_card.report_remark_required'))
    return
  }
  const csrf = getCSRF()
  if (!csrf || !getUserID()) {
    toast.warning(t('common.please_log_in_first'))
    return
  }

  submitting.value = true
  let succeeded = false
  try {
    const response = await api.moment.reportMoment({
      accused_uid: Number(props.authorMid),
      dynamic_id: props.momentId,
      reason_type: selected.value,
      reason_desc: selected.value === 0 ? description : null,
      csrf,
    })
    if (response?.code !== 0)
      throw new Error(response?.message || t('moment_card.report_failed'))
    toast.success(response.data?.message || t('moment_card.report_success'))
    succeeded = true
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('moment_card.report_failed'))
  }
  finally {
    submitting.value = false
  }
  // Dialog 在 loading 期间拒绝关闭，等 loading 回传后再关闭。
  if (succeeded) {
    await nextTick()
    dialogRef.value?.close()
  }
}
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="t('moment_card.report_title')"
    width="440px"
    max-width="calc(100vw - 16px)"
    append-to-bewly-body
    :loading="submitting"
    :close-on-confirm="false"
    @close="emit('close')"
    @confirm="submit"
  >
    <fieldset class="moment-report">
      <legend class="moment-report__legend">
        {{ t('moment_card.report_select_reason') }}
      </legend>
      <div class="moment-report__options">
        <label
          v-for="reason in reasons"
          :key="reason.value"
          class="moment-report__option"
          :class="{ 'is-selected': selected === reason.value }"
        >
          <input
            v-model="selected"
            class="moment-report__radio"
            type="radio"
            :name="radioName"
            :value="reason.value"
          >
          <span>{{ reason.label }}</span>
        </label>
      </div>
      <div v-if="selected === 0" class="moment-report__remark">
        <textarea
          v-model="remark"
          class="moment-report__textarea"
          rows="3"
          :maxlength="REMARK_MAX_LENGTH"
          :placeholder="t('moment_card.report_remark_placeholder')"
          :aria-label="t('moment_card.report_remark_placeholder')"
          @keydown.enter.stop
        />
        <span class="moment-report__count" aria-hidden="true">{{ remark.length }}/{{ REMARK_MAX_LENGTH }}</span>
      </div>
    </fieldset>
  </Dialog>
</template>

<style lang="scss" scoped>
.moment-report {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.moment-report__legend {
  margin-bottom: var(--bew-space-3);
  padding: 0;
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.moment-report__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-2);
}

.moment-report__option {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: var(--bew-space-2) var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
  cursor: pointer;
  transition:
    color var(--bew-duration-fast) var(--bew-ease-standard),
    background-color var(--bew-duration-fast) var(--bew-ease-standard);

  &:hover {
    background: var(--bew-fill-2);
  }

  &.is-selected {
    color: var(--bew-theme-color);
    background: var(--bew-theme-color-20);
  }

  &:has(.moment-report__radio:focus-visible) {
    outline: 2px solid var(--bew-theme-color-40);
    outline-offset: 2px;
  }
}

.moment-report__radio {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.moment-report__remark {
  position: relative;
}

.moment-report__textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: var(--bew-space-2) var(--bew-space-3) var(--bew-space-6);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  resize: none;

  &:focus-visible {
    border-color: var(--bew-theme-color);
    outline: none;
  }
}

.moment-report__count {
  position: absolute;
  right: var(--bew-space-3);
  bottom: var(--bew-space-2);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}
</style>
