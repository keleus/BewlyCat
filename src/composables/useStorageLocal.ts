import type {
  MaybeRef,
  RemovableRef,
  StorageLikeAsync,
  UseStorageAsyncOptions,
} from '@vueuse/core'
import { useStorageAsync } from '@vueuse/core'
import { storage } from 'webextension-polyfill'

import type { Settings } from '~/logic/storage'

const storageLocal: StorageLikeAsync = {
  removeItem(key: string) {
    return storage.local.remove(key)
  },

  setItem<T>(key: string, value: T) {
    return storage.local.set({ [key]: value })
  },

  async getItem<T>(key: string): Promise<T | null> {
    return (await storage.local.get(key))[key]
  },
}

const storageSync: StorageLikeAsync = {
  removeItem(key: string) {
    return storage.sync.remove(key)
  },

  setItem<T>(key: string, value: T) {
    return storage.sync.set({ [key]: value })
  },

  async getItem<T>(key: string): Promise<T | null> {
    return (await storage.sync.get(key))[key]
  },
}

// 创建一个同时保存到本地和云端的存储对象
const storageBoth: StorageLikeAsync = {
  async removeItem(key: string) {
    await Promise.all([
      storageLocal.removeItem(key),
      storageSync.removeItem(key),
    ])
    return Promise.resolve()
  },

  async setItem<T>(key: string, value: T) {
    try {
      // 检查值是否已经是字符串
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value)

      // 始终保存到本地存储
      await storageLocal.setItem(key, valueStr)

      // 对于settings类型，需要特殊处理同步逻辑
      if (key === 'settings') {
        try {
          const parsedValue = JSON.parse(valueStr) as Settings
          // 如果开启了同步，则同步到云端
          if (parsedValue.enableSettingsSync) {
            await storageSync.setItem(key, valueStr)
          }
          else {
            // 如果关闭了同步，则清除云端配置
            await storageSync.removeItem(key)
          }
        }
        catch (e) {
          console.error('解析设置对象失败:', e)
        }
      }
    }
    catch (e) {
      console.error('保存数据失败:', e)
    }
    return Promise.resolve()
  },

  async getItem(key: string): Promise<any | null> {
    if (key === 'settings') {
      // 先检查云端是否有配置
      const syncValue = await storageSync.getItem(key)
      // 检查本地是否有配置
      const localValue = await storageLocal.getItem(key)

      if (syncValue) {
        try {
          const syncSettings = JSON.parse(syncValue as string) as Settings

          // 如果云端配置开启了同步
          if (syncSettings.enableSettingsSync) {
            // 如果本地没有配置或者是默认配置，则使用云端配置
            if (localValue) {
              // 将云端配置同步到本地
              await storageLocal.setItem(key, syncValue)
              return syncValue
            }

            try {
              // 如果本地有配置，检查是否为默认配置
              const localSettings = JSON.parse(localValue as string) as Settings
              // 从 storage.ts 导入实际的默认设置值，而不是类型
              const defaultSettings = (await import('~/logic/storage')).originalSettings
              const isDefault = JSON.stringify(localSettings) === JSON.stringify(defaultSettings)

              if (isDefault) {
                // 如果是默认配置，使用云端配置
                await storageLocal.setItem(key, syncValue)
                return syncValue
              }
            }
            catch (e) {
              console.error('解析本地设置失败:', e)
            }
          }
        }
        catch (e) {
          console.error('解析云端设置失败:', e)
        }
      }

      // 返回本地配置
      return localValue
    }

    // 非settings类型的数据，直接从本地获取
    return storageLocal.getItem(key)
  },
}

export function useStorageLocal<T>(
  key: string,
  initialValue: MaybeRef<T>,
  options?: UseStorageAsyncOptions<T>,
): RemovableRef<T> {
  // 获取当前存储区域
  async function getCurrentStorage() {
    if (key === 'settings') {
      // 先检查云端是否有配置
      const syncResult = await storage.sync.get('settings')
      const syncSettingsStr = syncResult.settings as string | undefined

      if (syncSettingsStr) {
        try {
          const syncSettings = JSON.parse(syncSettingsStr) as Settings
          // 如果云端有配置且开启了同步
          if (syncSettings && syncSettings.enableSettingsSync) {
            return storageBoth
          }
        }
        catch (e) {
          console.error('解析云端设置失败:', e)
        }
      }

      // 检查本地配置
      const result = await storage.local.get('settings')
      const settingsStr = result.settings as string | undefined

      if (settingsStr) {
        try {
          const settings = JSON.parse(settingsStr) as Settings
          // 如果本地配置开启了同步
          if (settings && settings.enableSettingsSync) {
            return storageBoth
          }
          return storageLocal
        }
        catch (e) {
          console.error('解析本地设置失败:', e)
        }
      }
    }
    return storageLocal
  }

  // 创建一个代理存储对象
  const proxyStorage: StorageLikeAsync = {
    async removeItem(key: string) {
      const currentStorage = await getCurrentStorage()
      return currentStorage.removeItem(key)
    },
    async setItem(key: string, value: any) {
      const currentStorage = await getCurrentStorage()
      return currentStorage.setItem(key, value)
    },
    async getItem(key: string): Promise<any | null> {
      const currentStorage = await getCurrentStorage()
      return currentStorage.getItem(key)
    },
  }

  // 使用代理存储对象
  return useStorageAsync(key, initialValue, proxyStorage, options)
}
