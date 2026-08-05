<script lang="ts" setup>
import LinkOpening from '../../Navigation/LinkOpening.vue'
import TopBarVisualConfig from './TopBarVisualConfig.vue'
</script>

<template>
  <TopBarVisualConfig />
  <div class="topbar-link-opening">
    <LinkOpening scope="topBar" />
  </div>
</template>

<style lang="scss" scoped>
.topbar-link-opening {
  margin-top: var(--bew-space-6);
}
</style>
