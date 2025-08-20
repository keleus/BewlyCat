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
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 6px;
    transition: background-color 0.2s;
    margin-right: 8px;
  `

  watchLaterBtn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="video-toolbar-item-icon" style="margin-right: 4px;">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M11.5 4C7.08172 4 3.5 7.58172 3.5 12C3.5 16.4183 7.08172 20 11.5 20C13.709 20 15.7072 19.106 17.156 17.6578C17.5465 17.2673 18.1797 17.2674 18.5702 17.658C18.9606 18.0486 18.9605 18.6817 18.5699 19.0722C16.7615 20.8801 14.2606 22 11.5 22C5.97715 22 1.5 17.5228 1.5 12C1.5 6.47715 5.97715 2 11.5 2C17.0228 2 21.5 6.47715 21.5 12C21.5 12.3748 21.4793 12.7451 21.439 13.1099C21.3783 13.6588 20.8841 14.0546 20.3352 13.9939C19.7863 13.9333 19.3904 13.4391 19.4511 12.8901C19.4834 12.5982 19.5 12.3012 19.5 12C19.5 7.58172 15.9183 4 11.5 4Z"></path>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M17.7929 10.7929C18.1834 10.4024 18.8166 10.4024 19.2071 10.7929L20.5 12.0858L21.7929 10.7929C22.1834 10.4024 22.8166 10.4024 23.2071 10.7929C23.5976 11.1834 23.5976 11.8166 23.2071 12.2071L21.2071 14.2071C21.0196 14.3946 20.7652 14.5 20.5 14.5C20.2348 14.5 19.9804 14.3946 19.7929 14.2071L17.7929 12.2071C17.4024 11.8166 17.4024 11.1834 17.7929 10.7929Z"></path>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M14.625 10.4846C15.7917 11.1582 15.7917 12.8422 14.625 13.5157L10.875 15.6808C9.70834 16.3544 8.25 15.5124 8.25 14.1653L8.25 9.83513C8.25 8.48798 9.70834 7.64601 10.875 8.31959L14.625 10.4846ZM13.875 12.2167C14.0417 12.1205 14.0417 11.8799 13.875 11.7837L10.125 9.61862C9.95833 9.5224 9.75 9.64268 9.75 9.83513L9.75 14.1653C9.75 14.3577 9.95833 14.478 10.125 14.3818L13.875 12.2167Z"></path>
    </svg>
    <span class="video-toolbar-item-text">稍后再看</span>
  `

  // 添加悬停效果
  watchLaterBtn.addEventListener('mouseenter', () => {
    watchLaterBtn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'
  })

  watchLaterBtn.addEventListener('mouseleave', () => {
    watchLaterBtn.style.backgroundColor = 'transparent'
  })

  // 添加点击事件
  watchLaterBtn.addEventListener('click', async () => {
    try {
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
        // 成功添加到稍后再看
        const textSpan = watchLaterBtn.querySelector('.video-toolbar-item-text')
        if (textSpan) {
          const originalText = textSpan.textContent
          textSpan.textContent = '已添加'
          setTimeout(() => {
            textSpan.textContent = originalText
          }, 2000)
        }

        // 更新顶栏数据
        setTimeout(() => {
          const topBarStore = useTopBarStore()
          topBarStore.getAllWatchLaterList()
        }, 1000)
      }
      else {
        console.error('添加稍后再看失败:', result.message)
      }
    }
    catch (error) {
      console.error('添加稍后再看出错:', error)
    }
  })

  // 将按钮插入到更多按钮之前
  moreButton.parentNode?.insertBefore(watchLaterBtn, moreButton)
}
