<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import type { ApiErrorReport, ApiErrorReportSource } from '~/utils/apiDiagnostics'
import { buildApiErrorReport } from '~/utils/apiDiagnostics'

const props = defineProps<{
  source: ApiErrorReportSource
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const toast = useToast()
const dialogRef = ref<{ close: () => void }>()
const report = ref<ApiErrorReport>()

onMounted(async () => {
  report.value = await buildApiErrorReport(props.source)
})

async function copyReport() {
  if (!report.value)
    return

  try {
    await navigator.clipboard.writeText(report.value.text)
    toast.success(t('common.api_error.copied'))
  }
  catch {
    toast.error(t('common.api_error.copy_failed'))
  }
}
</script>

<template>
  <Dialog
    ref="dialogRef"
    width="720px"
    max-width="calc(100vw - 32px)"
    append-to-bewly-body
    :show-footer="false"
    :close-on-confirm="false"
    :title="$t('common.api_error.title')"
    :desc="$t('common.api_error.desc')"
    @confirm="copyReport"
    @close="emit('close')"
  >
    <p v-if="report?.likelyRiskControl" class="api-error-note api-error-note--risk">
      {{ $t('common.api_error.risk_hint') }}
    </p>
    <p v-else-if="report && !report.hasRequestRecords" class="api-error-note">
      {{ $t('common.api_error.no_records') }}
    </p>
    <pre class="api-error-report" tabindex="0">{{ report?.text ?? $t('common.loading') }}</pre>
    <div class="api-error-actions">
      <Button type="tertiary" @click="dialogRef?.close()">
        {{ $t('common.operation.close') }}
      </Button>
      <Button type="primary" :disabled="!report" @click="copyReport">
        <template #left>
          <span i-mingcute:copy-2-line aria-hidden="true" />
        </template>
        {{ $t('common.api_error.copy') }}
      </Button>
    </div>
  </Dialog>
</template>

<style lang="scss" scoped>
.api-error-note {
  margin: 0 0 var(--bew-space-3);
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
  line-height: var(--bew-line-height-control);
}

.api-error-note--risk {
  padding: var(--bew-space-2) var(--bew-space-3);
  color: var(--bew-text-1);
  background: var(--bew-warning-color-20);
  border-radius: var(--bew-interactive-radius);
}

.api-error-report {
  box-sizing: border-box;
  max-height: min(56vh, 520px);
  margin: 0;
  padding: var(--bew-space-3);
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--bew-text-1);
  background: var(--bew-fill-1);
  border-radius: var(--bew-interactive-radius);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--bew-font-size-caption);
  line-height: var(--bew-line-height-caption);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.api-error-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--bew-space-2);
  margin-top: var(--bew-space-4);
}
</style>
