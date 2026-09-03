// 共享原生评论区与动态预览的 SVG 几何计算；本模块不访问浏览器或存储。
export interface CommentReplyAvatarAnchor {
  bottom: number
  centerX: number
  centerY: number
  left: number
  toggleY: number
}

export interface CommentReplyTreeBranch {
  childAnchors: CommentReplyAvatarAnchor[]
  collapsed: boolean
  /**
   * true（线条-收起主评论）：收起时折叠父节点本体，显示 + 与昵称
   * false（线条-不收起主评论）：收起时父节点保持完整显示，仅隐藏子回复
   */
  collapseParentBody: boolean
  key: string
  parentAnchor: CommentReplyAvatarAnchor
  parentAuthorName: string | null
  /** 平级收起后的 + 纵坐标；主干延伸至此，避免与上方连线断开 */
  trunkExtendY?: number
}

export function formatCommentReplyGuideCoordinate(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function getCommentReplyBranchExpandedToggleY(
  parentAnchor: CommentReplyAvatarAnchor,
  childAnchors: CommentReplyAvatarAnchor[],
  toggleHitRadius: number,
): number {
  if (childAnchors.length === 0)
    return Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)

  const branchEndY = childAnchors[childAnchors.length - 1].centerY
  const minimumY = parentAnchor.bottom + toggleHitRadius
  const maximumY = branchEndY - toggleHitRadius
  if (maximumY <= minimumY)
    return parentAnchor.bottom + (branchEndY - parentAnchor.bottom) / 2

  return Math.min(Math.max(parentAnchor.toggleY, minimumY), maximumY)
}

export function getCommentReplyBranchPath(
  branch: CommentReplyTreeBranch,
  branchRadius: number,
  toggleHitRadius: number,
  cachedToggleY?: number,
): string | null {
  const coordinate = formatCommentReplyGuideCoordinate
  const { childAnchors, collapsed, collapseParentBody, parentAnchor, trunkExtendY } = branch
  const x = parentAnchor.centerX

  if (collapsed) {
    if (collapseParentBody)
      return `M ${coordinate(x)} ${coordinate(parentAnchor.centerY)}`

    // 保留父节点正文：引导线与 + 留在收起前的位置，不缩短到父评论脚部
    const toggleY = cachedToggleY !== undefined
      ? Math.max(parentAnchor.bottom + toggleHitRadius, cachedToggleY)
      : Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)
    const startY = parentAnchor.bottom
    const endY = Math.max(toggleY + toggleHitRadius, parentAnchor.bottom + toggleHitRadius * 2)
    return [
      `M ${coordinate(x)} ${coordinate(startY)}`,
      `V ${coordinate(endY)}`,
    ].join(' ')
  }

  if (childAnchors.length === 0 && typeof trunkExtendY !== 'number')
    return null

  const pathCommands: string[] = []
  const childRadii = childAnchors.map((childAnchor) => {
    const horizontalGap = childAnchor.left - x
    if (horizontalGap <= 0)
      return 0
    const verticalRoom = Math.max(0, childAnchor.centerY - parentAnchor.bottom)
    if (verticalRoom <= 0)
      return 0
    return Math.min(branchRadius, horizontalGap, verticalRoom)
  })

  // 主干止于最后一条分支圆弧起点，避免竖线在拐角处多出一截；
  // 若有平级 +，再延伸到其位置
  let trunkEndY = parentAnchor.bottom
  if (childAnchors.length > 0) {
    const lastIndex = childAnchors.length - 1
    const lastChild = childAnchors[lastIndex]
    const lastRadius = childRadii[lastIndex]
    trunkEndY = lastChild.centerY - lastRadius
  }
  if (typeof trunkExtendY === 'number' && Number.isFinite(trunkExtendY))
    trunkEndY = Math.max(trunkEndY, trunkExtendY)

  if (trunkEndY > parentAnchor.bottom + 0.5) {
    pathCommands.push(
      `M ${coordinate(x)} ${coordinate(parentAnchor.bottom)}`,
      `V ${coordinate(trunkEndY)}`,
    )
  }

  // 从主干向每个可见子评论画水平分支（正圆弧，不超出竖线）
  childAnchors.forEach((childAnchor, index) => {
    const horizontalGap = childAnchor.left - x
    if (horizontalGap <= 0)
      return

    const radius = childRadii[index]
    if (radius <= 0) {
      pathCommands.push(
        `M ${coordinate(x)} ${coordinate(childAnchor.centerY)}`,
        `H ${coordinate(childAnchor.left)}`,
      )
      return
    }

    // 1/4 圆：从竖线 (x, cy-r) 转到水平 (x+r, cy)
    // SVG y 向下时，从左侧点到下侧点的短弧为 sweep=0（逆时针）
    pathCommands.push(
      `M ${coordinate(x)} ${coordinate(childAnchor.centerY - radius)}`,
      `A ${coordinate(radius)} ${coordinate(radius)} 0 0 0 ${coordinate(x + radius)} ${coordinate(childAnchor.centerY)}`,
      `H ${coordinate(childAnchor.left)}`,
    )
  })

  return pathCommands.length > 0 ? pathCommands.join(' ') : null
}

export function getCommentReplyBranchToggleY(
  branch: CommentReplyTreeBranch,
  toggleHitRadius: number,
  cachedToggleY?: number,
): number {
  const { childAnchors, collapsed, collapseParentBody, parentAnchor, trunkExtendY } = branch
  if (collapsed) {
    if (collapseParentBody)
      return parentAnchor.centerY

    // 「不收起主评论」：使用展开时缓存的位置，避免 + 缩到父评论下方
    if (cachedToggleY !== undefined)
      return Math.max(parentAnchor.bottom + toggleHitRadius, cachedToggleY)

    return Math.max(parentAnchor.bottom + toggleHitRadius, parentAnchor.toggleY)
  }

  // 平级收起后子锚点变少，父级 − 仍用展开时缓存，避免一起上缩
  if (trunkExtendY !== undefined && cachedToggleY !== undefined)
    return Math.max(parentAnchor.bottom + toggleHitRadius, cachedToggleY)

  return getCommentReplyBranchExpandedToggleY(parentAnchor, childAnchors, toggleHitRadius)
}
