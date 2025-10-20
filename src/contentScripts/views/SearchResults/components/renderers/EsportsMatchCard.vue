<script setup lang="ts">
import { computed } from 'vue'

interface Team {
  ID: number
  title: string
  logo: string
  logoFull: string
}

interface Contest {
  ID: number
  gameStage: string
  stime: number
  homeTeam: Team
  awayTeam: Team
  homeScore?: number
  awayScore?: number
  season: {
    title: string
  }
  playback?: string
  jumpURL?: string
  contestStatus: number // 1: 未开始, 2: 进行中, 3: 已结束
}

const props = defineProps<{
  contest: Contest
  cardWidth?: string
}>()

const matchUrl = computed(() => {
  return props.contest.playback || props.contest.jumpURL || ''
})

const cardStyle = computed(() => {
  return {
    width: props.cardWidth || '250px',
    minWidth: props.cardWidth || '250px',
  }
})

// 判断比赛是否已结束
const isFinished = computed(() => {
  return props.contest.contestStatus === 3
})

// 判断比赛是否未开始
const isNotStarted = computed(() => {
  return props.contest.contestStatus === 1
})

// 格式化比赛时间
const matchTime = computed(() => {
  if (!props.contest.stime)
    return ''
  const date = new Date(props.contest.stime * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
})

// 获取主队比分（如果没有则默认为0）
const homeScore = computed(() => {
  if (props.contest.homeScore !== undefined && props.contest.homeScore !== null) {
    return props.contest.homeScore
  }
  // 如果比赛已结束或进行中，没有比分则显示0
  return !isNotStarted.value ? 0 : null
})

// 获取客队比分（如果没有则默认为0）
const awayScore = computed(() => {
  if (props.contest.awayScore !== undefined && props.contest.awayScore !== null) {
    return props.contest.awayScore
  }
  // 如果比赛已结束或进行中，没有比分则显示0
  return !isNotStarted.value ? 0 : null
})
</script>

<template>
  <a
    :href="matchUrl"
    target="_blank"
    class="esports-match-card"
    :style="cardStyle"
    rounded="$bew-radius"
    block
    cursor="pointer"
    duration-300
    @click.stop=""
  >
    <div class="card-content">
      <!-- 赛事标题和状态 -->
      <div class="header-container">
        <div text="base" font-bold class="season-title keep-one-line">
          {{ contest.season.title }}
        </div>
        <!-- 状态标签 -->
        <div text="sm" class="status-badge" :class="{ finished: isFinished, live: !isNotStarted && !isFinished, upcoming: isNotStarted }">
          <template v-if="isFinished">已结束</template>
          <template v-else-if="isNotStarted">未开始</template>
          <template v-else>进行中</template>
        </div>
      </div>

      <!-- 比赛阶段和时间 -->
      <div text="xs" class="match-info">
        <span class="game-stage-inline">{{ contest.gameStage }}</span>
        <span v-if="isNotStarted" class="match-time">{{ matchTime }}</span>
      </div>

      <!-- 队伍信息 -->
      <div class="teams-container">
        <!-- 主队 -->
        <div class="team">
          <img
            :src="contest.homeTeam.logoFull"
            :alt="contest.homeTeam.title"
            class="team-logo"
          >
          <div text="sm" class="team-name keep-one-line">
            {{ contest.homeTeam.title }}
          </div>
        </div>

        <!-- 比分或VS -->
        <div class="score-container">
          <template v-if="isNotStarted">
            <span class="vs-text">VS</span>
          </template>
          <template v-else>
            <span class="score">{{ homeScore }}</span>
            <span class="score-divider">:</span>
            <span class="score">{{ awayScore }}</span>
          </template>
        </div>

        <!-- 客队 -->
        <div class="team">
          <img
            :src="contest.awayTeam.logoFull"
            :alt="contest.awayTeam.title"
            class="team-logo"
          >
          <div text="sm" class="team-name keep-one-line">
            {{ contest.awayTeam.title }}
          </div>
        </div>
      </div>

    </div>
  </a>
</template>

<style scoped lang="scss">
.esports-match-card {
  background: var(--bew-elevated);
  transition: all 0.3s ease;
  aspect-ratio: 5 / 3; // 固定宽高比 5:3
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
}

.card-content {
  height: 100%;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.header-container {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.season-title {
  color: var(--bew-text-1);
  flex: 1;
  min-width: 0;
}

.status-badge {
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.2;

  &.finished {
    background: var(--bew-fill-2);
    color: var(--bew-text-3);
  }

  &.live {
    background: #ff4d4f;
    color: white;
  }

  &.upcoming {
    background: var(--bew-theme-color-20);
    color: var(--bew-theme-color);
  }
}

.match-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  color: var(--bew-text-3);
}

.game-stage-inline {
  color: var(--bew-text-3);
}

.match-time {
  color: var(--bew-text-3);
}

.teams-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex: 1;
}

.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 28%;
  min-width: 0;
}

.team-logo {
  width: 100%;
  max-width: 4rem;
  aspect-ratio: 1;
  border-radius: var(--bew-radius);
  object-fit: cover;
  margin-bottom: 0.375rem;
}

.team-name {
  color: var(--bew-text-1);
  text-align: center;
  width: 100%;
}

.score-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex-shrink: 0;
  min-width: 5rem;
}

.score {
  font-size: 1.75rem;
  font-weight: bold;
  color: var(--bew-text-1);
  line-height: 1;
  min-width: 1.5rem;
  text-align: center;
}

.score-divider {
  font-size: 1.25rem;
  color: var(--bew-text-3);
  line-height: 1;
}

.vs-text {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--bew-text-2);
  line-height: 1;
}

.footer-container {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.75rem;
}

.game-stage {
  font-size: 0.75rem;
  color: var(--bew-text-3);
  padding: 0.25rem 0.5rem;
  background: var(--bew-fill-2);
  border-radius: var(--bew-radius);
  text-align: center;
}
</style>
