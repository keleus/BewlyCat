interface SettingsMigration {
  id: string
  legacyFields: string[]
  /** 设置项标题的 i18n key，例如 `settings.topbar_visibility` */
  titleKey: string
  resolveValue: (record: Record<string, unknown>) => boolean
  apply: (record: Record<string, unknown>, value: boolean) => void
}

type Translate = (key: string, values?: Record<string, unknown>) => unknown

export interface PendingSettingsMigrationChoice {
  id: string
  titleKey: string
  value: boolean
}

export type SettingsMigrationValueMap = Record<string, boolean>

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  {
    id: 'enableTopBar',
    legacyFields: ['showTopBar'],
    titleKey: 'settings.topbar_visibility',
    resolveValue(record) {
      if (typeof record.showTopBar !== 'boolean')
        return typeof record.enableTopBar === 'boolean' ? record.enableTopBar : true

      // 旧版关可见性 + 开原版 = 使用原版顶栏，不是隐藏全部顶栏。
      return record.showTopBar === false && record.useOriginalBilibiliTopBar === true
        ? true
        : record.showTopBar
    },
    apply(record, value) {
      record.enableTopBar = value
      Reflect.deleteProperty(record, 'showTopBar')
      Reflect.deleteProperty(record, 'independentTopBarVisibility')
    },
  },
]

function collectPendingSettingsMigrations(record: Record<string, unknown>): SettingsMigration[] {
  return SETTINGS_MIGRATIONS.filter(migration =>
    migration.legacyFields.some(field => hasOwn(record, field)),
  )
}

export function hasPendingSettingsMigrations(record: Record<string, unknown>): boolean {
  return collectPendingSettingsMigrations(record).length > 0
}

export function getPendingSettingsMigrationChoices(record: Record<string, unknown>): PendingSettingsMigrationChoice[] {
  return collectPendingSettingsMigrations(record).map(migration => ({
    id: migration.id,
    titleKey: migration.titleKey,
    value: migration.resolveValue(record),
  }))
}

export function getPendingSettingsMigrationTitleKeys(record: Record<string, unknown>): string[] {
  return collectPendingSettingsMigrations(record).map(migration => migration.titleKey)
}

export function formatSettingsMigrationConfirmMessage(
  record: Record<string, unknown>,
  t: Translate,
  templateKey: 'settings.maintenance.migrate_legacy_settings_confirm' | 'settings.maintenance.migrate_legacy_import_confirm',
): string | null {
  const titleKeys = getPendingSettingsMigrationTitleKeys(record)
  if (!titleKeys.length)
    return null

  const items = titleKeys
    .map(key => String(t('settings.maintenance.migrate_legacy_item', { name: String(t(key)) })))
    .join('\n')

  return String(t(templateKey, { items }))
}

export function applyPendingSettingsMigrations(
  record: Record<string, unknown>,
  values: SettingsMigrationValueMap = {},
): boolean {
  const pending = collectPendingSettingsMigrations(record)
  if (!pending.length)
    return false

  for (const migration of pending) {
    const selectedValue = values[migration.id]
    const value = hasOwn(values, migration.id) && typeof selectedValue === 'boolean'
      ? selectedValue
      : migration.resolveValue(record)
    migration.apply(record, value)
  }

  return true
}
