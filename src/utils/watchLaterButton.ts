/**
 * 稍后再看按钮工具函数
 * 用于在B站视频页面添加独立的稍后再看按钮
 */

/**
 * 从URL中提取视频ID
 * @param url 视频页面URL，默认为当前页面URL
 * @returns 包含bvid或aid的对象
 */
export function extractVideoIds(url: string = location.href): { bvid?: string, aid?: number } {
  // 提取BVID
  const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/)
  if (bvidMatch) {
    return { bvid: bvidMatch[1] }
  }

  // 提取AID
  const aidMatch = url.match(/\/video\/av(\d+)/)
  if (aidMatch) {
    return { aid: Number.parseInt(aidMatch[1]) }
  }

  return {}
}

/**
 * 添加稍后再看按钮到视频页面
 */
export async function addWatchLaterButton() {
  // 检查是否已经添加过按钮
  if (document.querySelector('.bewly-watch-later-btn')) {
    return
  }

  // 查找视频工具栏的更多按钮容器
  const moreButton = document.querySelector('.video-tool-more')
  if (!moreButton) {
    return
  }

  // 获取视频ID
  const { bvid, aid } = extractVideoIds()
  if (!bvid && !aid) {
    return
  }

  // 创建稍后再看按钮
  const watchLaterBtn = document.createElement('div')
  watchLaterBtn.className = 'video-toolbar-right-item bewly-watch-later-btn'
  watchLaterBtn.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 0.2s, transform 0.15s ease;
    height: 32px;
    width: 32px;
    padding: 0;
    margin: 0 4px;
  `

  watchLaterBtn.innerHTML = `
    <div class="video-toolbar-item-icon" style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    ">
      <i class="i-mingcute:carplay-line" style="
        font-size: 18px;
        line-height: 1;
        color: var(--text1);
        transition: color 0.2s ease;
      "></i>
    </div>
  `

  // 添加点击事件
  watchLaterBtn.addEventListener('click', async () => {
    try {
      // 获取图标元素
      const iconElement = watchLaterBtn.querySelector('i')
      if (!iconElement)
        return

      // 禁用按钮防止重复点击
      watchLaterBtn.style.pointerEvents = 'none'

      // 动态导入api模块
      const { default: api } = await import('~/utils/api')
      const { getCSRF } = await import('~/utils/main')
      const { useTopBarStore } = await import('~/stores/topBarStore')

      const params: { bvid?: string, aid?: number, csrf: string } = {
        csrf: getCSRF(),
      }

      if (bvid) {
        params.bvid = bvid
      }
      else if (aid) {
        params.aid = aid
      }

      // 使用已有的API封装
      const result = await api.watchlater.saveToWatchLater(params)

      if (result.code === 0) {
        // 成功后将图标变为勾选
        iconElement.className = 'i-mingcute:check-line'
        iconElement.style.color = 'var(--bew-theme-color)'

        // 添加成功动画效果
        watchLaterBtn.style.transform = 'scale(1.1)'
        setTimeout(() => {
          watchLaterBtn.style.transform = 'scale(1)'
        }, 150)

        // 更新顶栏数据
        setTimeout(() => {
          const topBarStore = useTopBarStore()
          topBarStore.getAllWatchLaterList()
        }, 1000)

        // 2秒后恢复原始图标
        setTimeout(() => {
          iconElement.className = 'i-mingcute:carplay-line'
          iconElement.style.color = 'var(--text1)'
          watchLaterBtn.style.pointerEvents = 'auto'
        }, 2000)
      }
      else {
        // 失败时恢复按钮状态
        watchLaterBtn.style.pointerEvents = 'auto'
      }
    }
    catch (error) {
      console.error('添加稍后再看出错:', error)
      // 出错时恢复按钮状态
      watchLaterBtn.style.pointerEvents = 'auto'
    }
  })

  // 将按钮插入到更多按钮之前
  moreButton.parentNode?.insertBefore(watchLaterBtn, moreButton)
}
