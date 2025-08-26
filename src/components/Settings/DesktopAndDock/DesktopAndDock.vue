<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const activePage = ref('topbar')

const pages = [
  {
    value: 'topbar',
    title: t('settings.group_topbar'),
    icon: 'i-mingcute:layout-top-line',
    iconActivated: 'i-mingcute:layout-top-fill',
    component: defineAsyncComponent(() => import('./TopBar/TopBar.vue')),
  },
  {
    value: 'navigation',
    title: t('settings.group_navigation'),
    icon: 'i-mingcute:navigation-line',
    iconActivated: 'i-mingcute:navigation-fill',
    component: defineAsyncComponent(() => import('./Navigation/Navigation.vue')),
  },
]
</script>

<template>
  <div flex="~ gap-2">
    <!-- Sidebar -->
    <div w-140px>
      <div w-inherit pos="fixed">
        <ul flex="~ col gap-1">
          <li
            v-for="page in pages"
            :key="page.value"
            :style="{ backgroundColor: activePage === page.value ? 'var(--bew-fill-3)' : '' }"
            cursor-pointer p="y-2 x-4" ml--4 rounded="$bew-radius" bg="hover:$bew-fill-2"
            duration-300
            @click="activePage = page.value"
          >
            <div class="flex items-center">
              <div :class="activePage === page.value ? page.iconActivated : page.icon" class="mr-2 text-lg" />
              <span>{{ page.title }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 p-4">
      <Transition name="page-fade">
        <Component :is="pages.find(page => page.value === activePage)?.component" />
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>

</style>
