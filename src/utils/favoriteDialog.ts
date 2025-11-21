/**
 * 收藏弹窗增强工具函数
 * 用于在B站收藏弹窗添加清空已选按钮
 */

let observer: MutationObserver | null = null

/**
 * 创建清空已选按钮
 */
function createClearButton(container: Element): HTMLElement {
  const clearBtn = document.createElement('button')
  clearBtn.className = 'bewly-clear-selection-btn btn'
  clearBtn.textContent = '清空已选'

  // 添加点击事件
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    clearAllSelections(container)
  })

  return clearBtn
}

/**
 * 清空所有选中的收藏夹
 */
function clearAllSelections(container: Element) {
  const checkboxes = container.querySelectorAll<HTMLInputElement>('.group-list ul li input[type="checkbox"]:checked')

  checkboxes.forEach((checkbox) => {
    // 模拟点击来取消选中，这样可以触发 Vue 的响应式更新
    checkbox.click()
  })
}

/**
 * 注入清空按钮到收藏弹窗
 */
function injectClearButton(dialog: Element) {
  // 检查是否已经注入过
  if (dialog.querySelector('.bewly-clear-selection-btn')) {
    return
  }

  // 找到底部按钮容器
  const bottomContainer = dialog.querySelector('.bottom')
  if (!bottomContainer) {
    return
  }

  // 创建清空按钮
  const clearBtn = createClearButton(dialog)

  // 找到确认按钮
  const submitBtn = bottomContainer.querySelector('.btn')
  if (submitBtn) {
    // 将清空按钮插入到确认按钮之前
    bottomContainer.insertBefore(clearBtn, submitBtn)
  }
  else {
    // 如果没有确认按钮，直接追加到容器开头
    bottomContainer.prepend(clearBtn)
  }
}

/**
 * 初始化收藏弹窗增强功能
 * 监听 DOM 变化，当收藏弹窗出现时注入清空按钮
 */
export function initFavoriteDialogEnhancement() {
  // 如果已经初始化过，先清理
  if (observer) {
    observer.disconnect()
  }

  // 创建 MutationObserver 监听 DOM 变化
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // 检查新增的节点
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLElement) {
          // 检查是否是收藏弹窗或包含收藏弹窗
          const dialog = node.classList?.contains('collection-m-exp')
            ? node
            : node.querySelector?.('.collection-m-exp')

          if (dialog) {
            // 延迟一点注入，确保弹窗内容已渲染
            setTimeout(() => {
              injectClearButton(dialog)
            }, 100)
          }
        }
      }
    }
  })

  // 开始监听 body 的子节点变化
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // 同时检查页面上是否已存在收藏弹窗
  const existingDialog = document.querySelector('.collection-m-exp')
  if (existingDialog) {
    injectClearButton(existingDialog)
  }
}

/**
 * 停止收藏弹窗增强功能
 */
export function stopFavoriteDialogEnhancement() {
  if (observer) {
    observer.disconnect()
    observer = null
  }

  // 移除所有已注入的按钮
  document.querySelectorAll('.bewly-clear-selection-btn').forEach(btn => btn.remove())
}
