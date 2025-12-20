/**
 * 全局图片加载队列（单例模式）
 * 限制同时加载的图片数量，避免并发过高
 * 支持优先级：视口内的图片优先加载
 */

type LoadCallback = () => void

interface QueueItem {
  id: symbol
  load: LoadCallback
}

// 全局状态（单例）
const queue: QueueItem[] = []
const loading = new Set<symbol>()
const MAX_CONCURRENT = 4

function processQueue() {
  while (loading.size < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()
    if (item) {
      loading.add(item.id)
      item.load()
    }
  }
}

/**
 * 将图片加入加载队列
 * @param load 开始加载的回调
 * @param priority 是否优先加载（插入队列头部）
 * @returns 取消函数和完成函数
 */
export function enqueueImageLoad(load: LoadCallback, priority = false): { cancel: () => void, done: () => void } {
  const id = Symbol('image')
  const item = { id, load }

  if (priority) {
    queue.unshift(item)
  }
  else {
    queue.push(item)
  }
  processQueue()

  return {
    cancel: () => {
      const index = queue.findIndex(i => i.id === id)
      if (index !== -1) {
        queue.splice(index, 1)
      }
      loading.delete(id)
    },
    done: () => {
      loading.delete(id)
      processQueue()
    },
  }
}
