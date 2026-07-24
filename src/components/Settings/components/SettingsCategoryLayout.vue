<script setup lang="ts">
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

import SettingsSectionHeading from './SettingsSectionHeading.vue'

interface CategoryPage {
  value: string
  titleKey: string
  descriptionKey?: string
  icon: string
  iconActivated: string
  component: Component
}

const props = defineProps<{
  pages: CategoryPage[]
  storageKey: string
}>()

const { t } = useI18n()
const setBreadcrumb = inject<(detail?: string) => void>('setSettingsBreadcrumb')
const savedPage = sessionStorage.getItem(props.storageKey)
const activePage = ref(
  props.pages.some(page => page.value === savedPage)
    ? savedPage!
    : props.pages[0]?.value ?? '',
)

const currentPage = computed(() =>
  props.pages.find(page => page.value === activePage.value) ?? props.pages[0],
)

watch(activePage, page => sessionStorage.setItem(props.storageKey, page))
watchEffect(() => setBreadcrumb?.(currentPage.value ? t(currentPage.value.titleKey) : undefined))
</script>

<template>
  <div class="settings-category-layout">
    <nav class="settings-category-nav" :aria-label="$t('settings.category_navigation')">
      <button
        v-for="page in pages"
        :key="page.value"
        type="button"
        class="settings-category-button"
        :class="{ active: activePage === page.value }"
        @click="activePage = page.value"
      >
        <span
          class="settings-category-icon"
          :class="activePage === page.value ? page.iconActivated : page.icon"
        />
        <span>{{ $t(page.titleKey) }}</span>
      </button>
    </nav>

    <section v-if="currentPage" class="settings-category-content">
      <SettingsSectionHeading
        :title="$t(currentPage.titleKey)"
        :desc="currentPage.descriptionKey ? $t(currentPage.descriptionKey) : undefined"
        :icon="currentPage.iconActivated"
      />
      <Transition name="page-fade" mode="out-in">
        <Component :is="currentPage.component" :key="currentPage.value" />
      </Transition>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.settings-category-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 24px;
  margin-left: -32px;
}

.settings-category-nav {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  align-self: start;
  gap: 4px;
}

.settings-category-button {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 10px 14px;
  color: var(--bew-text-1);
  text-align: left;
  border-radius: var(--bew-radius);
  transition:
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover {
    background: var(--bew-fill-2);
  }

  &.active {
    color: var(--bew-theme-color);
    background: var(--bew-fill-3);
    font-weight: 600;
  }
}

.settings-category-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  font-size: 20px;
}

.settings-category-content {
  min-width: 0;
}

@media (max-width: 760px) {
  .settings-category-layout {
    display: block;
    margin-left: 0;
  }

  .settings-category-nav {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 20px;
  }
}
</style>
