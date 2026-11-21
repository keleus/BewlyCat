import type {
  AccountAddByCookiePayload,
  AccountLoginStartPayload,
  AccountRenamePayload,
  AccountSwitchPayload,
} from '~/constants/accountSwitcher'
import { ACCOUNT_SWITCHER_MESSAGE } from '~/constants/accountSwitcher'
import { onMessage } from '~/utils/messaging'

import {
  addAccountByCookie,
  cancelAccountLogin,
  listAccounts,
  pollAccountLogin,
  removeAccount,
  renameAccount,
  startAccountLogin,
  switchAccount,
} from '../accountSwitcher'

export function setupAccountSwitcherMessages(): void {
  onMessage(ACCOUNT_SWITCHER_MESSAGE.LIST, (_data, sender) => listAccounts(sender?.tab?.id))

  onMessage<AccountSwitchPayload>(ACCOUNT_SWITCHER_MESSAGE.SWITCH, data =>
    switchAccount(data?.id ?? ''))

  onMessage<AccountLoginStartPayload>(ACCOUNT_SWITCHER_MESSAGE.LOGIN_START, (data, sender) =>
    startAccountLogin(data, sender?.tab?.id))

  onMessage(ACCOUNT_SWITCHER_MESSAGE.LOGIN_POLL, () => pollAccountLogin())

  onMessage(ACCOUNT_SWITCHER_MESSAGE.LOGIN_CANCEL, () => cancelAccountLogin())

  onMessage<AccountAddByCookiePayload>(ACCOUNT_SWITCHER_MESSAGE.ADD_BY_COOKIE, data =>
    addAccountByCookie({ cookieString: data?.cookieString ?? '' }))

  onMessage<AccountRenamePayload>(ACCOUNT_SWITCHER_MESSAGE.RENAME, data =>
    renameAccount({ id: data?.id ?? '', alias: data?.alias ?? '' }))

  onMessage<{ id: string }>(ACCOUNT_SWITCHER_MESSAGE.REMOVE, data =>
    removeAccount(data?.id ?? ''))
}
