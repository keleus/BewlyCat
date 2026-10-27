type HlsModule = typeof import('~/contentScripts/hlsPlayer')
type FlvModule = typeof import('~/contentScripts/flvPlayer')

const requests = new Map<string, Promise<unknown>>()

// IIFE builds inline ordinary dynamic imports, so the players are separate
// web-accessible ESM files. A failed request (e.g. after an extension update)
// is not cached; the next preview retries.
function loadExtensionModule<T>(path: string): Promise<T> {
  let request = requests.get(path)
  if (!request) {
    request = import(/* @vite-ignore */ browser.runtime.getURL(path)).catch((error) => {
      requests.delete(path)
      throw error
    })
    requests.set(path, request)
  }
  return request as Promise<T>
}

export async function loadHls() {
  return (await loadExtensionModule<HlsModule>('dist/contentScripts/hlsPlayer.js')).Hls
}

export async function loadFlvjs() {
  return (await loadExtensionModule<FlvModule>('dist/contentScripts/flvPlayer.js')).flvjs
}
