import type { FavoriteOrganizerRule } from '~/logic'
import { getZoneName } from '~/utils/favoriteOrganizer'

type Translate = (key: string, named?: Record<string, unknown>) => string

interface RuleSummaryPart {
  label: string
  value: string
}

export function getRuleSummaryParts(rule: FavoriteOrganizerRule, t: Translate): RuleSummaryPart[] {
  const separator = t('settings.favorite_organizer.value_separator')
  return [
    { label: t('settings.favorite_organizer.up'), values: rule.ups.map(up => up.name || up.mid) },
    { label: t('settings.favorite_organizer.zone'), values: rule.zones.map(getZoneName) },
    { label: t('settings.favorite_organizer.title_keyword'), values: rule.titleKeywords },
  ]
    .filter(part => part.values.length)
    .map(part => ({ label: part.label, value: part.values.join(separator) }))
}

/** 单行文本形式，用于提示信息 */
export function formatRuleSummary(rule: FavoriteOrganizerRule, t: Translate): string {
  return getRuleSummaryParts(rule, t)
    .map(part => t('settings.favorite_organizer.summary_part', { label: part.label, value: part.value }))
    .join(t('settings.favorite_organizer.part_separator'))
}
