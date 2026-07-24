import { describe, expect, it, vi } from 'vitest'

import { initializeLiquidGlassUpgrade } from '~/background/liquidGlassUpgrade'
import { LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY } from '~/constants/storageKeys'

function createStorage(initialValues: Record<string, unknown>) {
  const values = { ...initialValues }
  const storage = {
    get: vi.fn(async (keys: string[]) => Object.fromEntries(
      keys
        .filter(key => Object.prototype.hasOwnProperty.call(values, key))
        .map(key => [key, values[key]]),
    )),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items)
    }),
  }

  return { storage, values }
}

describe('liquid glass 升级提示迁移', () => {
  it('全新安装只记录状态，不显示升级提示', async () => {
    const { storage, values } = createStorage({})

    await expect(initializeLiquidGlassUpgrade(storage, 'install')).resolves.toBe('initialized')
    expect(values[LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY]).toBe(false)
  })

  it('升级时开启两种玻璃效果并挂出一次性提示', async () => {
    const { storage, values } = createStorage({
      settings: JSON.stringify({
        enableFrostedGlass: false,
        language: 'en',
      }),
    })

    await expect(initializeLiquidGlassUpgrade(storage, 'update')).resolves.toBe('notice-enabled')

    expect(values[LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY]).toBe(true)
    expect(JSON.parse(values.settings as string)).toMatchObject({
      enableFrostedGlass: true,
      enableLiquidGlass: true,
      language: 'en',
    })
  })

  it('兼容已经试用过旧实现但尚无独立提示状态的用户', async () => {
    const { storage, values } = createStorage({
      settings: JSON.stringify({
        enableFrostedGlass: true,
        enableLiquidGlass: true,
        liquidGlassPerformanceNoticeAcknowledged: true,
      }),
    })

    await expect(initializeLiquidGlassUpgrade(storage, 'startup')).resolves.toBe('notice-enabled')
    expect(values[LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY]).toBe(true)
  })

  it('已有独立状态时不会在后续升级中重复提示或覆盖开关', async () => {
    const originalSettings = JSON.stringify({
      enableFrostedGlass: false,
      enableLiquidGlass: false,
    })
    const { storage, values } = createStorage({
      [LIQUID_GLASS_UPGRADE_NOTICE_STORAGE_KEY]: false,
      settings: originalSettings,
    })

    await expect(initializeLiquidGlassUpgrade(storage, 'update')).resolves.toBe('unchanged')
    expect(values.settings).toBe(originalSettings)
    expect(storage.set).not.toHaveBeenCalled()
  })
})
