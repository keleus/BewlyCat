import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'
import type { Settings } from '~/logic/storage'

export type NotificationBadgeSettings = Pick<Settings, | 'showReplyNotificationReminder'
  | 'showAtNotificationReminder'
  | 'showLikeNotificationReminder'
  | 'showSystemNotificationReminder'
  | 'showFollowedPrivateMessageUnreadCount'
  | 'showUnfollowedPrivateMessageUnreadCount'>

export function getNotificationCounts(
  message: Partial<UnReadMessage> = {},
  dm: Partial<UnReadDm> = {},
) {
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
  return {
    reply: count(message.reply),
    at: count(message.at),
    like: Math.max(count(message.like), count(message.recv_like)),
    sys_msg: count(message.sys_msg),
    follow_unread: count(dm.follow_unread),
    unfollow_unread: count(dm.unfollow_unread),
  }
}

// 设置项只决定哪些类型计入顶栏图标总数，下拉列表仍显示各类型的实际未读数
export function getNotificationBadgeCounts(
  settings: NotificationBadgeSettings,
  message: Partial<UnReadMessage> = {},
  dm: Partial<UnReadDm> = {},
) {
  const counts = getNotificationCounts(message, dm)
  return {
    reply: settings.showReplyNotificationReminder ? counts.reply : 0,
    at: settings.showAtNotificationReminder ? counts.at : 0,
    like: settings.showLikeNotificationReminder ? counts.like : 0,
    sys_msg: settings.showSystemNotificationReminder ? counts.sys_msg : 0,
    follow_unread: settings.showFollowedPrivateMessageUnreadCount ? counts.follow_unread : 0,
    unfollow_unread: settings.showUnfollowedPrivateMessageUnreadCount ? counts.unfollow_unread : 0,
  }
}
