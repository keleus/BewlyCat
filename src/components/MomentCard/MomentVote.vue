<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import api from '~/utils/api'
import { getCSRF, getUserID } from '~/utils/main'

import { getMomentThumbnailUrl } from './utils'

interface VoteOption {
  index: number
  text: string
  count: number
  imageUrl: string
}

interface VoteInfo {
  title: string
  type: number
  choiceCount: number
  endTime: number
  status: number
  total: number
  options: VoteOption[]
  selectedVotes: number[]
}

const props = defineProps<{
  voteId: string
  momentId: string
  fallbackTitle: string
  fallbackDesc: string
  fallbackEndTime?: number
}>()

const { t } = useI18n()
const toast = useToast()
const voteInfo = ref<VoteInfo | null>(null)
const selectedVotes = ref<number[]>([])
const submittedVotes = ref<number[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const loadError = ref('')
let loadSequence = 0

const choiceCount = computed(() => Math.max(1, voteInfo.value?.choiceCount || 1))
const isImageVote = computed(() => Boolean(
  voteInfo.value?.type === 1
  || voteInfo.value?.options.some(option => option.imageUrl),
))
const isEnded = computed(() => {
  const endTime = voteInfo.value?.endTime || props.fallbackEndTime || 0
  return (endTime > 0 && Date.now() / 1000 >= endTime)
    || voteInfo.value?.status === 4
})
const isVoted = computed(() => Boolean(
  submittedVotes.value.length || voteInfo.value?.selectedVotes.length,
))
const showResults = computed(() => isEnded.value || isVoted.value)
const resultTotal = computed(() => Math.max(0, voteInfo.value?.total || 0))
const maxOptionCount = computed(() => Math.max(
  0,
  ...voteInfo.value?.options.map(option => option.count) || [],
))
const deadlineText = computed(() => {
  const endTime = voteInfo.value?.endTime || props.fallbackEndTime || 0
  const remainingMinutes = Math.ceil((endTime - Date.now() / 1000) / 60)
  if (remainingMinutes <= 0)
    return ''

  const days = Math.floor(remainingMinutes / (24 * 60))
  const hours = Math.floor(remainingMinutes % (24 * 60) / 60)
  const minutes = remainingMinutes % 60
  const parts = [
    days > 0 ? t('moments.vote_time_day', { count: days }) : '',
    hours > 0 ? t('moments.vote_time_hour', { count: hours }) : '',
    minutes > 0 || (!days && !hours) ? t('moments.vote_time_minute', { count: minutes }) : '',
  ].filter(Boolean)
  return t('moments.vote_ends_in', { time: parts.join('') })
})

function toNumberArray(value: unknown): number[] {
  if (Array.isArray(value))
    return value.map(Number).filter(item => Number.isInteger(item) && item > 0)
  if (typeof value === 'string')
    return value.split(',').map(Number).filter(item => Number.isInteger(item) && item > 0)
  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? [numberValue] : []
}

function normalizeVoteInfo(response: any): VoteInfo | null {
  const raw = response?.data?.vote_info || response?.data?.info
  if (!raw || typeof raw !== 'object')
    return null

  const rawOptions = Array.isArray(raw.options) ? raw.options : []
  const options = rawOptions.map((option: any, optionIndex: number) => ({
    index: Number(option.opt_idx ?? option.idx ?? optionIndex + 1),
    text: String(option.opt_desc ?? option.desc ?? option.title ?? ''),
    count: Math.max(0, Number(option.cnt ?? option.total) || 0),
    imageUrl: String(option.img_url ?? option.cover ?? ''),
  })).filter((option: VoteOption) => option.index > 0 && (option.text || option.imageUrl))

  const selectedFromOptions = rawOptions
    .filter((option: any) => Boolean(option.is_vote ?? option.my_vote ?? option.checked))
    .map((option: any, optionIndex: number) => Number(option.opt_idx ?? option.idx ?? optionIndex + 1))
  const selected = [
    ...toNumberArray(raw.my_votes ?? raw.my_vote ?? raw.votes),
    ...toNumberArray(response?.data?.my_votes ?? response?.data?.my_vote ?? response?.data?.votes),
    ...selectedFromOptions,
  ].filter((item, index, list) => list.indexOf(item) === index)

  return {
    title: String(raw.title || props.fallbackTitle || ''),
    type: Number(raw.type) || 0,
    choiceCount: Math.max(1, Number(raw.choice_cnt) || 1),
    endTime: Math.max(0, Number(raw.end_time ?? raw.endtime) || props.fallbackEndTime || 0),
    status: Number(raw.status) || 0,
    total: Math.max(0, Number(raw.join_num ?? raw.cnt ?? raw.total) || 0),
    options,
    selectedVotes: selected,
  }
}

async function loadVote() {
  const sequence = ++loadSequence
  isLoading.value = true
  loadError.value = ''
  try {
    const response = await api.moment.getMomentVote({ vote_id: props.voteId })
    if (sequence !== loadSequence)
      return
    if (response?.code !== 0)
      throw new Error(response?.message || t('moments.vote_load_failed'))
    const normalized = normalizeVoteInfo(response)
    if (!normalized || !normalized.options.length)
      throw new Error(t('moments.vote_load_failed'))
    voteInfo.value = normalized
    if (!submittedVotes.value.length)
      selectedVotes.value = [...normalized.selectedVotes]
  }
  catch (error) {
    if (sequence === loadSequence)
      loadError.value = error instanceof Error ? error.message : t('moments.vote_load_failed')
  }
  finally {
    if (sequence === loadSequence)
      isLoading.value = false
  }
}

function isOptionSelected(index: number) {
  return selectedVotes.value.includes(index)
    || submittedVotes.value.includes(index)
    || Boolean(voteInfo.value?.selectedVotes.includes(index))
}

function toggleOption(index: number) {
  if (isEnded.value || isVoted.value || isSubmitting.value)
    return

  if (choiceCount.value === 1) {
    selectedVotes.value = [index]
    return
  }

  if (selectedVotes.value.includes(index)) {
    selectedVotes.value = selectedVotes.value.filter(item => item !== index)
    return
  }
  if (selectedVotes.value.length < choiceCount.value)
    selectedVotes.value = [...selectedVotes.value, index]
}

function getOptionPercentage(option: VoteOption) {
  if (!resultTotal.value)
    return 0
  return Math.min(100, Math.max(0, option.count / resultTotal.value * 100))
}

function formatOptionPercentage(option: VoteOption) {
  return getOptionPercentage(option).toFixed(1)
}

function isMaxOption(option: VoteOption) {
  return showResults.value && maxOptionCount.value > 0 && option.count === maxOptionCount.value
}

async function submitVote() {
  if (!selectedVotes.value.length || isSubmitting.value || isEnded.value || isVoted.value)
    return

  const csrf = getCSRF()
  const userId = Number(getUserID())
  if (!csrf || !Number.isSafeInteger(userId) || userId <= 0) {
    toast.warning(t('moments.login_to_vote'))
    return
  }

  isSubmitting.value = true
  try {
    const response = await api.moment.submitMomentVote({
      vote_id: Number(props.voteId),
      votes: selectedVotes.value,
      voter_uid: userId,
      status: 0,
      op_bit: 0,
      dynamic_id: props.momentId,
      csrf,
      csrf_token: csrf,
    })
    if (response?.code !== 0)
      throw new Error(response?.message || t('moments.vote_submit_failed'))
    submittedVotes.value = [...selectedVotes.value]
    toast.success(t('moments.vote_submit_succeeded'))
    await loadVote()
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : t('moments.vote_submit_failed'))
  }
  finally {
    isSubmitting.value = false
  }
}

watch(() => props.voteId, () => {
  voteInfo.value = null
  selectedVotes.value = []
  submittedVotes.value = []
  void loadVote()
}, { immediate: true })
</script>

<template>
  <section class="moment-vote" @click.stop @keydown.stop>
    <header class="moment-vote__header">
      <strong>{{ voteInfo?.title || fallbackTitle }}</strong>
      <small v-if="!voteInfo && fallbackDesc">{{ fallbackDesc }}</small>
    </header>

    <div v-if="isLoading && !voteInfo" class="moment-vote__loading" :aria-label="t('moments.vote_loading')">
      <span v-for="index in 2" :key="index" />
    </div>
    <div v-else-if="loadError && !voteInfo" class="moment-vote__error">
      <span>{{ loadError }}</span>
      <button type="button" @click="loadVote">
        {{ t('moments.vote_retry') }}
      </button>
    </div>
    <template v-else-if="voteInfo">
      <small v-if="choiceCount > 1 && !showResults" class="moment-vote__hint">
        {{ t('moments.vote_select_up_to', { count: choiceCount }) }}
      </small>
      <div
        class="moment-vote__options"
        :class="{ 'moment-vote__options--image': isImageVote }"
        :role="choiceCount === 1 ? 'radiogroup' : 'group'"
      >
        <button
          v-for="option in voteInfo.options"
          :key="option.index"
          type="button"
          class="moment-vote__option"
          :class="{
            'is-selected': isOptionSelected(option.index),
            'is-result': showResults,
            'is-max-result': isMaxOption(option),
          }"
          :role="choiceCount === 1 ? 'radio' : 'checkbox'"
          :aria-checked="isOptionSelected(option.index)"
          :disabled="isEnded || isVoted || isSubmitting"
          @click="toggleOption(option.index)"
        >
          <span
            v-if="showResults"
            class="moment-vote__option-fill"
            :style="{ width: `${getOptionPercentage(option)}%` }"
          />
          <span
            v-if="isImageVote"
            class="moment-vote__option-image"
          >
            <img
              v-if="option.imageUrl"
              :src="getMomentThumbnailUrl(option.imageUrl, 320)"
              alt=""
              loading="lazy"
              decoding="async"
            >
            <span v-else i-tabler-photo-off aria-hidden="true" />
          </span>
          <span class="moment-vote__option-body">
            <span class="moment-vote__option-text">{{ option.text }}</span>
            <span
              v-if="showResults && isOptionSelected(option.index)"
              i-tabler-circle-check-filled
              class="moment-vote__option-selected"
              :aria-label="t('moments.vote_selected')"
            />
            <span v-if="showResults" class="moment-vote__option-result">
              {{ formatOptionPercentage(option) }}%
            </span>
            <span
              v-else
              class="moment-vote__option-check"
              :class="choiceCount === 1 ? 'is-radio' : ''"
              aria-hidden="true"
            />
          </span>
        </button>
      </div>
      <footer class="moment-vote__meta">
        <span>
          {{ t('moments.vote_participants', { count: voteInfo.total }) }}
          <template v-if="deadlineText"> · {{ deadlineText }}</template>
        </span>
        <span>{{ isEnded ? t('moments.vote_ended') : isVoted ? t('moments.vote_submitted') : t('moments.vote_ongoing') }}</span>
      </footer>
      <button
        v-if="!showResults"
        type="button"
        class="moment-vote__submit"
        :disabled="!selectedVotes.length || isSubmitting"
        :aria-busy="isSubmitting || undefined"
        @click="submitVote"
      >
        <span v-if="isSubmitting" i-svg-spinners:ring-resize aria-hidden="true" />
        <span v-else>{{ t('moments.vote_submit') }}</span>
      </button>
    </template>
  </section>
</template>

<style scoped lang="scss">
.moment-vote {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-3);
  margin: 0 var(--bew-space-4) var(--bew-space-3);
  padding: var(--bew-space-4);
  border-radius: var(--bew-card-radius);
  background: var(--bew-fill-1);
  cursor: default;
}

.moment-vote__header {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--bew-space-1);
}

.moment-vote__header strong {
  color: var(--bew-text-1);
  font-size: var(--bew-font-size-body);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-title);
  word-break: break-word;
}

.moment-vote__header small,
.moment-vote__hint {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.moment-vote__loading,
.moment-vote__options {
  display: flex;
  flex-direction: column;
  gap: var(--bew-space-2);
}

.moment-vote__options--image {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bew-space-3);
}

.moment-vote__loading span {
  height: 36px;
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-2);
  animation: moment-vote-pulse 1.2s ease-in-out infinite alternate;
}

.moment-vote__option {
  position: relative;
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: var(--bew-space-2);
  padding: var(--bew-space-2) var(--bew-space-3);
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-text-1);
  background: var(--bew-bg);
  box-sizing: border-box;
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  text-align: left;
  transition:
    border-color var(--bew-duration-normal) var(--bew-ease-standard),
    background-color var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-vote__option:hover:not(:disabled),
.moment-vote__option.is-selected:not(.is-result) {
  border-color: var(--bew-theme-color);
  background: var(--bew-theme-color-10);
}

.moment-vote__option.is-result {
  background: var(--bew-bg);
}

.moment-vote__option.is-result.is-selected,
.moment-vote__option.is-result.is-selected .moment-vote__option-result {
  color: var(--bew-theme-color);
}

.moment-vote__option:focus-visible,
.moment-vote__submit:focus-visible,
.moment-vote__error button:focus-visible {
  outline: 2px solid var(--bew-theme-color);
  outline-offset: 2px;
}

.moment-vote__option:disabled {
  cursor: default;
  opacity: 1;
}

.moment-vote__option-body {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: var(--bew-space-2);
}

.moment-vote__options--image .moment-vote__option {
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 0;
}

.moment-vote__option-image {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  aspect-ratio: 4 / 3;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--bew-interactive-radius) var(--bew-interactive-radius) 0 0;
  color: var(--bew-text-3);
  background: var(--bew-fill-2);
  font-size: var(--bew-icon-size-lg);
}

.moment-vote__option-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-vote__options--image .moment-vote__option-body {
  width: 100%;
  min-height: 40px;
  flex: none;
  padding: var(--bew-space-2) var(--bew-space-3);
  box-sizing: border-box;
}

.moment-vote__option-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--bew-fill-2);
  transition: width var(--bew-duration-normal) var(--bew-ease-standard);
}

.moment-vote__option.is-max-result .moment-vote__option-fill {
  background: var(--bew-theme-color-20);
}

.moment-vote__option.is-max-result .moment-vote__option-result {
  color: var(--bew-theme-color);
}

.moment-vote__option-text,
.moment-vote__option-result,
.moment-vote__option-selected,
.moment-vote__option-check {
  position: relative;
  z-index: 1;
}

.moment-vote__option-text {
  min-width: 0;
  flex: 1;
  word-break: break-word;
}

.moment-vote__option-result {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
  font-weight: var(--bew-font-weight-semibold);
}

.moment-vote__option-selected {
  color: var(--bew-theme-color);
  font-size: var(--bew-icon-size-sm);
  flex: none;
}

.moment-vote__option-check {
  width: 16px;
  height: 16px;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius-sm);
  background: var(--bew-bg);
  box-sizing: border-box;
}

.moment-vote__option-check.is-radio {
  border-radius: 50%;
}

.moment-vote__option.is-selected .moment-vote__option-check {
  border: 4px solid var(--bew-theme-color);
}

.moment-vote__meta {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bew-space-3);
  color: var(--bew-text-3);
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
}

.moment-vote__meta > :first-child {
  min-width: 0;
}

.moment-vote__meta > :last-child {
  flex: none;
}

.moment-vote__submit {
  min-height: 34px;
  padding: var(--bew-space-2) var(--bew-space-4);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: white;
  background: var(--bew-theme-color);
  cursor: pointer;
  font: inherit;
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-semibold);
  line-height: var(--bew-line-height-control);
}

.moment-vote__submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.moment-vote__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-caption);
}

.moment-vote__error button {
  min-height: 28px;
  padding: var(--bew-space-1) var(--bew-space-3);
  border: 0;
  border-radius: var(--bew-interactive-radius);
  color: var(--bew-theme-color);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: var(--bew-font-weight-semibold);
}

@keyframes moment-vote-pulse {
  from {
    opacity: 0.55;
  }

  to {
    opacity: 1;
  }
}
</style>
