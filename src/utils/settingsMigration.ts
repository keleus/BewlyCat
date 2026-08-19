interface SettingsMigration {
  id: string
  legacyFields: string[]
  /** 设置项标题的 i18n key，例如 `settings.topbar_visibility` */
  titleKey: string
  apply: (record: Record<string, unknown>) => void
}

type Translate = (key: string, values?: Record<string, unknown>) => unknown

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key)
}

const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  {
    id: 'enableTopBar',
    legacyFields: ['showTopBar'],
    titleKey: 'settings.topbar_visibility',
    apply(record) {
      if (typeof record.showTopBar === 'boolean') {
        // 旧版关可见性 + 开原版 = 使用原版顶栏，不是隐藏全部顶栏。
        record.enableTopBar = record.showTopBar === false && record.useOriginalBilibiliTopBar === true
          ? true
          : record.showTopBar
      }
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

export function applyPendingSettingsMigrations(record: Record<string, unknown>): boolean {
  const pending = collectPendingSettingsMigrations(record)
  if (!pending.length)
    return false

  for (const migration of pending)
    migration.apply(record)

  return true
}
