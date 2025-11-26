<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { BilibiliFeaturesPage } from '../types'

const { t } = useI18n()

const activePage = ref<BilibiliFeaturesPage>(BilibiliFeaturesPage.Comments)

const pages = [
  {
    value: BilibiliFeaturesPage.Comments,
    title: t('settings.bilibili_features.comments'),
    icon: 'i-mingcute:comment-line',
    iconActivated: 'i-mingcute:comment-fill',
    component: defineAsyncComponent(() => import('./Comments/Comments.vue')),
  },
  {
    value: BilibiliFeaturesPage.VideoPlayback,
    title: t('settings.bilibili_features.video_playback'),
    icon: 'i-mingcute:play-circle-line',
    iconActivated: 'i-mingcute:play-circle-fill',
    component: defineAsyncComponent(() => import('./VideoPlayback/VideoPlayback.vue')),
  },
  {
    value: BilibiliFeaturesPage.AutoPlay,
    title: t('settings.bilibili_features.auto_play'),
    icon: 'i-mingcute:list-check-line',
    iconActivated: 'i-mingcute:list-check-fill',
    component: defineAsyncComponent(() => import('./AutoPlay/AutoPlay.vue')),
  },
  {
    value: BilibiliFeaturesPage.VipFeatures,
    title: t('settings.bilibili_features.vip_features'),
    icon: 'i-mingcute:vip-1-line',
    iconActivated: 'i-mingcute:vip-1-fill',
    component: defineAsyncComponent(() => import('./VipFeatures/VipFeatures.vue')),
  },
]
</script>

<template>
  <div flex="~" ml--8>
    <!-- Sidebar -->
    <div w-140px shrink-0>
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
            <div class="flex items-center">
              <div :class="activePage === page.value ? page.iconActivated : page.icon" class="mr-2 text-lg" />
              <span>{{ page.title }}</span>
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
