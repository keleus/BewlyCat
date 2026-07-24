import { LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY } from '~/constants/storageKeys'

export type LiquidGlassUpgradeTrigger = 'install' | 'startup' | 'update'

export interface LiquidGlassUpgradeStorage {
  get: (keys: string[]) => Promise<Record<string, unknown>>
  set: (items: Record<string, unknown>) => Promise<void>
}

export type LiquidGlassUpgradeResult = 'initialized' | 'notice-enabled' | 'unchanged'

function enableGlassEffects(rawSettings: unknown): unknown {
  if (typeof rawSettings === 'string') {
    try {
      const parsedSettings = JSON.parse(rawSettings) as unknown

      if (typeof parsedSettings !== 'object' || parsedSettings == null || Array.isArray(parsedSettings))
        return rawSettings

      return JSON.stringify({
        ...parsedSettings,
        enableFrostedGlass: true,
        enableLiquidGlass: true,
      })
    }
    catch {
      return rawSettings
    }
  }

  if (typeof rawSettings === 'object' && rawSettings != null && !Array.isArray(rawSettings)) {
    return {
      ...rawSettings,
      enableFrostedGlass: true,
      enableLiquidGlass: true,
    }
  }

  return rawSettings
}

export async function initializeLiquidGlassUpgrade(
  storage: LiquidGlassUpgradeStorage,
  trigger: LiquidGlassUpgradeTrigger,
): Promise<LiquidGlassUpgradeResult> {
  const storedValues = await storage.get([LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY, 'settings'])

  if (Object.prototype.hasOwnProperty.call(storedValues, LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY))
    return 'unchanged'

  if (trigger === 'install') {
    await storage.set({ [LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY]: false })
    return 'initialized'
  }

  const hasStoredSettings = storedValues.settings != null
  if (trigger === 'startup' && !hasStoredSettings)
    return 'unchanged'

  const updates: Record<string, unknown> = {
    [LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY]: true,
  }

  if (hasStoredSettings)
    updates.settings = enableGlassEffects(storedValues.settings)

  await storage.set(updates)
  return 'notice-enabled'
}
