import { waitWithSignal } from '~/utils/abort'

const REQUEST_TIMEOUT_MS = 20_000

/** 整次读取（包括响应体和签名重试）共享一个超时预算。 */
export async function withRequestTimeout<T>(run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort(parent?.reason)
  if (parent?.aborted)
    abort()
  else
    parent?.addEventListener('abort', abort, { once: true })

  const timer = setTimeout(() => {
    controller.abort(new DOMException('API request timed out', 'TimeoutError'))
  }, REQUEST_TIMEOUT_MS)

  try {
    controller.signal.throwIfAborted()
    return await waitWithSignal(Promise.resolve().then(() => {
      controller.signal.throwIfAborted()
      return run(controller.signal)
    }), controller.signal)
  }
  finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
  }
}
