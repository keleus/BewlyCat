import type { InjectionKey } from 'vue'
import { inject } from 'vue'

export interface ConfirmDialogService {
  confirm: (message: string) => Promise<boolean>
}

export const confirmDialogKey: InjectionKey<ConfirmDialogService> = Symbol('CONFIRM_DIALOG')

export function useConfirmDialog(): ConfirmDialogService {
  const service = inject(confirmDialogKey)

  if (!service)
    throw new Error('ConfirmDialog service is not provided')

  return service
}
