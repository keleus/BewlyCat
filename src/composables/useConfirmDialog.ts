import { onKeyStroke } from '@vueuse/core'
import type { InjectionKey } from 'vue'
import { inject, nextTick, provide, ref } from 'vue'

export interface ConfirmDialogToggleField {
  id: string
  label: string
  value: boolean
  enabledLabel?: string
  disabledLabel?: string
}

export interface ConfirmDialogOptions {
  title?: string
  confirmLabel?: string
  toggleFields?: ConfirmDialogToggleField[]
}

export interface ConfirmDialogService {
  confirm: (message: string, options?: ConfirmDialogOptions) => Promise<boolean>
}

export interface ConfirmDialogRequest {
  id: number
  message: string
  title?: string
  confirmLabel?: string
  toggleFields?: ConfirmDialogToggleField[]
  resolve: (confirmed: boolean) => void
  settled: boolean
}

export const confirmDialogKey: InjectionKey<ConfirmDialogService> = Symbol('CONFIRM_DIALOG')

export function useConfirmDialog(): ConfirmDialogService {
  const service = inject(confirmDialogKey)

  if (!service)
    throw new Error('ConfirmDialog service is not provided')

  return service
}

/**
 * Lightweight confirm host (no Dialog / Transition / Teleport).
 * Resolving the promise often mutates large page lists (favorites, history…);
 * doing that in the same tick as a Transition/Teleport teardown races Vue's
 * patcher and throws insertBefore NotFoundError under <App>.
 */
export function useConfirmDialogHost() {
  const activeConfirmDialog = ref<ConfirmDialogRequest>()
  const confirmDialogQueue: ConfirmDialogRequest[] = []
  let confirmDialogBusy = false
  let confirmDialogIdSeq = 0

  function showNextConfirmDialog() {
    activeConfirmDialog.value = confirmDialogQueue.shift()
  }

  function showConfirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      const request: ConfirmDialogRequest = {
        id: ++confirmDialogIdSeq,
        message,
        title: options.title,
        confirmLabel: options.confirmLabel,
        toggleFields: options.toggleFields,
        resolve,
        settled: false,
      }

      if (activeConfirmDialog.value || confirmDialogBusy)
        confirmDialogQueue.push(request)
      else
        activeConfirmDialog.value = request
    })
  }

  function finishConfirmDialog(confirmed: boolean) {
    const request = activeConfirmDialog.value
    if (!request || request.settled)
      return

    request.settled = true
    confirmDialogBusy = true
    // Unmount the overlay first; only then resolve so callers' DOM updates
    // (e.g. splicing favorite cards) never interleave with this node removal.
    activeConfirmDialog.value = undefined

    nextTick(() => {
      request.resolve(confirmed)
      confirmDialogBusy = false
      showNextConfirmDialog()
    })
  }

  onKeyStroke('Escape', (e: KeyboardEvent) => {
    if (!activeConfirmDialog.value)
      return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    finishConfirmDialog(false)
  }, { dedupe: true })

  onKeyStroke('Enter', (e: KeyboardEvent) => {
    if (!activeConfirmDialog.value)
      return
    const target = e.target as HTMLElement | null
    if (target?.closest('.bew-confirm-dialog__field'))
      return
    e.preventDefault()
    e.stopPropagation()
    finishConfirmDialog(true)
  }, { dedupe: true })

  provide(confirmDialogKey, {
    confirm: showConfirmDialog,
  })

  return {
    activeConfirmDialog,
    showConfirmDialog,
    finishConfirmDialog,
  }
}
