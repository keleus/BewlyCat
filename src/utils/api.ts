import type { API_COLLECTION } from '~/background/messageListeners/api'
import { settings } from '~/logic'
import { sendMessage } from '~/utils/messaging'

const SEARCH_QUERY_ID_CHARACTERS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const searchQueryIds = new Map<string, string>()

function createSearchQueryId(): string {
  return Array.from({ length: 32 }, () => {
    const index = Math.floor(Math.random() * SEARCH_QUERY_ID_CHARACTERS.length)
    return SEARCH_QUERY_ID_CHARACTERS[index]
  }).join('')
}

function getSearchQueryId(method: string, options?: object): string {
  const keyword = String((options as Record<string, unknown> | undefined)?.keyword ?? '')
  const cacheKey = `${method}:${keyword}`
  const cached = searchQueryIds.get(cacheKey)
  if (cached)
    return cached

  if (searchQueryIds.size >= 100)
    searchQueryIds.clear()

  const id = createSearchQueryId()
  searchQueryIds.set(cacheKey, id)
  return id
}

type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>

type APIFunction<T = typeof API_COLLECTION> = {
  [K in keyof T as CamelCase<string & K>]: {
    // @ts-expect-error allow params
    [P in keyof T[K]]: T[K][P] extends (...args: any[]) => any ? T[K][P] : Lowercase<T[K][P]['_fetch']['method']> extends 'get' ? (options?: Partial<T[K][P]['params']>) => Promise<any> : (options?: Partial<T[K][P]['params'] & T[K][P]['_fetch']['body']>) => Promise<any>
  }
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export interface APIClient extends APIFunction<typeof API_COLLECTION> {

}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class APIClient {
  private readonly cache = new Map<string | symbol, any>()

  constructor() {
    // @ts-expect-error ignore
    return new Proxy({}, {
      get: (_, namespace) => { // namespace
        if (this.cache.has(namespace)) {
          return this.cache.get(namespace)
        }
        else {
          const api = new Proxy({}, {
            get(_, p) {
              return (options?: object) => {
                const isSearchRequest = namespace === 'search' && typeof p === 'string'
                const requestOptions = isSearchRequest
                  ? { qv_id: getSearchQueryId(p, options), ...options }
                  : options

                const message: Record<string, any> = {
                  contentScriptQuery: p as string,
                  ...requestOptions,
                }

                // 去个性化搜索仍经后台获取匿名 WBI key 并签名，只省略 Cookie。
                if (isSearchRequest && settings.value.depersonalizeSearchResults)
                  message.bewlyNoCookie = true

                return sendMessage(p as string, message)
              }
            },
          })
          this.cache.set(namespace, api)
          return api
        }
      },
    })
  }
}

const api = new APIClient()

export default api
