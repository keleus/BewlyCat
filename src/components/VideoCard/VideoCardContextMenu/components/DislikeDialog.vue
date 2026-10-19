<script lang="ts" setup>
import { onKeyStroke } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import Icon from '~/components/Icon.vue'
import type { Video } from '~/components/VideoCard/types'
import { appAuthTokens } from '~/logic'
import type { DislikeReason } from '~/models/video/appForYou'
import { Type as ThreePointV2Type } from '~/models/video/appForYou'
import { ensureFreshAppAccessToken, requestAppClient } from '~/utils/authProvider'

const props = defineProps<{
  modelValue: boolean
  video: Video
}>()

const emit = defineEmits<{
  (event: 'removed'): void
  (event: 'close'): void
}>()

const showDislikeDialog = defineModel<boolean>()

const toast = useToast()
const { t } = useI18n()

const loadingDislikeDialog = ref<boolean>(false)
type FeedFeedbackType = ThreePointV2Type.Dislike | ThreePointV2Type.Feedback
interface SelectableReason {
  type: FeedFeedbackType
  reason: DislikeReason
}

// 同类原因（如多个「频道:xxx」）的 id 相同，只能用在列表中的位置标识选中项
const selectedIndex = ref<number>(0)

const dislikeReasons = computed(() => props.video?.threePointV2?.find(option => option.type === ThreePointV2Type.Dislike)?.reasons || [])
const feedbackReasons = computed(() => props.video?.threePointV2?.find(option => option.type === ThreePointV2Type.Feedback)?.reasons || [])
const toSelectableReason = (type: FeedFeedbackType) => (reason: DislikeReason): SelectableReason => ({ type, reason })
const selectableOptions = computed<SelectableReason[]>(() => [
  ...dislikeReasons.value.map(toSelectableReason(ThreePointV2Type.Dislike)),
  ...feedbackReasons.value.map(toSelectableReason(ThreePointV2Type.Feedback)),
])

watch(selectableOptions, () => {
  selectedIndex.value = 0
})

function selectOption(index: number) {
  if (index >= 0 && index < selectableOptions.value.length)
    selectedIndex.value = index
}

function getSelectedPayload(): Record<string, number | undefined> | undefined {
  const option = selectableOptions.value[selectedIndex.value]
  if (!option)
    return undefined

  const { id, mid, rid, tag_id } = option.reason
  return option.type === ThreePointV2Type.Feedback
    ? { feedback_id: id }
    : { reason_id: id, mid, rid, tag_id }
}

function closeDislikeDialog() {
  showDislikeDialog.value = false
  emit('close')
}

async function handleAppDislike() {
  if (!appAuthTokens.value.accessToken) {
    toast.warning(t('auth.auth_access_key_first'))
    return
  }

  const selectedPayload = getSelectedPayload()
  if (!selectedPayload) {
    toast.warning(t('video_card.feedback_options_unavailable'))
    return
  }

  loadingDislikeDialog.value = true
  try {
    if (!await ensureFreshAppAccessToken()) {
      toast.warning(t('auth.auth_access_key_first'))
      return
    }

    // App feed 的 reason_id / feedback_id 来自 three_point_v2，含义与 Web
    // dislike 的固定 reason_id 不一致，必须继续走 access key 签名的 App 接口。
    // 基础参数与 PiliPlus 的 feedDislike 一致；同 id 的原因额外带上 mid / rid / tag_id 区分具体对象
    const res = await requestAppClient('feedDislike', {
      access_key: appAuthTokens.value.accessToken,
      goto: props.video?.goto,
      id: props.video?.param || props.video?.id,
      ...selectedPayload,
      build: 1,
      mobi_app: 'android',
    })
    if (res.code === 0)
      emit('removed')
    else
      toast.error(res.message)
  }
  finally {
    loadingDislikeDialog.value = false
  }
}

onKeyStroke((e: KeyboardEvent) => {
  if (!showDislikeDialog.value)
    return

  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    selectOption(Number(e.key) - 1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectOption(selectedIndex.value - 1)
  }
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectOption(selectedIndex.value + 1)
  }
})
</script>

<template>
  <Dialog
    v-if="showDislikeDialog"
    :title="$t('home.tell_us_why')"
    width="420px"
    append-to-bewly-body
    :loading="loadingDislikeDialog"
    @close="closeDislikeDialog"
    @confirm="handleAppDislike"
  >
    <ul v-if="dislikeReasons.length > 0" flex="~ col gap-2">
      <li
        v-for="(reason, index) in dislikeReasons"
        :key="index"
        :class="{ 'activated-dislike-reason': selectedIndex === index }"
        p="x-6 y-4" rounded="$bew-radius" cursor-pointer bg="$bew-fill-1 hover:$bew-fill-2"
        flex="~ gap-2 items-center justify-between"
        @click="selectOption(index)"
      >
        <div flex="~ gap-2">
          <div
            bg="$bew-theme-color" color-white w-20px h-20px rounded-10
            flex="~ justify-center items-center"
          >
            {{ index + 1 }}
          </div>
          {{ reason.name }}
        </div>
        <Icon
          v-if="selectedIndex === index" icon="line-md:confirm"
          w-18px h-18px
        />
      </li>
    </ul>
    <template v-if="feedbackReasons.length > 0">
      <div v-if="dislikeReasons.length > 0" class="divider" />
      <ul flex="~ col gap-2">
        <li
          v-for="(reason, index) in feedbackReasons"
          :key="index"
          :class="{ 'activated-dislike-reason': selectedIndex === dislikeReasons.length + index }"
          p="x-6 y-4" rounded="$bew-radius" cursor-pointer bg="$bew-fill-1 hover:$bew-fill-2"
          flex="~ gap-2 items-center justify-between"
          @click="selectOption(dislikeReasons.length + index)"
        >
          <div flex="~ gap-2">
            <div
              bg="$bew-theme-color" color-white w-20px h-20px rounded-10
              flex="~ justify-center items-center"
            >
              {{ dislikeReasons.length + index + 1 }}
            </div>
            {{ reason.name }}
          </div>
          <Icon
            v-if="selectedIndex === dislikeReasons.length + index" icon="line-md:confirm"
            w-18px h-18px
          />
        </li>
      </ul>
    </template>
    <p text="$bew-text-3 sm" mt-4 v-html="$t('home.not_interested_desc')" />
  </Dialog>
</template>

<style lang="scss" scoped>
.activated-dislike-reason {
  --uno: "bg-$bew-theme-color-20 color-$bew-theme-color";
}

.divider {
  height: 1px;
  margin: 12px 0;
  background: var(--bew-border-color);
}
</style>
