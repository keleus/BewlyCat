<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Radio from '~/components/Radio.vue'
import Select from '~/components/Select.vue'
import Slider from '~/components/Slider.vue'
import { settings } from '~/logic'
import type { CommentAiFilterDimension, CommentAiFilterDisplayMode } from '~/utils/commentAiFilter'
import {
  COMMENT_AI_FILTER_BATCH_SIZE_MAX,
  COMMENT_AI_FILTER_BATCH_SIZE_MIN,
} from '~/utils/commentAiFilter'
import { testCommentAiFilterConnection } from '~/utils/commentAiFilterClient'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'

const { t } = useI18n()

const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)

const displayModeOptions = computed<{ label: string; value: CommentAiFilterDisplayMode }[]>(() => [
  {
    label: t('settings.comment_ai_filter.display_mode.collapse'),
    value: 'collapse',
  },
  {
    label: t('settings.comment_ai_filter.display_mode.mark'),
    value: 'mark',
  },
  {
    label: t('settings.comment_ai_filter.display_mode.hide'),
    value: 'hide',
  },
])

interface DimensionOption {
  value: CommentAiFilterDimension
  label: string
  description: string
  icon: string
}

const dimensionOptions = computed<DimensionOption[]>(() => [
  {
    value: 'spam',
    label: t('settings.comment_ai_filter.dimensions.spam'),
    description: t('settings.comment_ai_filter.dimensions.spam_desc'),
    icon: 'i-tabler-ad-off',
  },
  {
    value: 'lowEffort',
    label: t('settings.comment_ai_filter.dimensions.low_effort'),
    description: t('settings.comment_ai_filter.dimensions.low_effort_desc'),
    icon: 'i-tabler-repeat',
  },
  {
    value: 'toxic',
    label: t('settings.comment_ai_filter.dimensions.toxic'),
    description: t('settings.comment_ai_filter.dimensions.toxic_desc'),
    icon: 'i-tabler-flame-off',
  },
  {
    value: 'spoilerOrBait',
    label: t('settings.comment_ai_filter.dimensions.spoiler_or_bait'),
    description: t('settings.comment_ai_filter.dimensions.spoiler_or_bait_desc'),
    icon: 'i-tabler-alert-triangle',
  },
  {
    value: 'aiSlop',
    label: t('settings.comment_ai_filter.dimensions.ai_slop'),
    description: t('settings.comment_ai_filter.dimensions.ai_slop_desc'),
    icon: 'i-tabler-robot-off',
  },
])

function hasDimension(dimension: CommentAiFilterDimension): boolean {
  return settings.value.commentAiFilterDimensions.includes(dimension)
}

function toggleDimension(dimension: CommentAiFilterDimension, enabled: boolean) {
  const current = new Set(settings.value.commentAiFilterDimensions)
  if (enabled) current.add(dimension)
  else current.delete(dimension)
  settings.value.commentAiFilterDimensions = Array.from(current)
}

async function runConnectionTest() {
  if (testing.value) return
  testing.value = true
  testResult.value = null

  try {
    const response = await testCommentAiFilterConnection({
      dimensions: settings.value.commentAiFilterDimensions,
      customPrompt: settings.value.commentAiFilterCustomPrompt,
    })

    if (response.ok) {
      testResult.value = {
        ok: true,
        message: t('settings.comment_ai_filter.test_success', {
          model: response.model,
          ms: response.latencyMs,
          flagged: response.flaggedCount,
        }),
      }
    } else {
      testResult.value = {
        ok: false,
        message: t('settings.comment_ai_filter.test_failed', {
          error: response.error,
        }),
      }
    }
  } catch (error) {
    testResult.value = {
      ok: false,
      message: t('settings.comment_ai_filter.test_failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <SettingsItemGroup
    :title="$t('settings.comment_ai_filter.group_title')"
    :desc="$t('settings.comment_ai_filter.group_desc')"
    icon="i-tabler-sparkles"
  >
    <SettingsItem
      :title="$t('settings.comment_ai_filter.enable')"
      :desc="$t('settings.comment_ai_filter.enable_desc')"
      right-width="auto"
    >
      <Radio v-model="settings.enableCommentAiFilter" />
    </SettingsItem>

    <template v-if="settings.enableCommentAiFilter">
      <SettingsItem
        :title="$t('settings.comment_ai_filter.auto_scan')"
        :desc="$t('settings.comment_ai_filter.auto_scan_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.commentAiFilterAutoScan" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.comment_ai_filter.include_replies')"
        :desc="$t('settings.comment_ai_filter.include_replies_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.commentAiFilterIncludeReplies" />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.comment_ai_filter.display_mode.title')"
        :desc="$t('settings.comment_ai_filter.display_mode.desc')"
        right-width="auto"
      >
        <Select
          v-model="settings.commentAiFilterDisplayMode"
          :options="displayModeOptions"
          w="260px"
        />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.comment_ai_filter.dimensions.title')"
        :desc="$t('settings.comment_ai_filter.dimensions.desc')"
        right-width="auto"
      >
        <template #bottom>
          <div
            class="ai-dimension-tags"
            role="group"
            :aria-label="$t('settings.comment_ai_filter.dimensions.title')"
          >
            <SettingsToggleTag
              v-for="option in dimensionOptions"
              :key="option.value"
              :model-value="hasDimension(option.value)"
              :label="option.label"
              :description="option.description"
              :icon="option.icon"
              :show-state-icon="false"
              @update:model-value="toggleDimension(option.value, $event)"
            />
          </div>
        </template>
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.comment_ai_filter.batch_size')"
        :desc="$t('settings.comment_ai_filter.batch_size_desc')"
        right-width="auto"
      >
        <div class="slider-control">
          <Slider
            v-model="settings.commentAiFilterBatchSize"
            :min="COMMENT_AI_FILTER_BATCH_SIZE_MIN"
            :max="COMMENT_AI_FILTER_BATCH_SIZE_MAX"
            editable
            :aria-label="$t('settings.comment_ai_filter.batch_size')"
          />
        </div>
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.comment_ai_filter.custom_prompt')"
        :desc="$t('settings.comment_ai_filter.custom_prompt_desc')"
        right-width="auto"
      >
        <template #bottom>
          <textarea
            v-model="settings.commentAiFilterCustomPrompt"
            class="custom-prompt-textarea"
            rows="3"
            :placeholder="$t('settings.comment_ai_filter.custom_prompt_placeholder')"
            :aria-label="$t('settings.comment_ai_filter.custom_prompt')"
          />
        </template>
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.comment_ai_filter.test_connection')"
        :desc="$t('settings.comment_ai_filter.test_connection_desc')"
        right-width="auto"
      >
        <Button type="secondary" size="small" :disabled="testing" @click="runConnectionTest">
          <template #left>
            <span v-if="testing" i-svg-spinners:ring-resize aria-hidden="true" />
            <span v-else i-tabler-plug-connected aria-hidden="true" />
          </template>
          {{
            testing
              ? $t('settings.comment_ai_filter.testing')
              : $t('settings.comment_ai_filter.test_btn')
          }}
        </Button>

        <template v-if="testResult" #bottom>
          <p class="test-result" :class="testResult.ok ? 'is-success' : 'is-error'" role="status">
            <span
              :class="testResult.ok ? 'i-tabler-circle-check' : 'i-tabler-alert-circle'"
              aria-hidden="true"
            />
            <span>{{ testResult.message }}</span>
          </p>
        </template>
      </SettingsItem>
    </template>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
.ai-dimension-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);
}

.slider-control {
  width: 260px;
}

.custom-prompt-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: var(--bew-space-2) var(--bew-space-3);
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-interactive-radius);
  background: var(--bew-fill-1);
  color: var(--bew-text-1);
  font-family: inherit;
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  resize: vertical;
  transition:
    border-color var(--bew-duration-fast) var(--bew-ease-standard),
    box-shadow var(--bew-duration-fast) var(--bew-ease-standard);

  &:focus {
    outline: none;
    border-color: var(--bew-theme-color);
    box-shadow: 0 0 0 2px var(--bew-theme-color-20);
  }
}

.test-result {
  display: flex;
  align-items: flex-start;
  gap: var(--bew-space-2);
  margin: 0;
  padding: var(--bew-space-2) var(--bew-space-3);
  border-radius: var(--bew-interactive-radius);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
  word-break: break-word;

  &.is-success {
    color: var(--bew-success-color);
    background: var(--bew-success-color-10);
  }

  &.is-error {
    color: var(--bew-error-color);
    background: var(--bew-error-color-10);
  }
}
</style>
