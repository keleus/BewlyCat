<script setup lang="ts">
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const VideoPlayback = defineAsyncComponent(() => import('../BilibiliFeaturesEnhancement/VideoPlayback/VideoPlayback.vue'))
const AutoPlay = defineAsyncComponent(() => import('../BilibiliFeaturesEnhancement/AutoPlay/AutoPlay.vue'))
const VolumeBalance = defineAsyncComponent(() => import('../PluginComponentsAndPages/VolumeBalance/VolumeBalance.vue'))
const volumeCollapsed = ref(true)
</script>

<template>
  <div class="combined-settings-page">
    <section>
      <SettingsSectionHeading
        :title="$t('settings.bilibili_features.video_playback')"
        :desc="$t('settings.category_playback_player_desc')"
        icon="i-mingcute:play-circle-fill"
      />
      <VideoPlayback />
    </section>

    <section>
      <SettingsSectionHeading
        :title="$t('settings.bilibili_features.auto_play')"
        :desc="$t('settings.category_playback_autoplay_desc')"
        icon="i-mingcute:list-check-fill"
      />
      <AutoPlay />
    </section>

    <section>
      <SettingsSectionHeading
        v-model:collapsed="volumeCollapsed"
        :title="$t('settings.plugin.volume_balance')"
        :desc="$t('settings.category_playback_volume_desc')"
        icon="i-mingcute:volume-fill"
        collapsible
        warning
        :badge="$t('settings.badge_use_with_caution')"
      />
      <VolumeBalance v-show="!volumeCollapsed" />
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
