<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { genreChannelConfigs, otherChannelConfigs } from '../../constants/channels'

const { t } = useI18n()

const genres = computed(() => {
  return genreChannelConfigs.map((config) => {
    return {
      ...config,
      name: t(config.nameKey),
    }
  })
})

const otherLinks = computed(() => {
  return otherChannelConfigs.map((config) => {
    return {
      ...config,
      name: t(config.nameKey),
    }
  })
})
</script>

<template>
  <div
    mt-2
    h="fit" max-h="[calc(100vh-120px)]"
    w="fit"
    of-y-auto of-x-hidden
    shadow="$bew-shadow-3"
    bg="$bew-elevated-alt"
    border="1 $bew-popover-border-color"
    class="channels-pop bew-popover"
    data-key="channels"
  >
    <div
      class="bew-popover-inset"
      flex="~ gap-1"
      w-inherit
    >
      <ul
        v-for="item in [0, 10, 20, 30]"
        :key="item"
        class="link-list"
      >
        <li
          v-for="genre in genres.slice(item, item + 10)"
          :key="genre.name"
          class="link-item"
        >
          <ALink
            :href="genre.href"
            type="topBar"
          >
            <svg aria-hidden="true" class="svg-icon">
              <use :xlink:href="genre.icon" />
            </svg>
            <span>{{ genre.name }}</span>
          </ALink>
        </li>
      </ul>
      <ul class="link-list">
        <li
          v-for="otherLink in otherLinks.slice(0, 10)"
          :key="otherLink.name"
          class="link-item group"
        >
          <ALink
            :href="otherLink.href"
            type="topBar"
          >
            <div v-if="otherLink.icon.startsWith('#')" class="icon">
              <svg
                aria-hidden="true"
              >
                <use :xlink:href="otherLink.icon" />
              </svg>
            </div>

            <div
              v-else
              class="icon"
            >
              <i
                :class="otherLink.icon"
                :style="{ color: otherLink.color }"
              />
            </div>
            <span>{{ otherLink.name }}</span>
          </ALink>
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.link-item {
  --uno: "mb-1 last-of-type:mb-0 text-sm";

  a {
    --uno: "flex items-center text-nowrap min-w-160px h-38px py-2 pl-4 pr-3 rounded-$bew-menu-item-radius duration-300";
    --uno: "hover:bg-$bew-fill-2";
  }
}

.svg-icon {
  --uno: "w-2em h-2em mr-3 vertical-bottom fill-current overflow-hidden";
}

.icon {
  --uno: "w-2em h-2em mr-3 bg-$bew-content-solid vertical-bottom fill-current overflow-hidden";
  --uno: "text-1.25em grid place-items-center rounded-1/2 shrink-0";
  --uno: "border-1 border-$bew-border-color";

  svg {
    --uno: "w-1.25em h-1.25em";
  }
}
</style>
