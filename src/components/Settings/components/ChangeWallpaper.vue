<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Select from '~/components/Select.vue'
import { useDark } from '~/composables/useDark'
import { WALLPAPERS } from '~/constants/imgs'
import { localSettings, localSettingsReady, settings } from '~/logic'
import {
  extractWallpaperId,
  hasLocalWallpaper,
  isLocalWallpaperUrl,
  localWallpapersLoaded,
  removeLocalWallpaper,
  resolveWallpaperUrl,
  storeLocalWallpaper,
} from '~/utils/localWallpaper'
import { compressAndResizeImage } from '~/utils/main'
import type { LocalWallpaperSlotKey, WallpaperSettingKey } from '~/utils/wallpaper'
import { LOCAL_WALLPAPER_SLOT_KEYS, WALLPAPER_SETTING_KEYS } from '~/utils/wallpaper'

import SettingsItem from './SettingsItem.vue'
import SettingsItemGroup from './SettingsItemGroup.vue'

const props = defineProps<Props>()

interface Props {
  type: 'global' | 'searchPage'
}
type WallpaperMode = 'buildIn' | 'byUrl'
type EditingTheme = 'light' | 'dark'

const { t } = useI18n()
const { isDark } = useDark()
const uploadWallpaperRef = ref<HTMLInputElement | null>(null)
const editingTheme = ref<EditingTheme>(isDark.value ? 'dark' : 'light')

const isGlobal = computed(() => props.type === 'global')

function hasAnyActiveGlobalWallpaper() {
  return Boolean(
    settings.value.wallpaper ||
    (settings.value.individuallySetDarkModeWallpaper && settings.value.darkModeWallpaper),
  )
}

const individuallySetDarkModeWallpaper = computed<boolean>({
  get: () =>
    isGlobal.value
      ? settings.value.individuallySetDarkModeWallpaper
      : settings.value.searchPageIndividuallySetDarkModeWallpaper,
  set: (enabled) => {
    if (isGlobal.value) settings.value.individuallySetDarkModeWallpaper = enabled
    else settings.value.searchPageIndividuallySetDarkModeWallpaper = enabled

    if (enabled) {
      editingTheme.value = isDark.value ? 'dark' : 'light'
      const lightUrl = isGlobal.value
        ? settings.value.wallpaper
        : settings.value.searchPageWallpaper
      const lightMode = isGlobal.value
        ? settings.value.wallpaperMode
        : settings.value.searchPageWallpaperMode
      const darkUrl = isGlobal.value
        ? settings.value.darkModeWallpaper
        : settings.value.searchPageDarkModeWallpaper

      // 首次开启且深色模式尚未设置壁纸时，沿用当前浅色壁纸，避免切开开关后深色模式立即变空。
      if (!darkUrl && lightUrl) {
        const canCopyLocal =
          !isLocalWallpaper(lightUrl) ||
          !localSettings.value.locallyUploadedDarkWallpaper ||
          localSettings.value.locallyUploadedDarkWallpaper.url === lightUrl

        if (canCopyLocal) {
          if (isGlobal.value) {
            settings.value.darkModeWallpaperMode = lightMode
            settings.value.darkModeWallpaper = lightUrl
          } else {
            settings.value.searchPageDarkModeWallpaperMode = lightMode
            settings.value.searchPageDarkModeWallpaper = lightUrl
          }

          if (
            isLocalWallpaper(lightUrl) &&
            !localSettings.value.locallyUploadedDarkWallpaper &&
            localSettings.value.locallyUploadedWallpaper?.url === lightUrl
          ) {
            localSettings.value.locallyUploadedDarkWallpaper = {
              ...localSettings.value.locallyUploadedWallpaper,
            }
          }
        }
      }
    } else if (isGlobal.value && !settings.value.wallpaper) {
      settings.value.enableWallpaperMasking = false
    }
  },
})

const isEditingDark = computed(
  () => individuallySetDarkModeWallpaper.value && editingTheme.value === 'dark',
)

const activeWallpaperKey = computed<WallpaperSettingKey>(() => {
  if (isGlobal.value) return isEditingDark.value ? 'darkModeWallpaper' : 'wallpaper'
  return isEditingDark.value ? 'searchPageDarkModeWallpaper' : 'searchPageWallpaper'
})

const activeLocalSlotKey = computed<LocalWallpaperSlotKey>(() =>
  isEditingDark.value ? 'locallyUploadedDarkWallpaper' : 'locallyUploadedWallpaper',
)

const activeLocalWallpaper = computed(() => localSettings.value[activeLocalSlotKey.value])

const wallpaperMode = computed<WallpaperMode>({
  get: () => {
    if (isGlobal.value)
      return isEditingDark.value
        ? settings.value.darkModeWallpaperMode
        : settings.value.wallpaperMode
    return isEditingDark.value
      ? settings.value.searchPageDarkModeWallpaperMode
      : settings.value.searchPageWallpaperMode
  },
  set: changeWallpaperType,
})

const isBuildInWallpaper = computed(() => wallpaperMode.value === 'buildIn')

const currentWallpaper = computed<string>({
  get: () => settings.value[activeWallpaperKey.value],
  set: changeWallpaper,
})

const wallpaperModeOptions = computed<{ label: string; value: WallpaperMode }[]>(() => [
  { label: t('settings.wallpaper_mode_opt.build_in'), value: 'buildIn' },
  { label: t('settings.wallpaper_mode_opt.by_url'), value: 'byUrl' },
])

// 计算本地壁纸的实际显示URL
const localWallpaperDisplayUrl = computed(() => {
  const localWallpaper = activeLocalWallpaper.value
  if (!localWallpaper?.url) {
    return null
  }

  // 使用新的解析函数
  return resolveWallpaperUrl(localWallpaper.url)
})

// 检查是否为本地壁纸URL
function isLocalWallpaper(url: string): boolean {
  return isLocalWallpaperUrl(url)
}

function isLocalWallpaperIdReferencedElsewhere(
  id: string,
  excludeSlotKey: LocalWallpaperSlotKey,
  excludeSettingKey?: WallpaperSettingKey,
): boolean {
  const expectedUrl = `local-wallpaper:${id}`
  const usedByOtherSlot = LOCAL_WALLPAPER_SLOT_KEYS.some(
    (slotKey) => slotKey !== excludeSlotKey && localSettings.value[slotKey]?.id === id,
  )
  if (usedByOtherSlot) return true

  return WALLPAPER_SETTING_KEYS.some(
    (settingKey) => settingKey !== excludeSettingKey && settings.value[settingKey] === expectedUrl,
  )
}

function setWallpaperForKey(settingKey: WallpaperSettingKey, url: string) {
  const affectsGlobal = settingKey === 'wallpaper' || settingKey === 'darkModeWallpaper'
  const hadActiveGlobal = affectsGlobal && hasAnyActiveGlobalWallpaper()

  settings.value[settingKey] = url

  if (affectsGlobal) {
    const hasActiveGlobal = hasAnyActiveGlobalWallpaper()
    // 首次设置全局壁纸时自动开启遮罩，防止文字难以辨认；全部清空后关闭遮罩。
    if (!hadActiveGlobal && hasActiveGlobal) settings.value.enableWallpaperMasking = true
    else if (!hasActiveGlobal) settings.value.enableWallpaperMasking = false
  }
}

function changeWallpaperType(type: WallpaperMode) {
  if (isGlobal.value) {
    if (isEditingDark.value) settings.value.darkModeWallpaperMode = type
    else settings.value.wallpaperMode = type
  } else {
    if (isEditingDark.value) settings.value.searchPageDarkModeWallpaperMode = type
    else settings.value.searchPageWallpaperMode = type
  }

  // Set the active wallpaper to empty if it's a locally uploaded wallpaper to prevent the `QUOTA_BYTES quota exceeded` error
  if (type === 'byUrl') {
    const activeUrl = settings.value[activeWallpaperKey.value]
    if (activeUrl.startsWith('data:image/') || isLocalWallpaper(activeUrl)) changeWallpaper('')
  }
}

function changeWallpaper(url: string) {
  setWallpaperForKey(activeWallpaperKey.value, url)
}

function fileToBase64(inputFile: File) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(inputFile)
    reader.onload = () => resolve(reader.result)
    reader.onerror = (error) => reject(error)
  })
}

function triggerUploadWallpaper() {
  uploadWallpaperRef.value?.click()
}

function handleLocalWallpaperClick() {
  const localWallpaperUrl = activeLocalWallpaper.value?.url
  if (localWallpaperUrl) changeWallpaper(localWallpaperUrl)
  else triggerUploadWallpaper()
}

async function handleUploadWallpaper(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  const targetSlotKey = activeLocalSlotKey.value
  const targetSettingKey = activeWallpaperKey.value

  compressAndResizeImage(file, 2560, 1440, 0.9, async (compressedFile: File) => {
    try {
      // 转换为base64
      const base64 = (await fileToBase64(compressedFile)) as string

      // 仅在旧本地壁纸不再被其他主题或页面引用时清理存储
      const previousWallpaper = localSettings.value[targetSlotKey]
      if (
        previousWallpaper?.isLocal &&
        previousWallpaper.id &&
        !isLocalWallpaperIdReferencedElsewhere(
          previousWallpaper.id,
          targetSlotKey,
          targetSettingKey,
        )
      ) {
        removeLocalWallpaper(previousWallpaper.id)
      }

      // 存储到本地storage
      const localWallpaperRef = await storeLocalWallpaper(compressedFile, base64)

      // 使用特殊标识符作为壁纸URL，而不是base64
      const localWallpaperUrl = `local-wallpaper:${localWallpaperRef.id}`
      setWallpaperForKey(targetSettingKey, localWallpaperUrl)

      // 保存本地壁纸引用（不包含base64数据）
      localSettings.value[targetSlotKey] = {
        ...localWallpaperRef,
        url: localWallpaperUrl, // 使用标识符而不是base64
      }
    } catch (error) {
      console.error('上传壁纸失败:', error)
    }
  })
}

function handleRemoveCustomWallpaper() {
  const slotKey = activeLocalSlotKey.value
  const settingKey = activeWallpaperKey.value
  const removedWallpaper = localSettings.value[slotKey]

  localSettings.value[slotKey] = null

  if (removedWallpaper?.url && settings.value[settingKey] === removedWallpaper.url) {
    setWallpaperForKey(settingKey, '')
  }

  if (removedWallpaper?.isLocal && removedWallpaper.id) {
    const usedByOtherSlot = LOCAL_WALLPAPER_SLOT_KEYS.some(
      (otherSlotKey) =>
        otherSlotKey !== slotKey && localSettings.value[otherSlotKey]?.id === removedWallpaper.id,
    )
    if (!usedByOtherSlot) {
      removeLocalWallpaper(removedWallpaper.id)
      for (const key of WALLPAPER_SETTING_KEYS) {
        if (settings.value[key] === removedWallpaper.url) setWallpaperForKey(key, '')
      }
    }
  }
}

// 检查本地壁纸是否有效，如果无效则清理
async function validateLocalWallpaper() {
  const [, wallpapersLoaded] = await Promise.all([localSettingsReady, localWallpapersLoaded])
  if (!wallpapersLoaded) return

  for (const slotKey of LOCAL_WALLPAPER_SLOT_KEYS) {
    const localWallpaper = localSettings.value[slotKey]
    if (localWallpaper?.isLocal && localWallpaper.id && !hasLocalWallpaper(localWallpaper.id)) {
      localSettings.value[slotKey] = null
    }
  }

  for (const settingKey of WALLPAPER_SETTING_KEYS) {
    const id = extractWallpaperId(settings.value[settingKey])
    if (id && !hasLocalWallpaper(id)) {
      setWallpaperForKey(settingKey, '')
    }
  }
}

// 组件挂载时验证本地壁纸
onMounted(() => {
  void validateLocalWallpaper()
})
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_wallpaper')">
    <SettingsItem
      v-if="!isGlobal"
      :title="$t('settings.individually_set_search_page_wallpaper')"
      right-width="auto"
    >
      <template #desc>
        <span class="bew-warning-text">{{ $t('common.performance_impact_warn') }}</span>
      </template>

      <Radio v-model="settings.individuallySetSearchPageWallpaper" />
    </SettingsItem>

    <template v-if="isGlobal || (settings.individuallySetSearchPageWallpaper && !isGlobal)">
      <SettingsItem
        :title="$t('settings.individually_set_dark_mode_wallpaper')"
        :desc="$t('settings.individually_set_dark_mode_wallpaper_desc')"
        right-width="auto"
      >
        <Radio v-model="individuallySetDarkModeWallpaper" />
      </SettingsItem>

      <SettingsItem
        v-if="individuallySetDarkModeWallpaper"
        :title="$t('settings.wallpaper_theme_target')"
        right-width="auto"
      >
        <div
          class="bew-segment-control bew-segment-control--surface bew-segment-control--static"
          role="radiogroup"
          :aria-label="$t('settings.wallpaper_theme_target')"
        >
          <button
            type="button"
            class="bew-segment-control__item"
            :data-active="editingTheme === 'light'"
            role="radio"
            :aria-checked="editingTheme === 'light'"
            @click="editingTheme = 'light'"
          >
            <span class="bew-segment-control__icon i-mingcute:sun-line" aria-hidden="true" />
            <span>{{ $t('settings.theme_opt.light') }}</span>
          </button>
          <button
            type="button"
            class="bew-segment-control__item"
            :data-active="editingTheme === 'dark'"
            role="radio"
            :aria-checked="editingTheme === 'dark'"
            @click="editingTheme = 'dark'"
          >
            <span class="bew-segment-control__icon i-mingcute:moon-line" aria-hidden="true" />
            <span>{{ $t('settings.theme_opt.dark') }}</span>
          </button>
        </div>
      </SettingsItem>

      <SettingsItem
        :title="$t('settings.wallpaper_mode')"
        :desc="$t('settings.wallpaper_mode_desc')"
        right-width="auto"
      >
        <Select
          v-model="wallpaperMode"
          :aria-label="$t('settings.wallpaper_mode')"
          :options="wallpaperModeOptions"
          w="160px"
        />
      </SettingsItem>

      <SettingsItem v-if="isBuildInWallpaper" :title="$t('settings.choose_ur_wallpaper')">
        <template #bottom>
          <div grid="~ xl:cols-5 lg:cols-4 cols-3 gap-4">
            <picture
              class="bew-settings-option--lift"
              aspect-video
              bg="$bew-fill-1"
              rounded="$bew-radius"
              overflow-hidden
              un-border="4 transparent"
              cursor-pointer
              grid
              place-items-center
              :class="{ 'selected-wallpaper': currentWallpaper === '' }"
              @click="changeWallpaper('')"
            >
              <div i-tabler:photo-off text="size-$bew-icon-size-xl $bew-text-3" />
            </picture>

            <Tooltip
              v-for="item in WALLPAPERS"
              :key="item.url"
              placement="top"
              :content="item.name"
              aspect-video
            >
              <picture
                class="bew-settings-option--lift"
                aspect-video
                bg="$bew-fill-1"
                rounded="$bew-radius"
                overflow-hidden
                un-border="4 transparent"
                w-full
                :class="{ 'selected-wallpaper': currentWallpaper === item.url }"
                @click="changeWallpaper(item.url)"
              >
                <img
                  :src="item.thumbnail || item.url"
                  :alt="item.name"
                  w-full
                  h-full
                  object-cover
                  class="img-no-error"
                />
              </picture>
            </Tooltip>

            <Tooltip placement="top" :content="activeLocalWallpaper?.name || ''" aspect-video>
              <!-- Upload wallpaper input -->
              <input
                ref="uploadWallpaperRef"
                type="file"
                accept="image/*"
                hidden
                @change="handleUploadWallpaper"
              />

              <picture
                class="group bew-settings-option--lift"
                :class="{
                  'selected-wallpaper':
                    !!activeLocalWallpaper?.url && currentWallpaper === activeLocalWallpaper.url,
                }"
                aspect-video
                bg="$bew-fill-1"
                rounded="$bew-radius"
                overflow-hidden
                un-border="4 transparent"
                w-full
                flex="~ items-center justify-center"
                @click="handleLocalWallpaperClick"
              >
                <div
                  v-if="activeLocalWallpaper"
                  class="opacity-0 group-hover:opacity-100"
                  duration-300
                  pos="absolute top-1 right-1"
                  z-1
                  flex="~ gap-1"
                  :style="{
                    fontSize: 'var(--bew-font-size-control)',
                    lineHeight: 'var(--bew-line-height-control)',
                  }"
                >
                  <button
                    style="backdrop-filter: var(--bew-filter-glass-1)"
                    bg="$bew-content"
                    rounded-full
                    w-28px
                    h-28px
                    grid
                    place-items-center
                    @click.stop="triggerUploadWallpaper"
                  >
                    <i i-mingcute:edit-2-line />
                  </button>
                  <button
                    style="backdrop-filter: var(--bew-filter-glass-1)"
                    bg="$bew-content"
                    rounded-full
                    w-28px
                    h-28px
                    grid
                    place-items-center
                    @click.stop="handleRemoveCustomWallpaper"
                  >
                    <i i-mingcute:delete-2-line />
                  </button>
                </div>
                <div v-if="!activeLocalWallpaper" absolute w-full h-full grid place-items-center>
                  <div i-tabler:photo-up text="size-$bew-icon-size-xl $bew-text-3" />
                </div>
                <img
                  v-else
                  :src="localWallpaperDisplayUrl || activeLocalWallpaper.url"
                  :alt="activeLocalWallpaper.name"
                  w-full
                  h-full
                  object-cover
                />
              </picture>
            </Tooltip>
          </div>
        </template>
      </SettingsItem>
      <SettingsItem v-else :title="$t('settings.image_url')">
        <template #bottom>
          <div flex items-center gap-4>
            <picture
              aspect-video
              bg="$bew-fill-1"
              rounded="$bew-radius"
              overflow-hidden
              un-border="4 transparent"
              cursor-pointer
              shrink-0
              w="xl:1/5 lg:1/4 md:1/3"
            >
              <img
                v-if="currentWallpaper"
                :key="currentWallpaper"
                :src="currentWallpaper"
                alt=""
                loading="lazy"
                w-full
                h-full
                object-cover
                onerror="
                  this.style.display = 'none'
                  this.onerror = null
                "
              />
            </picture>
            <div>
              <Input v-model="currentWallpaper" w-full />
              <p color="sm $bew-text-3" mt-2>
                {{ $t('settings.image_url_hint') }}
              </p>
            </div>
          </div>
        </template>
      </SettingsItem>

      <!-- 缓存时间设置 - 对所有URL壁纸生效 -->
      <SettingsItem :title="$t('settings.wallpaper_cache_time')" right-width="auto">
        <template #desc>
          {{ $t('settings.wallpaper_cache_time_desc') }}
        </template>
        <Input
          v-if="isGlobal"
          v-model="settings.wallpaperCacheTime"
          type="number"
          :min="0"
          :max="168"
          placeholder="0"
          w-100px
        >
          <template #suffix>
            <span text="sm $bew-text-2">h</span>
          </template>
        </Input>
        <Input
          v-else
          v-model="settings.searchPageWallpaperCacheTime"
          type="number"
          :min="0"
          :max="168"
          placeholder="0"
          w-100px
        >
          <template #suffix>
            <span text="sm $bew-text-2">h</span>
          </template>
        </Input>
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_wallpaper_masking')" right-width="auto">
        <template #desc>
          <span class="bew-warning-text">{{ $t('common.performance_impact_warn') }}</span>
        </template>

        <Radio v-if="isGlobal" v-model="settings.enableWallpaperMasking" />
        <Radio v-else v-model="settings.searchPageEnableWallpaperMasking" />
      </SettingsItem>
      <SettingsItem
        v-if="
          isGlobal ? settings.enableWallpaperMasking : settings.searchPageEnableWallpaperMasking
        "
        :title="$t('settings.wallpaper_mask_opacity')"
        right-width="auto"
      >
        <div class="slider-control">
          <Slider
            v-if="isGlobal"
            v-model="settings.wallpaperMaskOpacity"
            :label="`${settings.wallpaperMaskOpacity}%`"
          />
          <Slider
            v-else
            v-model="settings.searchPageWallpaperMaskOpacity"
            :label="`${settings.searchPageWallpaperMaskOpacity}%`"
          />
        </div>
      </SettingsItem>
      <SettingsItem
        v-if="
          isGlobal ? settings.enableWallpaperMasking : settings.searchPageEnableWallpaperMasking
        "
        :title="$t('settings.wallpaper_blur_intensity')"
        right-width="auto"
      >
        <div class="slider-control">
          <Slider
            v-if="isGlobal"
            v-model="settings.wallpaperBlurIntensity"
            :min="0"
            :max="60"
            :label="`${settings.wallpaperBlurIntensity}px`"
          />
          <Slider
            v-else
            v-model="settings.searchPageWallpaperBlurIntensity"
            :min="0"
            :max="60"
            :label="`${settings.searchPageWallpaperBlurIntensity}px`"
          />
        </div>
      </SettingsItem>
    </template>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
.selected-wallpaper {
  --uno: 'border-$bew-theme-color-60';
}

.slider-control {
  width: 220px;
}
</style>
