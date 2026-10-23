<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import draggable from 'vuedraggable'

import AppAuthorizationDialog from '~/components/AppAuthorizationDialog.vue'
import Input from '~/components/Input.vue'
import Radio from '~/components/Radio.vue'
import { HomeSubPage } from '~/contentScripts/views/Home/types'
import { appAuthTokens, settings } from '~/logic'
import type { RecommendationModeOption, Settings, TabsPosition } from '~/logic/storage'
import { MIN_RECOMMENDATION_MODE_SWITCHER_OPTIONS } from '~/logic/storage'
import { useMainStore } from '~/stores/mainStore'
import { hasValidAppAuthTokens, revokeAccessKey } from '~/utils/authProvider'
import {
  applyRecommendationModeOption,
  createRecommendationModeOptions,
  getRecommendationModeOption,
} from '~/utils/recommendationMode'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SettingsSegmentedControl from '../../components/SettingsSegmentedControl.vue'
import SettingsToggleTag from '../../components/SettingsToggleTag.vue'
import SearchPage from '../SearchPage/SearchPage.vue'
import FilterByTitleTable from './components/FilterByTitleTable.vue'
import FilterByUserTable from './components/FilterByUserTable.vue'

const mainStore = useMainStore()
const { t } = useI18n()
const toast = useToast()

const recommendationModeOptions = computed(() => createRecommendationModeOptions(t))
const recommendationModeOption = computed({
  get: () => getRecommendationModeOption(),
  set: option => applyRecommendationModeOption(option),
})

const recommendationModeOptionIcons: Record<RecommendationModeOption, string> = {
  web: 'i-tabler-world',
  webNoCookie: 'i-tabler-spy',
  appSingle: 'i-tabler-layout-list',
  appDouble: 'i-tabler-layout-grid',
}

function getRecommendationModeLabel(mode: RecommendationModeOption) {
  return recommendationModeOptions.value.find(option => option.value === mode)?.label ?? mode
}

function handleToggleRecommendationModeSwitcherOption(item: Settings['recommendationModeSwitcherOptions'][number], visible: boolean) {
  if (!visible && settings.value.recommendationModeSwitcherOptions.filter(option => option.visible).length <= MIN_RECOMMENDATION_MODE_SWITCHER_OPTIONS)
    return
  item.visible = visible
}

const followingUploaderSortOptions = computed<{ label: string, value: Settings['followingUploaderSort'] }[]>(() => [
  { label: t('settings.following_sort_updated'), value: 'updated' },
  { label: t('settings.following_sort_group'), value: 'group' },
])

const homeTabsPositionOptions = computed<{ label: string, value: TabsPosition }[]>(() => [
  { label: t('common.position.left'), value: 'left' },
  { label: t('common.position.center'), value: 'center' },
])

const showSearchPageModeSharedSettings = ref<boolean>(false)
const showQRCodeDialog = ref<boolean>(false)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const appAccessToken = computed(() => appAuthTokens.value.accessToken)

function handleRecommendationModeChange(option: RecommendationModeOption) {
  if ((option === 'appSingle' || option === 'appDouble') && !hasValidAppAuthTokens())
    handleAuthorize()
}

function handleAuthorize() {
  showQRCodeDialog.value = true
}

function handleRevoke() {
  revokeAccessKey()
}

function handleCloseQRCodeDialog() {
  showQRCodeDialog.value = false
}

function handleExport(filterType: 'title' | 'user') {
  const filters = filterType === 'title' ? settings.value.filterByTitle : settings.value.filterByUser
  const jsonString = JSON.stringify(filters, null, 2) // Pretty print JSON
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `filter-by-${filterType}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImport(filterType: 'title' | 'user') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file)
      return

    try {
      const fileContent = await file.text()
      const importedFilters: unknown = JSON.parse(fileContent)

      if (!Array.isArray(importedFilters)
        || !importedFilters.every(filter => isRecord(filter)
          && typeof filter.keyword === 'string'
          && typeof filter.remark === 'string'
          && filter.keyword.trim() !== '')) {
        throw new Error('Invalid file format')
      }

      const normalized = importedFilters.map(filter => ({
        keyword: filter.keyword.trim(),
        remark: filter.remark.trim(),
      }))

      if (filterType === 'title') {
        settings.value.filterByTitle = normalized
      }
      else {
        settings.value.filterByUser = normalized
      }
      // toast.success(`${filterType} filters imported successfully`)
    }
    catch (error) {
      console.error(`Error importing filter by ${filterType}:`, error)
      toast.error(`Failed to import ${filterType} filters: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    finally {
      input.remove()
    }
  }
  input.click()
}

// Update the existing functions to use the new generic ones
function handleExportFilterByTitle() {
  handleExport('title')
}

function handleImportFilterByTitle() {
  handleImport('title')
}

function handleExportFilterByUser() {
  handleExport('user')
}

function handleImportFilterByUser() {
  handleImport('user')
}

function resetHomeTabs() {
  settings.value.homePageTabVisibilityList = mainStore.homeTabs.map((tab) => {
    return {
      page: tab.page,
      visible: tab.page !== HomeSubPage.Precious,
    }
  })
}

function getHomeTabLabel(page: HomeSubPage) {
  return t(mainStore.homeTabs.find(tab => tab.page === page)?.i18nKey ?? '')
}

function handleToggleHomeTab(tab: Settings['homePageTabVisibilityList'][number], visible: boolean) {
  // 至少保留一个可见标签
  if (!visible && settings.value.homePageTabVisibilityList.filter(item => item.visible).length <= 1)
    return
  tab.visible = visible
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_recommendation_mode')">
      <SettingsItem :title="$t('settings.recommendation_mode')" right-width="auto">
        <template #desc>
          <p>{{ $t('settings.recommendation_mode_desc') }}</p>
        </template>
        <SettingsSegmentedControl
          v-model="recommendationModeOption"
          :label="$t('settings.recommendation_mode')"
          :options="recommendationModeOptions"
          @change="handleRecommendationModeChange"
        />
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.show_recommendation_mode_switcher')"
        :desc="$t('settings.show_recommendation_mode_switcher_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showRecommendationModeSwitcher" />
      </SettingsItem>

      <SettingsItem
        v-if="settings.showRecommendationModeSwitcher"
        :title="$t('settings.recommendation_mode_switcher_options')"
        :desc="$t('settings.recommendation_mode_switcher_options_desc')"
      >
        <template #bottom>
          <draggable
            v-model="settings.recommendationModeSwitcherOptions"
            item-key="mode"
            class="settings-draggable-tags"
            :force-fallback="true"
            role="group"
            :aria-label="$t('settings.recommendation_mode_switcher_options')"
          >
            <template #item="{ element }">
              <SettingsToggleTag
                :model-value="element.visible"
                :label="getRecommendationModeLabel(element.mode)"
                :icon="recommendationModeOptionIcons[element.mode as RecommendationModeOption]"
                @update:model-value="handleToggleRecommendationModeSwitcherOption(element, $event)"
              />
            </template>
          </draggable>
        </template>
      </SettingsItem>

      <SettingsItem
        v-if="settings.recommendationMode === 'webNoCookie'"
        :title="$t('settings.remember_no_cookie_recommendation_state')"
        :desc="$t('settings.remember_no_cookie_recommendation_state_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.rememberNoCookieRecommendationState" />
      </SettingsItem>

      <SettingsItem v-if="settings.recommendationMode === 'app'" :title="$t('settings.authorize_app')" right-width="auto">
        <template #desc>
          {{ $t('settings.authorize_app_desc') }}
          <br>
          <a
            href="https://github.com/indefined/UserScripts/tree/master/bilibiliHome#%E6%8E%88%E6%9D%83%E8%AF%B4%E6%98%8E" target="_blank" color="$bew-theme-color"
          >{{ $t('settings.authorize_app_more_info_access_key') }}</a>
        </template>

        <div w-full>
          <Button v-if="!appAccessToken" type="primary" center @click="handleAuthorize">
            {{ $t('settings.btn.authorize') }}...
          </Button>
          <Button
            v-else type="secondary" center style="--b-button-text-color: var(--bew-error-color)"
            @click="handleRevoke"
          >
            {{ $t('settings.btn.revoke') }}
          </Button>
        </div>
      </SettingsItem>

      <SettingsItem :title="$t('settings.auto_switch_recommendation_mode')" :desc="$t('settings.auto_switch_recommendation_mode_desc')" right-width="auto">
        <Radio v-model="settings.autoSwitchRecommendationMode" />
      </SettingsItem>

      <SettingsItem :title="$t('settings.preserve_for_you_state')" :desc="$t('settings.preserve_for_you_state_desc')" right-width="auto">
        <Radio v-model="settings.preserveForYouState" />
      </SettingsItem>

      <AppAuthorizationDialog
        v-if="showQRCodeDialog"
        @close="handleCloseQRCodeDialog"
      />
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_immersive_mode')">
      <SettingsItem
        :title="$t('settings.show_immersive_mode_entry')"
        :desc="$t('settings.show_immersive_mode_entry_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showImmersiveModeEntry" />
      </SettingsItem>

      <template v-if="settings.showImmersiveModeEntry">
        <SettingsItem
          :title="$t('settings.immersive_wheel_switch')"
          :desc="$t('settings.immersive_wheel_switch_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.immersiveWheelSwitch" />
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.immersive_keyboard_switch')"
          :desc="$t('settings.immersive_keyboard_switch_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.immersiveKeyboardSwitch" />
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.immersive_auto_play')"
          :desc="$t('settings.immersive_auto_play_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.immersiveAutoPlay" />
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.immersive_auto_next')"
          :desc="$t('settings.immersive_auto_next_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.immersiveAutoNext" />
        </SettingsItem>

        <SettingsItem
          :title="$t('settings.immersive_preload_next')"
          :desc="$t('settings.immersive_preload_next_desc')"
          right-width="auto"
        >
          <Radio v-model="settings.immersivePreloadNext" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_home_tabs')"
    >
      <SettingsItem
        :title="$t('settings.home_tabs_adjustment')"
        :desc="$t('settings.home_tabs_adjustment_desc')"
        right-width="auto"
      >
        <template #title>
          <div flex="~ gap-4 items-center">
            {{ $t('settings.home_tabs_adjustment') }}
            <Button size="small" type="secondary" @click="resetHomeTabs">
              <template #left>
                <div i-mingcute:back-line />
              </template>
              {{ $t('common.operation.reset') }}
            </Button>
          </div>
        </template>

        <template #bottom>
          <draggable
            v-model="settings.homePageTabVisibilityList"
            item-key="page"
            class="settings-draggable-tags"
            :force-fallback="true"
            role="group"
            :aria-label="$t('settings.home_tabs_adjustment')"
          >
            <template #item="{ element }">
              <SettingsToggleTag
                :model-value="element.visible"
                :label="getHomeTabLabel(element.page)"
                @update:model-value="handleToggleHomeTab(element, $event)"
              />
            </template>
          </draggable>
        </template>
      </SettingsItem>
      <SettingsItem :title="$t('settings.home_tabs_position')" right-width="auto">
        <SettingsSegmentedControl
          v-model="settings.homeTabsPosition"
          :label="$t('settings.home_tabs_position')"
          :options="homeTabsPositionOptions"
        />
      </SettingsItem>
      <SettingsItem :title="$t('settings.fixed_home_tabs_on_home_page')" right-width="auto">
        <Radio v-model="settings.fixedHomeTabsOnHomePage" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_search_page_mode')">
      <SettingsItem :title="$t('settings.use_search_page_mode')" right-width="auto">
        <Radio v-model="settings.useSearchPageModeOnHomePage" />
      </SettingsItem>
      <template v-if="settings.useSearchPageModeOnHomePage">
        <SettingsItem :title="$t('settings.settings_shared_with_the_search_page')" right-width="auto">
          <template #desc>
            <span class="bew-warning-text">{{ $t('settings.settings_shared_with_the_search_page_desc') }}</span>
          </template>
          <Button type="secondary" center @click="showSearchPageModeSharedSettings = true">
            {{ $t('settings.btn.open_settings') }}
          </Button>

          <Dialog
            v-if="showSearchPageModeSharedSettings"
            width="80%"
            max-width="900px"
            content-height="64vh"
            :show-footer="false"
            :title="$t('settings.settings_shared_with_the_search_page')"
            append-to-bewly-body
            @close="showSearchPageModeSharedSettings = false"
          >
            <template #desc>
              <span class="bew-warning-text">{{ $t('settings.settings_shared_with_the_search_page_desc') }}</span>
            </template>

            <SearchPage />
          </Dialog>
        </SettingsItem>

        <SettingsItem :title="$t('settings.search_page_mode_wallpaper_fixed')" right-width="auto">
          <Radio v-model="settings.searchPageModeWallpaperFixed" />
        </SettingsItem>
      </template>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_recommendation_filters')"
      :desc="$t('settings.group_recommendation_filters_desc')"
    >
      <SettingsItem
        :title="$t('settings.show_recommendation_filter_risk_warning')"
        :desc="$t('settings.show_recommendation_filter_risk_warning_desc')"
        right-width="auto"
      >
        <Radio v-model="settings.showRecommendationFilterRiskWarning" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.disable_filters_for_followed_users')" :desc="$t('settings.disable_filters_for_followed_users_desc')" right-width="auto">
        <Radio v-model="settings.disableFilterForFollowedUser" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.filter_out_vertical_videos')" right-width="auto">
        <Radio v-model="settings.filterOutVerticalVideos" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.filter_by_view_count')" :desc="$t('settings.filter_by_view_count_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByViewCount }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByViewCount"
            v-model="settings.filterByViewCount" type="number" :min="1" :max="1000000"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_view_count_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByViewCount" />
        </div>
      </SettingsItem>
      <SettingsItem :title="$t('settings.filter_by_like_count')" :desc="$t('settings.filter_by_like_count_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByLikeCount }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByLikeCount"
            v-model="settings.filterByLikeCount" type="number" :min="1" :max="1000000"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_like_count_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByLikeCount" />
        </div>
      </SettingsItem>
      <SettingsItem :title="$t('settings.filter_by_duration')" :desc="$t('settings.filter_by_duration_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByDuration }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByDuration"
            v-model="settings.filterByDuration" type="number" :min="1" :max="1000000"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_duration_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByDuration" />
        </div>
      </SettingsItem>
      <SettingsItem :title="$t('settings.filter_by_publish_time')" :desc="$t('settings.filter_by_publish_time_desc')" right-width="auto">
        <div class="filter-control" :class="{ 'filter-control--enabled': settings.enableFilterByPublishTime }" flex="~ justify-end">
          <Input
            v-if="settings.enableFilterByPublishTime"
            v-model="settings.filterByPublishTime" type="number" :min="7" :max="365"
            flex-1
          >
            <template #suffix>
              {{ $t('settings.filter_by_publish_time_unit') }}
            </template>
          </Input>
          <Radio v-model="settings.enableFilterByPublishTime" />
        </div>
      </SettingsItem>

      <div grid="~ lg:gap-4 lg:cols-2 cols-1" lg:border="t-1 $bew-border-color">
        <SettingsItem
          class="unrestricted-width-settings-item"
          :title="$t('settings.filter_by_title')"
          right-width="auto"
          border="lg:none t-1 $bew-border-color"
        >
          <Radio v-model="settings.enableFilterByTitle" />
          <template v-if="settings.enableFilterByTitle" #bottom>
            <div text="$bew-text-2 sm" mb-2 v-html="$t('settings.filter_by_title_desc')" />
            <div flex="~ gap-2" mb-2>
              <Button type="secondary" size="small" @click="handleImportFilterByTitle">
                <template #left>
                  <div i-uil:import />
                </template>
                <input type="file" accept=".json" hidden>
                {{ $t('common.operation.import') }}
              </Button>
              <Button type="secondary" size="small" @click="handleExportFilterByTitle">
                <template #left>
                  <div i-uil:export />
                </template>
                {{ $t('common.operation.export') }}
              </Button>
            </div>

            <FilterByTitleTable />
          </template>
        </SettingsItem>
        <SettingsItem
          class="unrestricted-width-settings-item"
          :title="$t('settings.filter_by_user')"
          right-width="auto"
          border="lg:none b-1 $bew-border-color"
        >
          <Radio v-model="settings.enableFilterByUser" />
          <template v-if="settings.enableFilterByUser" #bottom>
            <div text="$bew-text-2 sm" mb-2 v-html="$t('settings.filter_by_user_desc')" />
            <div flex="~ gap-2" mb-2>
              <Button type="secondary" size="small" @click="handleImportFilterByUser">
                <template #left>
                  <div i-uil:import />
                </template>
                <input type="file" accept=".json" hidden>
                {{ $t('common.operation.import') }}
              </Button>
              <Button type="secondary" size="small" @click="handleExportFilterByUser">
                <template #left>
                  <div i-uil:export />
                </template>
                {{ $t('common.operation.export') }}
              </Button>
            </div>

            <FilterByUserTable />
          </template>
        </SettingsItem>
      </div>
    </SettingsItemGroup>

    <SettingsItemGroup
      :title="$t('settings.group_following')"
      :desc="$t('settings.group_following_desc')"
    >
      <SettingsItem :title="$t('settings.use_following_new_layout')" :desc="$t('settings.use_following_new_layout_desc')" right-width="auto">
        <Radio v-model="settings.useFollowingNewLayout" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.following_sort')" right-width="auto">
        <SettingsSegmentedControl
          v-model="settings.followingUploaderSort"
          :label="$t('settings.following_sort')"
          :options="followingUploaderSortOptions"
        />
      </SettingsItem>
      <SettingsItem :title="$t('settings.following_tab_show_livestreaming_videos')" right-width="auto">
        <Radio v-model="settings.followingTabShowLivestreamingVideos" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.following_filter_charging_videos')" :desc="$t('settings.following_filter_charging_videos_desc')" right-width="auto">
        <Radio v-model="settings.followingFilterChargingVideos" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.following_filter_dynamic_videos')" :desc="$t('settings.following_filter_dynamic_videos_desc')" right-width="auto">
        <Radio v-model="settings.followingFilterDynamicVideos" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
// 可拖拽排序的开关标签列表。使用 Sortable 的 fallback 拖拽：Firefox 不会在 <button> 上触发
// 原生 dragstart，且 fallback 会在拖动结束后拦截随之而来的 click，避免误切换可见性。
.settings-draggable-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bew-space-2);

  :deep(.settings-toggle-tag) {
    cursor: grab;
  }
}

.unrestricted-width-settings-item {
  :deep(.left-content) {
    --uno: w-full;
  }

  :deep(.right-content) {
    --uno: w-auto;
  }
}

.filter-control {
  width: auto;
}

.filter-control--enabled {
  width: 220px;
}
</style>
