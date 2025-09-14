import { sendMessage } from 'webext-bridge/content-script'

import { TABS_MESSAGE } from '~/background/messageListeners/tabs'

export async function openLinkInBackground(url: string) {
  try {
    await sendMessage(TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND, {
      contentScriptQuery: TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND,
      url,
    }, 'background')
  }
  catch (error) {
    console.error('Failed to open link in background:', error)
  }
}
