/**
 * 收藏弹窗增强工具函数
 * 用于在B站收藏弹窗添加清空已选按钮和放大样式
 */

import { settings } from '~/logic'
import { i18n } from '~/utils/i18n'

let observer: MutationObserver | null = null

/**
 * 创建清空已选按钮
 */
function createClearButton(container: Element): HTMLElement {
  const clearBtn = document.createElement('button')
  clearBtn.className = 'bewly-clear-selection-btn btn'
  clearBtn.textContent = String(i18n.global.t('favorite_dialog.clear_selected'))

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

const FAV_MARKED_ATTR = 'bewlyFavMarked'
const FULL_GUARD_BOUND_ATTR = 'bewlyFullGuardBound'
const FULL_DISABLED_CLASS = 'bewly-full-disabled'

/**
 * 判断收藏夹是否已满（原生会为其 label 添加 disable 类）
 */
function isFullFolder(label: HTMLElement): boolean {
  return label.classList.contains('disable')
}

/**
 * 标记「已满且视频原本不在其中」的收藏夹，用于灰色禁用外观与点击拦截
 */
function markFullDisabledFolders(dialog: Element) {
  dialog.querySelectorAll<HTMLElement>('.group-list li label').forEach((label) => {
    if (label.dataset[FAV_MARKED_ATTR])
      return

    const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
    if (!input)
      return

    if (!input.checked && isFullFolder(label))
      label.classList.add(FULL_DISABLED_CLASS)

    label.dataset[FAV_MARKED_ATTR] = '1'
  })
}

/**
 * 是否应阻止勾选：收藏夹已满、当前未勾选，且视频原本不在其中
 */
function shouldBlockFullFolderToggle(label: HTMLElement, target: Element): boolean {
  if (!label.classList.contains(FULL_DISABLED_CLASS))
    return false

  const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]')
  // checkbox 的 click 捕获阶段已经执行预激活并翻转 checked；点击 label 时则尚未翻转。
  // preventDefault 会让 checkbox 恢复预激活前的状态，同时仍允许取消已选项。
  return !!input && (target === input ? input.checked : !input.checked)
}

/**
 * 显示与 B 站一致的「收藏夹已满」提示
 */
function showFolderFullMessage(anchor: HTMLElement) {
  document.querySelectorAll('.bili-msg').forEach(el => el.remove())

  const message = document.createElement('div')
  message.className = 'bili-msg error'
  message.textContent = String(i18n.global.t('favorite_dialog.folder_full'))
  document.body.appendChild(message)

  const rect = anchor.getBoundingClientRect()
  const scrollTop = (document.scrollingElement || document.documentElement).scrollTop
  message.style.left = `${rect.left + rect.width / 2 - message.offsetWidth / 2}px`
  message.style.top = `${rect.top + scrollTop - (message.offsetHeight + 10)}px`
  message.classList.add('show')

  window.setTimeout(() => message.remove(), 2000)
}

/**
 * 拦截对已满收藏夹的勾选，并弹出提示
 */
function bindFullFolderGuard(dialog: Element) {
  const element = dialog as HTMLElement
  if (element.dataset[FULL_GUARD_BOUND_ATTR])
    return

  element.dataset[FULL_GUARD_BOUND_ATTR] = '1'

  element.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element))
      return

    const label = target.closest<HTMLElement>('.group-list li label')
    if (!label || !shouldBlockFullFolderToggle(label, target))
      return

    event.preventDefault()
    event.stopPropagation()
    showFolderFullMessage(label)
  }, true)
}

/**
 * 应用放大样式到收藏弹窗
 */
function applyEnlargedStyle(dialog: Element) {
  if (settings.value.enlargeFavoriteDialog) {
    dialog.classList.add('bewly-enlarged-favorite-dialog')
  }
  else {
    dialog.classList.remove('bewly-enlarged-favorite-dialog')
  }
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
 * 增强收藏弹窗
 */
function enhanceFavoriteDialog(dialog: Element) {
  // 应用放大样式
  applyEnlargedStyle(dialog)

  // 注入清空按钮
  injectClearButton(dialog)

  // 标记已满且原本不在其中的收藏夹，并拦截对它们的勾选
  markFullDisabledFolders(dialog)
  bindFullFolderGuard(dialog)
}

/**
 * 初始化收藏弹窗增强功能
 * 监听 DOM 变化，当收藏弹窗出现时应用增强功能（清空按钮和放大样式）
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
              enhanceFavoriteDialog(dialog)
            }, 100)
          }

          // 收藏夹行异步渲染时补打灰色禁用标记
          const context = node.closest('.collection-m-exp')
          if (context) {
            markFullDisabledFolders(context)
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
    enhanceFavoriteDialog(existingDialog)
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
