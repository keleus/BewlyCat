<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Button from '~/components/Button.vue'
import Input from '~/components/Input.vue'
import Select from '~/components/Select.vue'
import type { FavoriteOrganizerConditionValue } from '~/logic/storage'

const props = defineProps<{
  mode: 'text' | 'select'
  placeholder: string
  options?: readonly { value: string, label: string }[]
}>()

const modelValue = defineModel<FavoriteOrganizerConditionValue[]>({ required: true })
const { t } = useI18n()
const inputValue = ref('')
const selectedOption = ref('')

const selectOptions = computed(() => [
  { value: '', label: props.placeholder },
  ...(props.options ?? []).filter(option =>
    !modelValue.value.some(item => item.value === option.value),
  ),
])

function addValue(value: FavoriteOrganizerConditionValue) {
  const normalized = value.value.trim()
  if (!normalized)
    return

  const alreadyAdded = modelValue.value.some(item =>
    item.value.trim().toLocaleLowerCase() === normalized.toLocaleLowerCase(),
  )
  if (alreadyAdded)
    return

  modelValue.value = [...modelValue.value, { ...value, value: normalized }]
}

function addTextValue() {
  const value = inputValue.value.trim()
  if (!value)
    return

  addValue({ value, label: value })
  inputValue.value = ''
}

function selectValue(value: string) {
  if (!value)
    return

  const option = props.options?.find(item => item.value === value)
  addValue({ value, label: option?.label || value })
  selectedOption.value = ''
}

function removeValue(index: number) {
  modelValue.value = modelValue.value.filter((_, itemIndex) => itemIndex !== index)
}
</script>

<template>
  <div class="condition-value-picker">
    <div v-if="modelValue.length" class="condition-value-picker__chips">
      <span
        v-for="(item, index) in modelValue"
        :key="`${item.value}-${index}`"
        class="condition-value-picker__chip"
      >
        <span>{{ item.label || item.value }}</span>
        <button
          type="button"
          :aria-label="t('settings.favorite_organizer_remove_value', { value: item.label || item.value })"
          @click="removeValue(index)"
        >
          <i i-mingcute:close-line />
        </button>
      </span>
    </div>

    <Select
      v-if="mode === 'select'"
      :model-value="selectedOption"
      :options="selectOptions"
      class="condition-value-picker__select"
      @update:model-value="selectValue(String($event))"
    />
    <div v-else class="condition-value-picker__input-row">
      <Input
        v-model="inputValue"
        :placeholder="placeholder"
        class="condition-value-picker__input"
        @enter="addTextValue"
      />
      <Button
        type="secondary"
        class="condition-value-picker__add"
        :disabled="!inputValue.trim()"
        :aria-label="$t('settings.favorite_organizer_add_value')"
        :title="$t('settings.favorite_organizer_add_value')"
        @click="addTextValue"
      >
        <i i-mingcute:add-line />
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.condition-value-picker {
  display: grid;
  min-width: 0;
  gap: var(--bew-space-2);
}

.condition-value-picker__chips {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--bew-space-1);
}

.condition-value-picker__chip {
  display: inline-flex;
  min-width: 0;
  min-height: 28px;
  align-items: center;
  gap: var(--bew-space-1);
  padding-left: var(--bew-space-2);
  border-radius: var(--bew-badge-radius);
  color: var(--bew-text-1);
  background: var(--bew-fill-2);
  font-size: var(--bew-font-size-control);
  font-weight: var(--bew-font-weight-medium);
  line-height: var(--bew-line-height-control);
}

.condition-value-picker__chip > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-value-picker__chip > button {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  appearance: none;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--bew-badge-radius);
  color: var(--bew-text-2);
  background: transparent;
  cursor: pointer;
}

.condition-value-picker__chip > button:hover,
.condition-value-picker__chip > button:focus-visible {
  color: var(--bew-error-color);
  background: var(--bew-fill-3);
}

.condition-value-picker__chip > button:focus-visible {
  outline: 2px solid var(--bew-theme-color-40);
  outline-offset: var(--bew-space-0-5);
}

.condition-value-picker__input-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--bew-space-2);
}

.condition-value-picker__input,
.condition-value-picker__select {
  min-width: 0;
  flex: 1;
}

.condition-value-picker__add {
  --b-button-width: var(--bew-control-height);
  --b-button-padding: 0px;

  flex: 0 0 var(--bew-control-height);
  justify-content: center;
}
</style>
