import type { InjectionKey, Ref } from 'vue'
import { computed, onScopeDispose, ref, shallowRef, triggerRef, watch } from 'vue'

/** Owned by the settings window, rather than a settings subpage or storage. */
export function createPinnedChannelHistory(selection: Ref<string[]>) {
  const history = shallowRef<string[][]>([])
  const externalChange = ref(false)
  let writing = false

  function write(keys: string[]) {
    writing = true
    try {
      selection.value = [...keys]
    }
    finally {
      writing = false
    }
  }

  function save(keys: string[]) {
    if (JSON.stringify(keys) === JSON.stringify(selection.value))
      return
    history.value.push([...selection.value])
    triggerRef(history)
    externalChange.value = false
    write(keys)
  }

  function undo() {
    const previous = history.value.pop()
    if (!previous)
      return
    triggerRef(history)
    externalChange.value = false
    write(previous)
  }

  // Ignore equal storage echoes, but do not overwrite changes from another tab/import.
  watch(() => JSON.stringify(selection.value), () => {
    if (writing)
      return
    history.value = []
    externalChange.value = true
  }, { flush: 'sync' })

  function reset() {
    history.value = []
    externalChange.value = false
  }

  onScopeDispose(reset)

  return { save, undo, reset, externalChange, canUndo: computed(() => history.value.length > 0) }
}

export const pinnedChannelHistoryKey: InjectionKey<ReturnType<typeof createPinnedChannelHistory>> = Symbol('pinnedChannelHistory')
