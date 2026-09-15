import type { MaybeRefOrGetter } from 'vue'
import { onActivated, onDeactivated, onScopeDispose, ref, toValue, watch } from 'vue'

import { useUserRelationStore } from '~/stores/userRelationStore'

/** 登记组件正在使用的 mid，停用和销毁时释放；查询范围可小于使用范围。 */
export function useUserRelationScope(
  mids: MaybeRefOrGetter<number[]>,
  queryMids: MaybeRefOrGetter<number[]> = [],
) {
  const store = useUserRelationStore()
  const active = ref(true)
  let release: (() => void) | undefined
  const stop = watch(
    [() => active.value ? toValue(mids) : [], () => active.value ? toValue(queryMids) : [], () => store.accountMid],
    ([retained, queried]) => {
      // 先登记新范围，避免重叠的 mid 被短暂释放而丢失状态或重复请求。
      const nextRelease = store.retainRelations(retained)
      release?.()
      release = nextRelease
      if (queried.length)
        void store.queryRelations(queried)
    },
    { immediate: true, flush: 'sync' },
  )
  onActivated(() => active.value = true)
  onDeactivated(() => active.value = false)
  onScopeDispose(() => {
    stop()
    active.value = false
    release?.()
  })
  return { active }
}
