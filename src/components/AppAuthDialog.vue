<script setup lang="ts">
import QRCodeVue from 'qrcode.vue'
import { useToast } from 'vue-toastification'

import { getHDLoginQRCode, pollHDLoginQRCode, saveAppAuthTokens } from '~/utils/authProvider'

const emit = defineEmits<{
  (event: 'authorized'): void
}>()

const showDialog = defineModel<boolean>({ required: true })

const toast = useToast()
const loginQRCodeUrl = ref('')
const authCode = ref('')
const qrcodeMsg = ref('')
let pollTimer: ReturnType<typeof setInterval> | undefined

function stopPolling() {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

async function setLoginQRCode() {
  loginQRCodeUrl.value = ''
  qrcodeMsg.value = ''

  const response = await getHDLoginQRCode()
  if (response.code !== 0) {
    qrcodeMsg.value = response.message
    toast.error(response.message)
    return false
  }

  loginQRCodeUrl.value = response.data.url
  authCode.value = response.data.auth_code
  return true
}

async function pollLoginQRCode() {
  if (!authCode.value)
    return

  const response = await pollHDLoginQRCode(authCode.value)
  if (response.code !== 0)
    qrcodeMsg.value = response.message

  if (response.code === 0) {
    saveAppAuthTokens(response.data)
    stopPolling()
    showDialog.value = false
    toast.success('授权成功')
    emit('authorized')
  }
  else if (response.code === 86038) {
    await refreshLoginQRCode()
  }
  else if (response.code === -3 || response.code === -400 || response.code === -404) {
    toast.error(response.message)
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    void pollLoginQRCode()
  }, 3000)
}

async function refreshLoginQRCode() {
  const ready = await setLoginQRCode()
  if (ready)
    startPolling()
}

function closeDialog() {
  stopPolling()
  showDialog.value = false
}

onMounted(() => {
  void refreshLoginQRCode()
})

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
    @close="closeDialog"
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

      <Button type="secondary" @click="refreshLoginQRCode">
        {{ $t('common.operation.refresh') }}
      </Button>
    </div>
  </Dialog>
</template>
