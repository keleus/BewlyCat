<script setup lang="ts">
import SettingsSectionHeading from '../components/SettingsSectionHeading.vue'

const Comments = defineAsyncComponent(() => import('./Comments/Comments.vue'))
const VipFeatures = defineAsyncComponent(() => import('./VipFeatures/VipFeatures.vue'))
</script>

<template>
  <div class="bilibili-enhancements">
    <section>
      <SettingsSectionHeading
        :title="$t('settings.bilibili_features.comments')"
        :desc="$t('settings.category_bilibili_comments_desc')"
        icon="i-mingcute:comment-fill"
      />
      <Comments />
    </section>

    <section>
      <SettingsSectionHeading
        :title="$t('settings.bilibili_features.vip_features')"
        :desc="$t('settings.category_bilibili_vip_desc')"
        icon="i-mingcute:vip-1-fill"
      />
      <VipFeatures />
    </section>
  </div>
</template>

<style scoped>
.bilibili-enhancements {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
</style>
