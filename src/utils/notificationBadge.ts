import type { UnReadDm, UnReadMessage } from '~/components/TopBar/types'
import type { Settings } from '~/logic/storage'

export type NotificationBadgeSettings = Pick<Settings, | 'showReplyNotificationReminder'
  | 'showAtNotificationReminder'
  | 'showLikeNotificationReminder'
  | 'showSystemNotificationReminder'
  | 'showFollowedPrivateMessageUnreadCount'
  | 'showUnfollowedPrivateMessageUnreadCount'>

export function getNotificationBadgeCounts(
  settings: NotificationBadgeSettings,
  message: Partial<UnReadMessage> = {},
  dm: Partial<UnReadDm> = {},
) {
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
  return {
    reply: settings.showReplyNotificationReminder ? count(message.reply) : 0,
    at: settings.showAtNotificationReminder ? count(message.at) : 0,
    like: settings.showLikeNotificationReminder ? Math.max(count(message.like), count(message.recv_like)) : 0,
    sys_msg: settings.showSystemNotificationReminder ? count(message.sys_msg) : 0,
    follow_unread: settings.showFollowedPrivateMessageUnreadCount ? count(dm.follow_unread) : 0,
    unfollow_unread: settings.showUnfollowedPrivateMessageUnreadCount ? count(dm.unfollow_unread) : 0,
  }
}
