import { TABS_MESSAGE } from '~/background/messageListeners/tabs'
import { sendMessage } from '~/utils/messaging'

export async function openLinkInBackground(url: string) {
  try {
    await sendMessage(TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND, {
      contentScriptQuery: TABS_MESSAGE.OPEN_LINK_IN_BACKGROUND,
      url,
    })
  }
  catch (error) {
    console.error('Failed to open link in background:', error)
  }
}
