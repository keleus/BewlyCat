<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const genres = computed(() => [
  { name: t('topbar.logo_dropdown.anime'), icon: '#channel-anime', href: 'https://www.bilibili.com/anime' },
  { name: t('topbar.logo_dropdown.movies'), icon: '#channel-movie', href: 'https://www.bilibili.com/movie' },
  { name: t('topbar.logo_dropdown.chinese_anime'), icon: '#channel-guochuang', href: 'https://www.bilibili.com/guochuang' },
  { name: t('topbar.logo_dropdown.tv_shows'), icon: '#channel-teleplay', href: 'https://www.bilibili.com/tv' },
  { name: t('topbar.logo_dropdown.variety_shows'), icon: '#channel-zongyi', href: 'https://www.bilibili.com/variety' },
  { name: t('topbar.logo_dropdown.documentary_films'), icon: '#channel-documentary', href: 'https://www.bilibili.com/documentary' },
  { name: t('topbar.logo_dropdown.animations'), icon: '#channel-douga', href: 'https://www.bilibili.com/c/douga' },
  { name: t('topbar.logo_dropdown.gaming'), icon: '#channel-game', href: 'https://www.bilibili.com/c/game' },
  { name: t('topbar.logo_dropdown.kichiku'), icon: '#channel-kichiku', href: 'https://www.bilibili.com/c/kichiku' },
  { name: t('topbar.logo_dropdown.music'), icon: '#channel-music', href: 'https://www.bilibili.com/c/music' },
  { name: t('topbar.logo_dropdown.dance'), icon: '#channel-dance', href: 'https://www.bilibili.com/c/dance' },
  { name: t('topbar.logo_dropdown.cinephile'), icon: '#channel-cinephile', href: 'https://www.bilibili.com/c/cinephile' },
  { name: t('topbar.logo_dropdown.showbiz'), icon: '#channel-ent', href: 'https://www.bilibili.com/c/ent' },
  { name: t('topbar.logo_dropdown.knowledge'), icon: '#channel-knowledge', href: 'https://www.bilibili.com/c/knowledge' },
  { name: t('topbar.logo_dropdown.technology'), icon: '#channel-tech', href: 'https://www.bilibili.com/c/tech' },
  { name: t('topbar.logo_dropdown.news'), icon: '#channel-information', href: 'https://www.bilibili.com/c/information' },
  { name: t('topbar.logo_dropdown.foods'), icon: '#channel-food', href: 'https://www.bilibili.com/c/food' },
  { name: t('topbar.logo_dropdown.shortplay'), icon: '#channel-shortplay', href: 'https://www.bilibili.com/c/shortplay' },
  { name: t('topbar.logo_dropdown.cars'), icon: '#channel-car', href: 'https://www.bilibili.com/c/car' },
  { name: t('topbar.logo_dropdown.fashion'), icon: '#channel-fashion', href: 'https://www.bilibili.com/c/fashion' },
  { name: t('topbar.logo_dropdown.sports'), icon: '#channel-sports', href: 'https://www.bilibili.com/c/sports' },
  { name: t('topbar.logo_dropdown.animals'), icon: '#channel-animal', href: 'https://www.bilibili.com/c/animal' },
  { name: t('topbar.logo_dropdown.vlog'), icon: '#channel-vlog', href: 'https://www.bilibili.com/c/vlog' },
  { name: t('topbar.logo_dropdown.painting'), icon: '#channel-painting', href: 'https://www.bilibili.com/c/painting' },
  { name: t('topbar.logo_dropdown.ai'), icon: '#channel-ai', href: 'https://www.bilibili.com/c/ai' },
  { name: t('topbar.logo_dropdown.home'), icon: '#channel-home', href: 'https://www.bilibili.com/c/home' },
  { name: t('topbar.logo_dropdown.outdoors'), icon: '#channel-outdoors', href: 'https://www.bilibili.com/c/outdoors' },
  { name: t('topbar.logo_dropdown.gym'), icon: '#channel-gym', href: 'https://www.bilibili.com/c/gym' },
  { name: t('topbar.logo_dropdown.handmake'), icon: '#channel-handmake', href: 'https://www.bilibili.com/c/handmake' },
  { name: t('topbar.logo_dropdown.travel'), icon: '#channel-travel', href: 'https://www.bilibili.com/c/travel' },
  { name: t('topbar.logo_dropdown.rural'), icon: '#channel-rural', href: 'https://www.bilibili.com/c/rural' },
  { name: t('topbar.logo_dropdown.parenting'), icon: '#channel-parenting', href: 'https://www.bilibili.com/c/parenting' },
  { name: t('topbar.logo_dropdown.health'), icon: '#channel-health', href: 'https://www.bilibili.com/c/health' },
  { name: t('topbar.logo_dropdown.emotion'), icon: '#channel-emotion', href: 'https://www.bilibili.com/c/emotion' },
  { name: t('topbar.logo_dropdown.life_joy'), icon: '#channel-life-joy', href: 'https://www.bilibili.com/c/life_joy' },
  { name: t('topbar.logo_dropdown.life_experience'), icon: '#channel-life-experience', href: 'https://www.bilibili.com/c/life_experience' },
  { name: t('topbar.logo_dropdown.charitable_events'), icon: '#channel-love', href: 'https://love.bilibili.com' },
  // 以下分区已不再存在，暂时注释
  // { name: t('topbar.logo_dropdown.funny'), icon: '#channel-gaoxiao', href: 'https://www.bilibili.com/c/life/funny' },
  // { name: t('topbar.logo_dropdown.standalone_gaming'), icon: '#channel-danjiyouxi', href: 'https://www.bilibili.com/c/game/stand_alone' },
  // { name: t('topbar.logo_dropdown.vtubers'), icon: '#channel-vtuber', href: 'https://www.bilibili.com/c/virtual' },
  // { name: t('topbar.logo_dropdown.moocs'), icon: '#channel-gongkaike', href: 'https://www.bilibili.com/mooc' },
])

const otherLinks = computed(() => [
  { name: t('topbar.logo_dropdown.articles'), icon: '#channel-read', href: 'https://www.bilibili.com/read/home' },
  { name: t('topbar.logo_dropdown.live'), icon: '#channel-live', href: 'https://live.bilibili.com' },
  { name: t('topbar.logo_dropdown.activities'), icon: '#channel-activity', href: 'https://www.bilibili.com/blackboard/activity-list.html' },
  { name: t('topbar.logo_dropdown.paid_courses'), icon: '#channel-zhishi', href: 'https://www.bilibili.com/cheese' },
  { name: t('topbar.logo_dropdown.community'), icon: '#channel-blackroom', href: 'https://www.bilibili.com/blackboard/activity-5zJxM3spoS.html' },
  { name: t('topbar.logo_dropdown.music_plus'), icon: '#channel-musicplus', href: 'https://www.bilibili.com/c/musicplus' },
  { name: t('topbar.logo_dropdown.game_center'), icon: 'i-mingcute:game-2-fill', color: '#69B1DD', href: 'https://game.bilibili.com/platform' },
  { name: t('topbar.logo_dropdown.comic_con_and_goods'), icon: 'i-mingcute:store-fill', color: '#E4C081', href: 'https://show.bilibili.com/platform/home.html' },
  { name: t('topbar.logo_dropdown.manga'), icon: 'i-mingcute:cat-fill', color: '#FFC1CC', href: 'https://manga.bilibili.com' },
  { name: t('topbar.logo_dropdown.game_competitions'), icon: 'i-mingcute:sword-fill', color: '#C8D3DF', href: 'https://www.bilibili.com/match/home' },
])
</script>

<template>
  <OverlayScrollbarsComponent
    element="div" defer
    :options="{
      x: 'hidden',
      y: 'scroll',
    }"
    style="backdrop-filter: var(--bew-filter-glass-1);"
    h="[calc(100vh-100px)]" max-h="445px"
    w="[calc(100vw-100px)]" max-w="fit"
    shadow="[var(--bew-shadow-3),var(--bew-shadow-edge-glow-1)]"
    bg="$bew-elevated-alt"
    rounded="$bew-radius"
    border="1 $bew-border-color"
    class="channels-pop bew-popover"
    data-key="channels"
  >
    <div
      flex="~ gap-1"
      p="4" w-inherit
    >
      <ul
        v-for="(item, index) in [0, 10, 20, 30]"
        :key="index"
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
      <ul
        v-for="(item, index) in [0]"
        :key="index"
        class="link-list"
      >
        <li
          v-for="otherLink in otherLinks.slice(item, item + 10)"
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
  </OverlayScrollbarsComponent>
</template>

<style lang="scss" scoped>
.link-item {
  --uno: "mb-1 last-of-type:mb-0 text-sm";

  a {
    --uno: "flex items-center text-nowrap min-w-160px h-38px p-2 pr-3 rounded-$bew-radius duration-300";
    --uno: "hover:bg-$bew-fill-alt hover:shadow-[var(--bew-shadow-1),var(--bew-shadow-edge-glow-1)]";
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
