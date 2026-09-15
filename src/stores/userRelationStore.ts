import { defineStore } from 'pinia'
import { ref, shallowReactive, watch } from 'vue'

import { parseDedeUserID } from '~/logic/loginStatus'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'

// 分批是客户端策略，避免过长的 URL；并非已确认的接口上限。
const BATCH_SIZE = 40
const CACHE_MAX_AGE = 5 * 60 * 1000
const RETRY_DELAY = 30 * 1000

interface RelationEntry {
  following: boolean
  updatedAt: number
}

interface RelationQuery {
  mid: number
  started: boolean
  previous?: RelationEntry
  promise: Promise<void>
  resolve: () => void
}

/** 同一页面的网格共享关系状态，合并视窗中同时出现的 UP 主查询。 */
export const useUserRelationStore = defineStore('userRelations', () => {
  const topBar = useTopBarStore()
  const accountMid = ref<number>()
  const relations = shallowReactive(new Map<number, RelationEntry>())
  const pending = new Map<number, RelationQuery>()
  const retryAfter = new Map<number, number>()
  const consumers = new Map<number, number>()
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let draining = false

  function syncAccount() {
    const mid = topBar.isLogin ? parseDedeUserID(document.cookie) : undefined
    if (mid !== accountMid.value) {
      generation++
      relations.clear()
      retryAfter.clear()
      clearTimeout(timer)
      timer = undefined
      for (const query of pending.values())
        query.resolve()
      pending.clear()
      accountMid.value = mid
    }
    return mid
  }

  watch(() => [topBar.isLogin, topBar.userInfo.mid], syncAccount, { immediate: true, flush: 'sync' })

  function getFollowing(mid: number | undefined): boolean | undefined {
    if (!accountMid.value || !mid || mid === accountMid.value)
      return undefined
    return relations.get(mid)?.following
  }

  function setFollowing(mid: number, following: boolean, expectedAccount = accountMid.value) {
    if (!syncAccount() || accountMid.value !== expectedAccount || !Number.isSafeInteger(mid) || mid <= 0 || mid === accountMid.value)
      return false
    // 替换对象，使正在进行的旧查询无法覆盖操作成功后的状态。
    if (consumers.has(mid))
      relations.set(mid, { following, updatedAt: Date.now() })
    retryAfter.delete(mid)
    return true
  }

  /** 只保留仍被加载窗口、卡片或菜单使用的关系；释放函数可以重复调用。 */
  function retainRelations(mids: number[]) {
    const retained = new Set(mids.filter(mid => Number.isSafeInteger(mid) && mid > 0))
    for (const mid of retained)
      consumers.set(mid, (consumers.get(mid) ?? 0) + 1)
    return () => {
      for (const mid of retained) {
        const count = (consumers.get(mid) ?? 1) - 1
        if (count > 0) {
          consumers.set(mid, count)
          continue
        }
        consumers.delete(mid)
        relations.delete(mid)
        retryAfter.delete(mid)
        const query = pending.get(mid)
        pending.delete(mid)
        query?.resolve()
      }
      retained.clear()
      if (!pending.size) {
        clearTimeout(timer)
        timer = undefined
      }
    }
  }

  function scheduleQuery() {
    if (timer !== undefined || draining)
      return
    timer = setTimeout(() => {
      timer = undefined
      void flushQueries()
    }, 50)
  }

  async function flushQueries() {
    if (draining)
      return
    draining = true
    try {
      while (pending.size) {
        const requestAccount = syncAccount()
        if (!requestAccount)
          break
        const requestGeneration = generation
        const chunk = [...pending.values()].filter(query => !query.started).slice(0, BATCH_SIZE)
        if (!chunk.length)
          break
        for (const query of chunk) {
          query.started = true
          query.previous = relations.get(query.mid)
        }

        try {
          const response = await api.user.getRelations({ fids: chunk.map(query => query.mid).join(',') })
          if (syncAccount() !== requestAccount || generation !== requestGeneration)
            continue
          if (response?.code !== 0) {
            throw new Error(`查询用户关系失败（code: ${response?.code ?? 'missing'}）：${response?.message || '接口未返回成功状态'}`)
          }
          // 全部未关注时接口成功返回 null，等同于空关系列表。
          const data = response.data === null ? {} : response.data
          if (!data || typeof data !== 'object' || Array.isArray(data)) {
            const dataType = Array.isArray(data) ? 'array' : typeof data
            throw new Error(`用户关系响应格式异常（code: 0, data: ${dataType}）`)
          }

          for (const query of chunk) {
            if (pending.get(query.mid) !== query || !consumers.has(query.mid)
              || relations.get(query.mid) !== query.previous) {
              continue
            }
            // 接口只返回已关注的用户；成功响应中缺席的 mid 表示未关注。
            const attribute = Object.prototype.hasOwnProperty.call(data, query.mid)
              ? data[query.mid]?.attribute
              : 0
            if (![0, 1, 2, 6, 128].includes(attribute)) {
              retryAfter.set(query.mid, Date.now() + RETRY_DELAY)
              continue
            }
            setFollowing(query.mid, attribute === 1 || attribute === 2 || attribute === 6, requestAccount)
          }
        }
        catch (error) {
          if (syncAccount() === requestAccount && generation === requestGeneration) {
            for (const query of chunk) {
              if (pending.get(query.mid) === query && consumers.has(query.mid))
                retryAfter.set(query.mid, Date.now() + RETRY_DELAY)
            }
            console.error('批量查询用户关系失败:', error)
          }
        }
        finally {
          for (const query of chunk) {
            if (pending.get(query.mid) === query)
              pending.delete(query.mid)
            query.resolve()
          }
        }
      }
    }
    finally {
      draining = false
      if (pending.size)
        scheduleQuery()
    }
  }

  async function queryRelations(mids: number[]) {
    const currentAccount = syncAccount()
    if (!currentAccount)
      return
    const now = Date.now()
    const promises: Promise<void>[] = []
    for (const mid of new Set(mids)) {
      if (!Number.isSafeInteger(mid) || mid <= 0 || mid === currentAccount || !consumers.has(mid))
        continue
      const cached = relations.get(mid)
      if (cached && now - cached.updatedAt < CACHE_MAX_AGE)
        continue
      if ((retryAfter.get(mid) ?? 0) > now)
        continue
      let query = pending.get(mid)
      if (!query) {
        let resolve!: () => void
        const promise = new Promise<void>((done) => {
          resolve = done
        })
        query = { mid, promise, resolve, started: false }
        pending.set(mid, query)
      }
      promises.push(query.promise)
    }
    if (pending.size)
      scheduleQuery()
    await Promise.all(promises)
  }

  return { accountMid, getFollowing, setFollowing, queryRelations, retainRelations }
})
