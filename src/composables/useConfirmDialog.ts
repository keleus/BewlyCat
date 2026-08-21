import type { InjectionKey } from 'vue'
import { inject } from 'vue'

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

export const confirmDialogKey: InjectionKey<ConfirmDialogService> = Symbol('CONFIRM_DIALOG')

export function useConfirmDialog(): ConfirmDialogService {
  const service = inject(confirmDialogKey)

  if (!service)
    throw new Error('ConfirmDialog service is not provided')

  return service
}
