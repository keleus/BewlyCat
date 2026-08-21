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

interface LoginLogItem {
  ip: string
  time: number
  time_at: string
  status: number
  type: number
  geo: string
}

const props = defineProps<{
  userInfo: UserInfo
}>()

const { t } = useI18n()

const topBarStore = useTopBarStore()
const { hasBCoinToReceive } = storeToRefs(topBarStore)

const mid = computed(() => {
  return props.userInfo.mid || getUserID()
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

const isMaxLevel = computed(() => (props.userInfo.level_info?.current_level ?? 0) >= 6)

const showLv6LastLoginInfo = computed(() => {
  return isMaxLevel.value && !settings.value.hideTopBarUserPanelLv6LastLoginLocation
})

function toFiniteNumber(value: number | string | undefined, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const remainingExp = computed(() => {
  const { next_exp: nextExp = 0, current_exp: currentExp = 0 } = props.userInfo.level_info ?? {}
  const nextExpNum = toFiniteNumber(nextExp, 0)
  return Math.max(nextExpNum - currentExp, 0)
})

const levelProgressBarWidth = computed(() => {
  if (isMaxLevel.value)
    return '100%'

  // 登录态尚未初始化（瞬态故障后自动重查期间）时 userInfo 可能为空，兜底防止解引用崩溃
  const { next_exp: nextExp = 1, current_exp: currentExp = 0 } = props.userInfo.level_info ?? {}
  const nextExpNum = toFiniteNumber(nextExp, 0)
  if (nextExpNum <= 0)
    return '100%'

  const percentage = Math.min(Math.max((currentExp / nextExpNum) * 100, 0), 100)
  return `${percentage.toFixed(2)}%`
})

const userStat = reactive<UserStat>({} as UserStat)
const loginLog = reactive<Partial<LoginLogItem>>({})

onMounted(() => {
  api.user.getUserStat()
    .then((res) => {
      if (res.code === 0)
        Object.assign(userStat, res.data)
    })

  if (showLv6LastLoginInfo.value) {
    // 获取最近一周登录情况的第一条记录
    api.user.getLoginLog()
      .then((res) => {
        if (res.code === 0 && res.data?.list?.length > 0)
          Object.assign(loginLog, res.data.list[0])
      })
  }
})

async function logout() {
  revokeAccessKey()

  // 立即更新登录状态，让顶栏立即显示未登录状态
  topBarStore.isLogin = false
  topBarStore.cleanup()

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
    style="overflow-y: auto;"
    w-300px max-h="[calc(100vh-120px)]" min-h-0
    z--1 bg="$bew-elevated"
    border="1 $bew-popover-border-color"
    shadow="$bew-shadow-3"
    class="userPanel-pop bew-popover bew-popover-inset"
    data-key="userPanel"
  >
    <div
      text="xl" font-medium flex="~ items-center gap-2"
      pt-4 pl-4
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
      m="t-3"
      flex="~ gap-1"
    >
      <ALink
        class="group"
        href="https://account.bilibili.com/account/coin"
        type="topBar"
        p="x-4 y-1"
        rounded="$bew-menu-item-radius"
        duration-200
        hover:bg="$bew-fill-1"
      >
        {{ $t('topbar.user_dropdown.money') + (userInfo.money ?? '-') }}
      </ALink>
      <ALink
        class="group"
        href="https://pay.bilibili.com/pay-v2-web/bcoin_index"
        type="topBar"
        p="x-4 y-1"
        rounded="$bew-menu-item-radius"
        duration-200
        hover:bg="$bew-fill-1"
      >
        {{
          $t('topbar.user_dropdown.b_coins') + (userInfo.wallet?.bcoin_balance ?? '-')
        }}
      </ALink>
    </div>

    <ALink
      v-if="!showLv6LastLoginInfo"
      href="//account.bilibili.com/account/record?type=exp"
      type="topBar"
      class="bew-content-card"
      block w-full p-2
      duration-200
      hover:bg="$bew-fill-1"
      flex="~ col justify-center items-start"
    >
      <div
        flex="~ items-center justify-center gap-2"
        w-full
      >
        <div
          flex="~ items-center"
          class="level"
          :class="{ 'level--senior': isMaxLevel && userInfo.is_senior_member }"
          v-html="DOMPurify.sanitize(getLvIcon(userInfo.level_info?.current_level ?? 0, userInfo.is_senior_member))"
        />
        <div relative w="full" h="2px" bg="$bew-fill-3">
          <div
            pos="absolute top-0 left-0"
            h="2px"
            rounded="$bew-radius-full"
            bg="$bew-warning-color"
            :style="{ width: levelProgressBarWidth }"
          />
        </div>
        <div
          v-if="!isMaxLevel"
          class="level level-next"
          flex="~ items-center"
          v-html="DOMPurify.sanitize(getLvIcon((userInfo.level_info?.current_level ?? 0) + 1))"
        />
      </div>
      <div w-full text="xs $bew-text-3">
        <template v-if="isMaxLevel">
          {{
            $t('topbar.user_dropdown.exp_desc_max', {
              current_exp: userInfo.level_info?.current_exp ?? 0,
            })
          }}
        </template>
        <template v-else>
          {{
            $t('topbar.user_dropdown.exp_desc', {
              current_exp: userInfo.level_info?.current_exp,
              level: (userInfo.level_info?.current_level ?? 0) + 1,
              need_exp: remainingExp,
            })
          }}
        </template>
      </div>
    </ALink>

    <ALink
      v-else
      href="//account.bilibili.com/account/record?type=exp"
      type="topBar"
      duration-200
      flex="~ items-center gap-2"
      class="lv6-entry lv6-entry--card bew-content-card"
    >
      <div
        :style="{ width: userInfo.is_senior_member ? '36px' : '28px' }"
        class="level"
        h-20px
        v-html="DOMPurify.sanitize(getLvIcon(userInfo.level_info?.current_level ?? 6, userInfo.is_senior_member))"
      />
      <div flex="~ col 1" text="xs $bew-text-3">
        <div v-if="loginLog.time_at">
          {{ $t('topbar.user_dropdown.last_login_time') }}: {{ loginLog.time_at }}
        </div>
        <div v-if="loginLog.geo">
          {{ $t('topbar.user_dropdown.last_login_location') }}: {{ loginLog.geo }}
        </div>
      </div>
    </ALink>

    <div grid="~ cols-3 gap-2" px-4 pt-1 mt-1 border-t="1 $bew-border-color">
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

    <div border-t="1 $bew-border-color" my-2 />

    <div flex="~ col gap-1">
      <ALink
        v-for="item in otherLinks.filter((_, index) => index <= 1)"
        :key="item.url"
        :href="item.url"
        type="topBar"
        p="x-4 y-2" flex="~ items-center justify-between"
        rounded="$bew-menu-item-radius"
        duration-300
        hover:bg="$bew-fill-1"
        relative
      >
        <!-- B币领取提醒dot -->
        <div
          v-if="hasBCoinToReceive && item?.code === 'vip_rewards' && settings.showBCoinReceiveReminder"
          class="unread-dot"
          pos="absolute top-1 right-1"
        />

        <div flex="~ items-center gap-3">
          <div :class="item.icon" text="$bew-text-2" />
          {{ item.name }}
        </div>
        <div i-mingcute:arrow-right-line />
      </ALink>
    </div>

    <div border-t="1 $bew-border-color" my-2 />

    <div flex="~ col gap-1">
      <ALink
        v-for="item in otherLinks.filter((_, index) => index > 1)"
        :key="item.url"
        :href="item.url"
        type="topBar"
        p="x-4 y-2" flex="~ items-center justify-between"
        rounded="$bew-menu-item-radius"
        duration-300
        hover:bg="$bew-fill-1"
        relative
      >
        <!-- B币领取提醒dot -->
        <div
          v-if="hasBCoinToReceive && item?.code === 'vip_rewards'"
          class="unread-dot"
          pos="absolute top-1 right-1"
          style="z-index: 999 !important;"
        />

        <div flex="~ items-center gap-3">
          <div :class="item.icon" text="$bew-text-2" />
          {{ item.name }}
        </div>
        <div i-mingcute:arrow-right-line />
      </ALink>
      <div
        text="$bew-error-color"
        p="x-4 y-2" flex="~ items-center"
        rounded="$bew-menu-item-radius"
        duration-300 cursor-pointer
        hover:bg="$bew-fill-1"
        @click="logout()"
      >
        <div i-solar:logout-2-bold-duotone text="$bew-error-60" mr-3 />
        {{ $t('topbar.user_dropdown.log_out') }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "../../styles/index.scss";

.level :deep(svg) {
  --uno: "w-25px h-16px";
}

.level--senior :deep(svg) {
  --uno: "w-35px h-16px";
}

.level-next :deep(svg .level-bg) {
  --uno: "fill-#c9ccd0";
}

.lv6-entry--card {
  --uno: "w-full p-2 hover:bg-$bew-fill-1";
}

.channel-info-item {
  --uno: "relative py-1 px-2 m-0 text-sm flex flex-col items-center";

  & + .channel-info-item::before {
    content: "";
    position: absolute;
    left: -4px;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: var(--bew-border-color);
  }

  &:hover {
    background: transparent;

    .num,
    > div:last-child {
      color: var(--bew-theme-color);
    }
  }

  .num {
    --uno: "font-semibold text-xl transition-colors duration-200";

    + div {
      --uno: "text-$bew-text-2 mt-1 text-xs font-semibold transition-colors duration-200";
    }
  }
}
</style>
