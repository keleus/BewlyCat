import { useToast } from 'vue-toastification'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import { syncVideoToMatchedFolders } from '~/utils/favoriteOrganizer'
import { i18n } from '~/utils/i18n'
import { extractVideoIds } from '~/utils/watchLaterButton'

// B 站三连写入收藏后，收藏夹状态接口偶尔有短暂延迟。
const SYNC_DELAY = 1000

export function setupFavoriteOrganizerTripleSync() {
  const pending = new Set<string>()

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'BEWLY_VIDEO_TRIPLE')
      return
    if (!settings.value.favoriteOrganizerSyncAfterTriple || !settings.value.favoriteOrganizerFolders.length)
      return

    const aid = Number(event.data.aid) || undefined
    const bvid = typeof event.data.bvid === 'string' ? event.data.bvid : undefined
    // 请求体不可读时退回当前地址里的视频标识。
    const target = aid || bvid ? { aid, bvid } : extractVideoIds(location.href)
    const key = String(target.aid || target.bvid || '')
    if (!key || pending.has(key))
      return

    pending.add(key)
    window.setTimeout(() => {
      syncVideoToMatchedFolders(target)
        .then((titles) => {
          if (!titles.length)
            return
          useToast().success(i18n.global.t('settings.favorite_organizer.triple_synced', { folders: titles.join('、') }))
          void useTopBarStore().notifyFavoritesChanged().catch((error) => {
            console.error('通知顶栏收藏状态变化失败:', error)
          })
        })
        .catch((error) => {
          console.error('三连后同步收藏夹失败:', error)
          useToast().error(i18n.global.t('settings.favorite_organizer.triple_sync_failed'))
        })
        .finally(() => pending.delete(key))
    }, SYNC_DELAY)
  })
}
