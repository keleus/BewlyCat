import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'

import { LanguageType } from './../enums/appEnums'

export const { t } = i18n.global

export function parseStatNumber(value?: number | string | null): number | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined

  if (typeof value !== 'string')
    return undefined

  const trimmed = value.trim()
  if (!trimmed || trimmed === '-' || trimmed === '--')
    return undefined

  let normalized = trimmed.replace(/,/g, '').toLowerCase()
  let multiplier = 1

  if (/[亿億]/.test(normalized)) {
    multiplier *= 1e8
    normalized = normalized.replace(/[亿億]/g, '')
  }

  if (/[万萬]/.test(normalized)) {
    multiplier *= 1e4
    normalized = normalized.replace(/[万萬]/g, '')
  }

  normalized = normalized.replace(/[^0-9.]/g, '')
  if (!normalized)
    return undefined

  const numeric = Number(normalized)
  if (Number.isNaN(numeric))
    return undefined

  return numeric * multiplier
}

export function numFormatter(num: number | string): string {
  const digits = 1 // specify number of digits after decimal
  let lookup

  if (settings.value.language === LanguageType.Mandarin_CN) {
    lookup = [
      { value: 1, symbol: ' ' },
      { value: 1e4, symbol: ' 万' },
      { value: 1e7, symbol: ' 千万' },
      { value: 1e8, symbol: ' 亿' },
    ]
  }
  else if (settings.value.language === LanguageType.Cantonese || settings.value.language === LanguageType.Mandarin_TW) {
    lookup = [
      { value: 1, symbol: ' ' },
      { value: 1e4, symbol: ' 萬' },
      { value: 1e7, symbol: ' 千萬' },
      { value: 1e8, symbol: ' 億' },
    ]
  }
  else {
    lookup = [
      { value: 1, symbol: '' },
      { value: 1e3, symbol: 'K' },
      { value: 1e6, symbol: 'M' },
      { value: 1e9, symbol: 'B' },
    ]
  }
  const rx = /\.0+$|(\.\d*[1-9])0+$/
  if (typeof num === 'string') {
    const parsed = parseStatNumber(num)
    num = typeof parsed === 'number' ? parsed : Number(num)
  }
  const item = lookup.slice().reverse().find((item) => {
    return num >= item.value
  })
  return item ? (num / item.value).toFixed(digits).replace(rx, '$1') + item.symbol : '0'
}

export function calcTimeSince(date: number | string | Date) {
  const now = new Date()
  const targetDate = new Date(date)
  const diffMs = now.getTime() - targetDate.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  // 获取今天和目标日期的日期部分（忽略时间）
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
  const daysDiff = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))

  if (daysDiff === 0) {
    // 当天
    if (diffSeconds < 60) {
      return t('common.just_now')
    }
    const minutes = Math.floor(diffSeconds / 60)
    if (minutes < 60) {
      return `${minutes} ${t('common.minute', minutes)}`
    }
    const hours = Math.floor(diffSeconds / 3600)
    return `${hours} ${t('common.hour', hours)}`
  }
  else if (daysDiff === 1) {
    // 昨天
    return t('common.yesterday')
  }
  else {
    // 显示具体日期
    const year = targetDate.getFullYear()
    const month = targetDate.getMonth() + 1
    const day = targetDate.getDate()

    // 如果是同一年，只显示月日
    if (year === now.getFullYear()) {
      return `${month}-${day}`
    }
    else {
      return `${year}-${month}-${day}`
    }
  }
}

export function calcCurrentTime(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  totalSeconds %= 3600
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (hours <= 0)
    return `${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`

  return `${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`
}
