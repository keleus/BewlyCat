import type { Ref } from 'vue'
import { computed, ref } from 'vue'

export type LayoutEditSection = 'dock' | 'topBar' | 'sidebar'

const activeSection = ref<LayoutEditSection | null>(null)

export function useLayoutEditMode(): {
  activeSection: Ref<LayoutEditSection | null>
  isLayoutEditing: Readonly<Ref<boolean>>
  enterLayoutEditMode: (section: LayoutEditSection) => void
  toggleLayoutEditMode: (section: LayoutEditSection) => void
  exitLayoutEditMode: () => void
} {
  const isLayoutEditing = computed(() => activeSection.value !== null)

  function enterLayoutEditMode(section: LayoutEditSection) {
    activeSection.value = section
  }

  function toggleLayoutEditMode(section: LayoutEditSection) {
    activeSection.value = activeSection.value === null ? section : null
  }

  function exitLayoutEditMode() {
    activeSection.value = null
  }

  return {
    activeSection,
    isLayoutEditing,
    enterLayoutEditMode,
    toggleLayoutEditMode,
    exitLayoutEditMode,
  }
}
