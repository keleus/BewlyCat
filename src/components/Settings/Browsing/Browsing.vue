<script setup lang="ts">
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const Home = defineAsyncComponent(() => import('../PluginComponentsAndPages/Home/Home.vue'))
const VideoCard = defineAsyncComponent(() => import('../PluginComponentsAndPages/VideoCard/VideoCard.vue'))
</script>

<template>
  <div class="combined-settings-page">
    <section>
      <SettingsSectionHeading
        :title="$t('settings.plugin.home')"
        :desc="$t('settings.category_browsing_home_desc')"
        icon="i-mingcute:home-5-fill"
      />
      <Home />
    </section>

    <section>
      <SettingsSectionHeading
        :title="$t('settings.plugin.video_card')"
        :desc="$t('settings.category_browsing_video_card_desc')"
        icon="i-mingcute:video-camera-fill"
      />
      <VideoCard />
    </section>
  </div>
</template>

<style scoped>
.combined-settings-page {
  display: flex;
  flex-direction: column;
  gap: 36px;
}
</style>
