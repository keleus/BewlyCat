/** 与原生评论用户信息共用，不推断未公开的性别或属地。 */
export function normalizeCommentLocation(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^IP属地[：: ]*/u, '') : ''
}

const commentSexIcons = {
  男: { key: 'male', color: '#00a1d6', path: 'M20 4v6h-2V7.425l-3.975 3.95q.475.7.725 1.488T15 14.5q0 2.3-1.6 3.9T9.5 20q-2.3 0-3.9-1.6T4 14.5q0-2.3 1.6-3.9T9.5 9q.825 0 1.625.237t1.475.738L16.575 6H14V4zM9.5 11q-1.45 0-2.475 1.025T6 14.5q0 1.45 1.025 2.475T9.5 18q1.45 0 2.475-1.025T13 14.5q0-1.45-1.025-2.475T9.5 11' },
  女: { key: 'female', color: '#fb7299', path: 'M11 21v-2H9v-2h2v-2.1q-1.975-.35-3.238-1.888T6.5 9.45q0-2.275 1.613-3.862T12 4t3.888 1.588T17.5 9.45q0 2.025-1.263 3.563T13 14.9V17h2v2h-2v2zm1-8q1.45 0 2.475-1.025T15.5 9.5q0-1.45-1.025-2.475T12 6q-1.45 0-2.475 1.025T8.5 9.5q0 1.45 1.025 2.475T12 13' },
}

export function getCommentSexIcon(sex: string) {
  return sex === '男' || sex === '女' ? commentSexIcons[sex] : undefined
}
