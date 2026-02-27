<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { PluginPage } from '../types'

const { t } = useI18n()

const activePage = ref<PluginPage>(PluginPage.General)

const pages = [
  {
    value: PluginPage.General,
    title: t('settings.plugin.general'),
    icon: 'i-mingcute:settings-3-line',
    iconActivated: 'i-mingcute:settings-3-fill',
    component: defineAsyncComponent(() => import('./General/General.vue')),
  },
  {
    value: PluginPage.VideoCard,
    title: t('settings.plugin.video_card'),
    icon: 'i-mingcute:video-camera-line',
    iconActivated: 'i-mingcute:video-camera-fill',
    component: defineAsyncComponent(() => import('./VideoCard/VideoCard.vue')),
  },
  {
    value: PluginPage.TopBar,
    title: t('settings.plugin.topbar'),
    icon: 'i-mingcute:layout-top-line',
    iconActivated: 'i-mingcute:layout-top-fill',
    component: defineAsyncComponent(() => import('./TopBar/TopBar.vue')),
  },
  {
    value: PluginPage.DockAndSidebar,
    title: t('settings.plugin.dock_and_sidebar'),
    icon: 'i-mingcute:navigation-line',
    iconActivated: 'i-mingcute:navigation-fill',
    component: defineAsyncComponent(() => import('./DockAndSidebar/DockAndSidebar.vue')),
  },
  {
    value: PluginPage.Home,
    title: t('settings.plugin.home'),
    icon: 'i-mingcute:home-5-line',
    iconActivated: 'i-mingcute:home-5-fill',
    component: defineAsyncComponent(() => import('./Home/Home.vue')),
  },
  {
    value: PluginPage.Search,
    title: t('settings.plugin.search'),
    icon: 'i-mingcute:search-2-line',
    iconActivated: 'i-mingcute:search-2-fill',
    component: defineAsyncComponent(() => import('./SearchPage/SearchPage.vue')),
  },
  {
    value: PluginPage.VolumeBalance,
    title: t('settings.plugin.volume_balance'),
    icon: 'i-mingcute:volume-line',
    iconActivated: 'i-mingcute:volume-fill',
    component: defineAsyncComponent(() => import('./VolumeBalance/VolumeBalance.vue')),
  },
]
</script>

<template>
  <div flex="~" ml--8>
    <!-- Sidebar -->
    <div w-160px shrink-0>
      <div w-inherit pos="fixed">
        <ul flex="~ col gap-1">
          <li
            v-for="page in pages"
            :key="page.value"
            :style="{ backgroundColor: activePage === page.value ? 'var(--bew-fill-3)' : '' }"
            cursor-pointer p="y-2 x-4" rounded="$bew-radius" bg="hover:$bew-fill-2"
            duration-300
            @click="activePage = page.value"
          >
            <div class="flex items-center min-w-0">
              <div :class="activePage === page.value ? page.iconActivated : page.icon" class="mr-2 text-lg shrink-0" />
              <span class="flex-1 min-w-0" leading-5 whitespace-normal break-normal>{{ page.title }}</span>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1" pl-6 pr-4>
      <Transition name="page-fade">
        <Component :is="pages.find(page => page.value === activePage)?.component" />
      </Transition>
    </div>
  </div>
</template>
