/** 等待共享任务时只取消当前等待者，不中止其他调用方仍在使用的任务。 */
export function waitWithSignal<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal)
    return task

  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'))
    if (signal.aborted)
      abort()
    else
      signal.addEventListener('abort', abort, { once: true })

    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
