<script setup lang="ts">
import browser from 'webextension-polyfill'

import { version } from '../../../../package.json'

interface GitHubCommitAuthor {
  login: string
  avatar_url: string
  html_url: string
  type: string
}

interface GitHubCommit {
  author: GitHubCommitAuthor | null
}

interface GitHubContributor {
  login: string
  avatar_url: string
  html_url: string
  type: string
  contributions: number
}

interface Contributor {
  login: string
  avatarUrl: string
  profileUrl: string
  contributions: number
}

const CONTRIBUTION_START_DATE = '2025-03-05T00:00:00Z'
const CONTRIBUTORS_CACHE_KEY = 'bewlycat-contributors-since-2025-03-05'
const HISTORY_CONTRIBUTORS_CACHE_KEY = 'bewlybewly-history-contributors'
const CONTRIBUTORS_CACHE_DURATION = 12 * 60 * 60 * 1000

const hasNewVersion = ref<boolean>(false)
const contributors = ref<Contributor[]>([])
const historyContributors = ref<Contributor[]>([])
const contributorsLoadFailed = ref(false)
const historyContributorsLoadFailed = ref(false)
const contributorImageFailures = ref<Record<string, true>>({})

const isDev = computed((): boolean => import.meta.env.DEV)

onMounted(() => {
  checkGitHubRelease()
  loadContributors()
  loadHistoryContributors()
})

async function checkGitHubRelease() {
  const apiUrl = `https://api.github.com/repos/keleus/BewlyCat/releases/latest`

  try {
    const response = await fetch(apiUrl)
    if (!response.ok)
      throw new Error('Network response was not ok')

    const data = await response.json()
    const latestVersion = data.tag_name

    // Here you can compare `latestVersion` with your current version
    const currentVersion = `v${version}` // Replace with your actual current version

    if (latestVersion !== currentVersion)
      hasNewVersion.value = true
  }
  catch {
  }
}

function readContributorCache(cacheKey: string): Contributor[] | null {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as {
      timestamp?: number
      contributors?: Contributor[]
    } | null

    if (
      cached?.timestamp
      && cached.contributors
      && Date.now() - cached.timestamp < CONTRIBUTORS_CACHE_DURATION
    ) {
      return cached.contributors
    }
  }
  catch {
  }

  return null
}

function writeContributorCache(cacheKey: string, items: Contributor[]) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      contributors: items,
    }))
  }
  catch {
  }
}

async function loadContributors() {
  const cached = readContributorCache(CONTRIBUTORS_CACHE_KEY)
  if (cached) {
    contributors.value = cached
    return
  }

  try {
    const contributionMap = new Map<string, Contributor>()

    for (let page = 1; page <= 20; page++) {
      const apiUrl = new URL('https://api.github.com/repos/keleus/BewlyCat/commits')
      apiUrl.searchParams.set('since', CONTRIBUTION_START_DATE)
      apiUrl.searchParams.set('per_page', '100')
      apiUrl.searchParams.set('page', String(page))

      const response = await fetch(apiUrl)
      if (!response.ok)
        throw new Error('Unable to load contributors')

      const commits = await response.json() as GitHubCommit[]
      for (const commit of commits) {
        const author = commit.author
        if (!author || author.type === 'Bot' || author.login.endsWith('[bot]'))
          continue

        const existing = contributionMap.get(author.login)
        if (existing) {
          existing.contributions++
        }
        else {
          contributionMap.set(author.login, {
            login: author.login,
            avatarUrl: author.avatar_url,
            profileUrl: author.html_url,
            contributions: 1,
          })
        }
      }

      if (commits.length < 100)
        break
    }

    contributors.value = [...contributionMap.values()]
      .sort((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login))

    if (contributors.value.length === 0)
      throw new Error('No contributors found')

    writeContributorCache(CONTRIBUTORS_CACHE_KEY, contributors.value)
  }
  catch {
    contributorsLoadFailed.value = true
  }
}

async function loadHistoryContributors() {
  const cached = readContributorCache(HISTORY_CONTRIBUTORS_CACHE_KEY)
  if (cached) {
    historyContributors.value = cached
    return
  }

  try {
    const items: Contributor[] = []

    for (let page = 1; page <= 10; page++) {
      const apiUrl = new URL('https://api.github.com/repos/hakadao/BewlyBewly/contributors')
      apiUrl.searchParams.set('per_page', '100')
      apiUrl.searchParams.set('page', String(page))

      const response = await fetch(apiUrl)
      if (!response.ok)
        throw new Error('Unable to load historical contributors')

      const pageItems = await response.json() as GitHubContributor[]
      items.push(...pageItems
        .filter(item => item.type !== 'Bot' && !item.login.endsWith('[bot]'))
        .map(item => ({
          login: item.login,
          avatarUrl: item.avatar_url,
          profileUrl: item.html_url,
          contributions: item.contributions,
        })))

      if (pageItems.length < 100)
        break
    }

    if (items.length === 0)
      throw new Error('No historical contributors found')

    historyContributors.value = items
      .sort((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login))
    writeContributorCache(HISTORY_CONTRIBUTORS_CACHE_KEY, historyContributors.value)
  }
  catch {
    historyContributorsLoadFailed.value = true
  }
}

function handleContributorImageError(login: string) {
  contributorImageFailures.value = {
    ...contributorImageFailures.value,
    [login]: true,
  }
}
</script>

<template>
  <div>
    <div max-w-800px mx-auto>
      <div relative w-200px m-auto>
        <img
          :src="`${browser.runtime.getURL('/assets/icon-512.png')}`" alt="" width="200"
        >

        <a
          v-if="hasNewVersion"
          href="https://github.com/keleus/BewlyCat/releases" target="_blank"
          pos="absolute bottom-0 right-0" transform="translate-x-50%" un-text="xs $bew-text-1" p="y-1 x-2" bg="$bew-fill-1"
          rounded-12
        >
          NEW
        </a>
      </div>
      <section text-2xl text-center mt-2>
        <p flex="inline gap-2" fw-900>
          <span>BewlyCat</span>
          <span
            v-if="isDev"
            inline-block text="$bew-warning-color"
          >
            Dev
          </span>
        </p>
        <p text-center>
          <a
            href="https://github.com/keleus/BewlyCat/releases" target="_blank"
            un-text="sm color-$bew-text-2 hover:color-$bew-text-3"
          >
            v{{ version }}
          </a>
        </p>
      </section>

      <section
        style="box-shadow: var(--bew-shadow-1), var(--bew-shadow-edge-glow-1);"
        mt-6 p-4 bg="$bew-fill-alt" rounded="$bew-radius"
        flex="~ col items-center gap-6"
      >
        <section w-full>
          <h3 class="title">
            {{ $t('settings.links') }}
          </h3>
          <div grid="~ xl:cols-6 lg:cols-5 md:cols-4 cols-3 gap-2">
            <a
              href="https://github.com/keleus/BewlyCat" target="_blank"
              class="link-card"
              bg="black dark:white !opacity-10 !hover:opacity-20"
              un-text="black dark:white"
            >
              <div i-tabler:brand-github /> GitHub
            </a>
            <a
              href="https://space.bilibili.com/32487218/dynamic" target="_blank"
              class="link-card"
              bg="#fb7299 dark:#ffa7c0 !opacity-10 !hover:opacity-20"
              un-text="#fb7299 dark:#ffa7c0"
            >
              <div i-tabler:brand-bilibili /> Bilibili
            </a>
            <a
              href="https://www.xiaohongshu.com/user/profile/5fb77085000000000100060d" target="_blank"
              class="link-card"
              bg="#FF2442 dark:#D7223A !opacity-10 !hover:opacity-20"
              un-text="#FF2442 dark:#D7223A"
            >
              <div i-tabler:book-2 /> 小红书
            </a>
          </div>
        </section>
        <div class="contributors-grid">
          <section>
            <h3 class="title">
              {{ $t('settings.current_contributors') }}
            </h3>
            <p v-if="contributorsLoadFailed" class="contributors-error">
              {{ $t('settings.contributors_image_failed') }}
            </p>
            <div v-else class="contributors-list">
              <a
                v-for="contributor in contributors"
                :key="contributor.login"
                :href="contributor.profileUrl"
                target="_blank"
                class="contributor"
                :title="`${contributor.login}: ${contributor.contributions}`"
              >
                <span v-if="contributorImageFailures[contributor.login]" class="contributor-image-fallback">
                  {{ $t('settings.contributors_image_failed') }}
                </span>
                <img
                  v-else
                  :src="contributor.avatarUrl"
                  :alt="contributor.login"
                  loading="lazy"
                  @error="handleContributorImageError(contributor.login)"
                >
                <span>{{ contributor.login }}</span>
              </a>
            </div>
          </section>
          <section>
            <h3 class="title">
              {{ $t('settings.contributors') }}
            </h3>
            <p v-if="historyContributorsLoadFailed" class="contributors-error">
              {{ $t('settings.contributors_image_failed') }}
            </p>
            <div v-else class="contributors-list">
              <a
                v-for="contributor in historyContributors"
                :key="contributor.login"
                :href="contributor.profileUrl"
                target="_blank"
                class="contributor"
                :title="`${contributor.login}: ${contributor.contributions}`"
              >
                <span v-if="contributorImageFailures[contributor.login]" class="contributor-image-fallback">
                  {{ $t('settings.contributors_image_failed') }}
                </span>
                <img
                  v-else
                  :src="contributor.avatarUrl"
                  :alt="contributor.login"
                  loading="lazy"
                  @error="handleContributorImageError(contributor.login)"
                >
                <span>{{ contributor.login }}</span>
              </a>
            </div>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.btn {
  --b-button-color: var(--bew-fill-1);
  --b-button-color-hover: var(--bew-fill-2);
}

.title {
  --uno: "fw-bold mb-2";
}

.contributors-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  width: 100%;

  section {
    min-width: 0;
  }

  img {
    display: block;
  }
}

.contributors-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  gap: 4px;
}

.contributor {
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  min-width: 0;
  padding: 3px 1px;
  color: var(--bew-text-2);
  border-radius: var(--bew-radius);
  font-size: 12px;
  transition: background-color 0.2s ease;

  &:hover {
    color: var(--bew-text-1);
    background: var(--bew-fill-2);
  }

  img,
  .contributor-image-fallback {
    width: 52px;
    height: 52px;
    border-radius: 50%;
  }

  img {
    object-fit: cover;
  }

  > span:not(.contributor-image-fallback) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.contributor-image-fallback {
  display: grid;
  place-items: center;
  padding: 6px;
  color: var(--bew-error-color);
  text-align: center;
  background: var(--bew-fill-1);
  font-size: 9px;
  line-height: 1.2;
}

.contributors-error {
  padding: 14px;
  color: var(--bew-error-color);
  text-align: center;
  background: var(--bew-fill-1);
  border-radius: var(--bew-radius);
}

.link-card {
  --uno: "w-full h-48px px-4 py-2 flex items-center rounded-$bew-radius";
  --uno: "duration-300";

  > div {
    --uno: "mr-2 shrink-0";
  }
}
</style>
