<script setup lang="ts">
import QRCodeVue from 'qrcode.vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

import { getTVLoginQRCode, pollTVLoginQRCode, saveAppAuthTokens } from '~/utils/authProvider'

const emit = defineEmits<{
  (event: 'authorized'): void
  (event: 'close'): void
}>()

const { t } = useI18n()
const toast = useToast()
const loginQRCodeUrl = ref<string>()
const authCode = ref('')
const qrcodeMsg = ref('')
const pollLoginQRCodeInterval = ref<ReturnType<typeof setInterval> | null>(null)

function stopPolling() {
  if (pollLoginQRCodeInterval.value !== null)
    clearInterval(pollLoginQRCodeInterval.value)
  pollLoginQRCodeInterval.value = null
}

function handleClose() {
  stopPolling()
  emit('close')
}

async function setLoginQRCode() {
  qrcodeMsg.value = ''
  const res = await getTVLoginQRCode()
  if (res.code === 0) {
    loginQRCodeUrl.value = res.data.url
    authCode.value = res.data.auth_code
  }
  else {
    qrcodeMsg.value = res.message
  }
}

function pollLoginQRCode() {
  stopPolling()

  pollLoginQRCodeInterval.value = setInterval(async () => {
    const pollRes = await pollTVLoginQRCode(authCode.value)

    // 0：成功；86038：二维码已失效；86039：未确认；86090：已扫码未确认。
    if (pollRes.code !== 0)
      qrcodeMsg.value = pollRes.message

    if (pollRes.code === 0) {
      stopPolling()
      saveAppAuthTokens(pollRes.data)
      toast.success(t('settings.authorization_success'))
      emit('authorized')
      emit('close')
    }
    else if (pollRes.code === 86038) {
      await setLoginQRCode()
    }
    else if (pollRes.code === -3 || pollRes.code === -400 || pollRes.code === -404) {
      toast.error(pollRes.message)
    }
  }, 3000)
}

onMounted(async () => {
  try {
    await setLoginQRCode()
    pollLoginQRCode()
  }
  catch (error) {
    console.error(error)
  }
})

onDeactivated(stopPolling)
onBeforeUnmount(stopPolling)
</script>

<template>
  <Dialog
    width="50%"
    max-width="800px"
    append-to-bewly-body
    :show-footer="false"
    :title="$t('settings.authorize_app')"
    center
    @close="handleClose"
  >
    <div flex="~ col gap-4 items-center">
      <div>
        <p mb-2 text-center>
          {{ $t('settings.scan_qrcode_desc') }}
        </p>
        <p text="$bew-text-2 sm">
          {{ $t('settings.authorize_app_desc') }}
        </p>
      </div>

      <div bg-white border="white 4">
        <QRCodeVue v-if="loginQRCodeUrl" :value="loginQRCodeUrl" :size="150" />
        <div v-else w-150px h-150px grid="~ place-items-center">
          <div i-svg-spinners:ring-resize />
        </div>
      </div>

      <p>{{ qrcodeMsg }}</p>

      <Button type="secondary" @click="setLoginQRCode">
        {{ $t('common.operation.refresh') }}
      </Button>
    </div>
  </Dialog>
</template>
