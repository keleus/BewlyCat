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
let pollLoginQRCodeTimer: ReturnType<typeof setTimeout> | undefined
let authorizationController: AbortController | undefined
let active = false

function stopPolling() {
  clearTimeout(pollLoginQRCodeTimer)
  pollLoginQRCodeTimer = undefined
  authorizationController?.abort()
  authorizationController = undefined
}

function deactivate() {
  active = false
  stopPolling()
}

function handleClose() {
  deactivate()
  emit('close')
}

function isCurrentAuthorization(controller: AbortController) {
  return active && authorizationController === controller && !controller.signal.aborted
}

function schedulePolling(controller: AbortController) {
  if (!isCurrentAuthorization(controller))
    return

  pollLoginQRCodeTimer = setTimeout(() => {
    pollLoginQRCodeTimer = undefined
    void pollLoginQRCode(controller)
  }, 3000)
}

async function setLoginQRCode() {
  if (!active)
    return

  // 刷新二维码同时取消旧请求，旧二维码的迟到响应不能继续登录或启动轮询。
  stopPolling()
  const controller = new AbortController()
  authorizationController = controller
  loginQRCodeUrl.value = undefined
  authCode.value = ''
  qrcodeMsg.value = ''
  try {
    const res = await getTVLoginQRCode(controller.signal)
    if (!isCurrentAuthorization(controller))
      return

    if (res.code === 0) {
      loginQRCodeUrl.value = res.data.url
      authCode.value = res.data.auth_code
      schedulePolling(controller)
    }
    else {
      qrcodeMsg.value = res.message
    }
  }
  catch (error) {
    if (!isCurrentAuthorization(controller))
      return
    qrcodeMsg.value = error instanceof Error ? error.message : String(error)
    console.error(error)
  }
}

async function pollLoginQRCode(controller: AbortController) {
  if (!isCurrentAuthorization(controller))
    return

  try {
    const pollRes = await pollTVLoginQRCode(authCode.value, controller.signal)
    if (!isCurrentAuthorization(controller))
      return

    // 0：成功；86038：二维码已失效；86039：未确认；86090：已扫码未确认。
    if (pollRes.code !== 0)
      qrcodeMsg.value = pollRes.message

    if (pollRes.code === 0) {
      deactivate()
      saveAppAuthTokens(pollRes.data)
      toast.success(t('settings.authorization_success'))
      emit('authorized')
      emit('close')
    }
    else if (pollRes.code === 86038) {
      await setLoginQRCode()
    }
    else if (pollRes.code === -3 || pollRes.code === -400 || pollRes.code === -404) {
      stopPolling()
      toast.error(pollRes.message)
    }
  }
  catch (error) {
    if (!isCurrentAuthorization(controller))
      return
    qrcodeMsg.value = error instanceof Error ? error.message : String(error)
    console.error(error)
  }
  finally {
    // 上一轮完成后才安排下一轮，慢请求不会积压；关闭后也不会重新启动。
    schedulePolling(controller)
  }
}

function activate() {
  if (active)
    return
  active = true
  void setLoginQRCode()
}

onMounted(activate)
onActivated(activate)
onDeactivated(deactivate)
onBeforeUnmount(deactivate)
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
