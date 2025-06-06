<script setup lang="ts">
import DOMPurify from 'dompurify'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'
import { useTopBarStore } from '~/stores/topBarStore'
import api from '~/utils/api'
import { revokeAccessKey } from '~/utils/authProvider'
import { numFormatter } from '~/utils/dataFormatter'
import { LV0_ICON, LV1_ICON, LV2_ICON, LV3_ICON, LV4_ICON, LV5_ICON, LV6_ICON, LV6_LIGHTNING_ICON } from '~/utils/lvIcons'
import { getCSRF, getUserID, isHomePage } from '~/utils/main'

import type { UserInfo, UserStat } from '../../types'

const props = defineProps<{
  userInfo: UserInfo
}>()

const { t } = useI18n()

const topBarStore = useTopBarStore()
const { hasBCoinToReceive } = storeToRefs(topBarStore)

const mid = computed(() => {
  return getUserID()
})

const otherLinks = computed((): { name: string, url: string, icon: string, code?: string }[] => {
  return [

    {
      name: t('topbar.user_dropdown.uploads_manager'),
      url: 'https://member.bilibili.com/platform/upload-manager/article',
      icon: 'i-solar:video-library-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.account_settings'),
      url: 'https://account.bilibili.com/account/home',
      icon: 'i-solar:user-circle-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.bilibili_premium'),
      url: 'https://account.bilibili.com/big',
      icon: 'i-solar:accessibility-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.bilibili_premium_rewards'),
      url: 'https://account.bilibili.com/account/big/myPackage',
      icon: 'i-solar:accessibility-bold-duotone',
      code: 'vip_rewards',
    },
    {
      name: t('topbar.user_dropdown.b_coins_wallet'),
      url: 'https://pay.bilibili.com/',
      icon: 'i-solar:wallet-money-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.orders'),
      url: 'https://show.bilibili.com/orderlist',
      icon: 'i-solar:clipboard-list-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.workshop'),
      url: 'https://gf.bilibili.com?msource=main_station',
      icon: 'i-solar:garage-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.my_stream_info'),
      url: 'https://link.bilibili.com/p/center/index',
      icon: 'i-solar:videocamera-record-bold-duotone',
    },
    {
      name: t('topbar.user_dropdown.my_courses'),
      url: 'https://www.bilibili.com/cheese/mine/list',
      icon: 'i-solar:notebook-bookmark-bold-duotone',
    },
  ]
})

const levelProgressBarWidth = computed(() => {
  const { next_exp: nextExp, current_exp: currentExp } = props.userInfo.level_info

  const percentage = (currentExp / nextExp) * 100
  return `${percentage.toFixed(2)}%`
})

const userStat = reactive<UserStat>({} as UserStat)

onMounted(() => {
  api.user.getUserStat()
    .then((res) => {
      if (res.code === 0)
        Object.assign(userStat, res.data)
    })
})

async function logout() {
  revokeAccessKey()
  api.auth.logout({
    biliCSRF: getCSRF(),
  }).then(() => {
    location.reload()
  })
}

const levelIcons: string[] = [
  LV0_ICON,
  LV1_ICON,
  LV2_ICON,
  LV3_ICON,
  LV4_ICON,
  LV5_ICON,
  LV6_ICON,
  LV6_LIGHTNING_ICON,
]

function getLvIcon(level: number, isSigma: boolean = false): string {
  if (level === 6 && isSigma) {
    return LV6_LIGHTNING_ICON
  }
  return levelIcons[level] || ''
}

function handleClickChannel() {
  if (settings.value.topBarLinkOpenMode === 'newTab') {
    window.open(`https://space.bilibili.com/${mid.value}`, '_blank')
  }
  else if (settings.value.topBarLinkOpenMode === 'currentTabIfNotHomepage') {
    if (isHomePage())
      window.open(`https://space.bilibili.com/${mid.value}`, '_blank')
    else
      window.open(`https://space.bilibili.com/${mid.value}`, '_self')
  }
  else {
    window.open(`https://space.bilibili.com/${mid.value}`, '_self')
  }
}
</script>

<template>
  <div
    style="backdrop-filter: var(--bew-filter-glass-1); overflow-y: auto;"
    w-300px max-h="[calc(100vh-120px)]" min-h-0
    p-4 rounded="$bew-radius" z--1 bg="$bew-elevated-alt"
    border="1 $bew-border-color"
    shadow="[var(--bew-shadow-3),var(--bew-shadow-edge-glow-1)]"
    class="userPanel-pop bew-popover"
    data-key="userPanel"
  >
    <div
      text="xl" font-medium flex="~ items-center gap-2"
    >
      <Button
        v-if="settings.touchScreenOptimization"
        type="secondary" strong @click="handleClickChannel"
      >
        {{ userInfo.uname ? userInfo.uname : '-' }}
      </Button>
      <span v-else>
        {{ userInfo.uname ? userInfo.uname : '-' }}
      </span>
    </div>
    <div
      text="xs $bew-text-2"
      m="t-1 b-2"
    >
      <ALink
        class="group mr-4"
        href="https://account.bilibili.com/account/coin"
        type="topBar"
      >
        {{ $t('topbar.user_dropdown.money') + (userInfo.money ?? '-') }}
      </ALink>
      <ALink
        class="group"
        href="https://pay.bilibili.com/pay-v2-web/bcoin_index"
        type="topBar"
      >
        {{
          $t('topbar.user_dropdown.b_coins') + (userInfo.wallet?.bcoin_balance ?? '-')
        }}
      </ALink>
    </div>

    <ALink
      href="//account.bilibili.com/account/record?type=exp"
      type="topBar"
      block mb-2 w-full
      flex="~ col justify-center items-start"
    >
      <template v-if="userInfo?.level_info?.current_level < 6">
        <div
          flex="~ items-center justify-center gap-2"
          w-full
        >
          <div
            flex="~ items-center"
            class="level"
            v-html="DOMPurify.sanitize(getLvIcon(userInfo.level_info.current_level))"
          />
          <div relative w="full" h="2px" bg="$bew-fill-3">
            <div
              pos="absolute top-0 left-0" h-2px
              h="2px"
              rounded="2px"
              bg="$bew-warning-color"
              :style="{ width: levelProgressBarWidth }"
            />
          </div>
          <div
            class="level level-next"
            flex="~ items-center"
            v-html="DOMPurify.sanitize(getLvIcon(userInfo.level_info.current_level + 1))"
          />
        </div>
        <div w-full text="xs $bew-text-3">
          {{
            $t('topbar.user_dropdown.exp_desc', {
              current_exp: userInfo.level_info.current_exp,
              level: userInfo.level_info.current_level + 1,
              need_exp: userInfo.level_info.next_exp - userInfo.level_info.current_exp || 0,
            })
          }}
        </div>
      </template>
      <template v-else>
        <div
          :style="{ width: userInfo?.is_senior_member ? '36px' : '28px' }"
          class="level"
          h-20px block
          v-html="DOMPurify.sanitize(getLvIcon(userInfo?.level_info?.current_level, userInfo?.is_senior_member))"
        />
      </template>
    </ALink>

    <div grid="~ cols-3 gap-2" mb-2>
      <ALink
        class="channel-info-item"
        :href="`https://space.bilibili.com/${mid}/fans/follow`"
        :title="`${userStat.following}`"
        type="topBar"
      >
        <div class="num">
          {{ userStat.following ? numFormatter(userStat.following) : '0' }}
        </div>
        <div>{{ $t('topbar.user_dropdown.following') }}</div>
      </ALink>
      <ALink
        class="channel-info-item"
        :href="`https://space.bilibili.com/${mid}/fans/fans`"
        :title="`${userStat.follower}`"
        type="topBar"
      >
        <div class="num">
          {{ userStat.follower ? numFormatter(userStat.follower) : '0' }}
        </div>
        <div>{{ $t('topbar.user_dropdown.followers') }}</div>
      </ALink>
      <ALink
        class="channel-info-item"
        :href="`https://space.bilibili.com/${mid}/dynamic`"
        :title="`${userStat.dynamic_count}`"
        type="topBar"
      >
        <div class="num">
          {{
            userStat.dynamic_count ? numFormatter(userStat.dynamic_count) : '0'
          }}
        </div>
        <div>{{ $t('topbar.user_dropdown.posts') }}</div>
      </ALink>
    </div>

    <div
      flex="~ justify-between col gap-1"
      mb-2 p-2 bg="$bew-fill-alt" rounded="$bew-radius"
      shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-1)]"
    >
      <ALink
        v-for="item in otherLinks.filter((_, index) => index <= 1)"
        :key="item.url"
        :href="item.url"
        type="topBar"
        p="x-4 y-2" flex="~ items-center justify-between"
        rounded="$bew-radius"
        duration-300
        hover:bg="$bew-fill-2"
        relative
      >
        <!-- B币领取提醒dot -->
        <div
          v-if="hasBCoinToReceive && item?.code === 'vip_rewards' && settings.showBCoinReceiveReminder"
          class="unread-dot"
          pos="absolute top-1 right-1"
        />

        <div flex="~ items-center gap-2">
          <div :class="item.icon" text="$bew-text-2" />
          {{ item.name }}
        </div>
        <div i-mingcute:arrow-right-line />
      </ALink>
    </div>

    <div
      flex="~ justify-between col gap-1"
      p-2 bg="$bew-fill-alt" rounded="$bew-radius"
      shadow="[var(--bew-shadow-edge-glow-1),var(--bew-shadow-1)]"
    >
      <ALink
        v-for="item in otherLinks.filter((_, index) => index > 1)"
        :key="item.url"
        :href="item.url"
        type="topBar"
        p="x-4 y-2" flex="~ items-center justify-between"
        rounded="$bew-radius"
        duration-300
        hover:bg="$bew-fill-2"
        relative
      >
        <!-- B币领取提醒dot -->
        <div
          v-if="hasBCoinToReceive && item?.code === 'vip_rewards'"
          class="unread-dot"
          pos="absolute top-1 right-1"
          style="z-index: 999 !important;"
        />

        <div flex="~ items-center gap-2">
          <div :class="item.icon" text="$bew-text-2" />
          {{ item.name }}
        </div>
        <div i-mingcute:arrow-right-line />
      </ALink>
      <div
        text="$bew-error-color"
        p="x-4 y-2" flex="~ items-center"
        rounded="$bew-radius"
        duration-300 cursor-pointer
        hover:bg="$bew-fill-2"
        @click="logout()"
      >
        <div i-solar:logout-2-bold-duotone text="$bew-error-60" mr-2 />
        {{ $t('topbar.user_dropdown.log_out') }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import "../../styles/index.scss";

.level :deep(svg) {
  --uno: "w-25px h-16px";
}

.level-next :deep(svg .level-bg) {
  --uno: "fill-#c9ccd0";
}

.channel-info-item {
  --uno: "p-2 m-0 rounded-$bew-radius text-sm flex flex-col items-center transition-all duration-300";
  --uno: "bg-$bew-fill-alt hover:bg-$bew-fill-2";
  --uno: "shadow-[var(--bew-shadow-edge-glow-1),var(--bew-shadow-1)]";

  > * {
    --uno: "transition-all duration-300";
  }

  .num {
    --uno: "font-semibold text-xl";

    + div {
      --uno: "text-$bew-text-2 mt-1 text-xs font-semibold";
    }
  }
}
</style>
