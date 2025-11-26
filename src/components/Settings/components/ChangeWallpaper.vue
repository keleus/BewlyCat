<script setup lang="ts">
import { WALLPAPERS } from '~/constants/imgs'
import { localSettings, settings } from '~/logic'
import { hasLocalWallpaper, isLocalWallpaperUrl, removeLocalWallpaper, resolveWallpaperUrl, storeLocalWallpaper } from '~/utils/localWallpaper'
import { compressAndResizeImage } from '~/utils/main'

import SettingsItem from './SettingsItem.vue'
import SettingsItemGroup from './SettingsItemGroup.vue'

const props = defineProps<Props>()

interface Props {
  type: 'global' | 'searchPage'
}
const uploadWallpaperRef = ref(null)

const isGlobal = computed(() => props.type === 'global')
const isBuildInWallpaper = computed(() => {
  return isGlobal.value ? settings.value.wallpaperMode === 'buildIn' : settings.value.searchPageWallpaperMode === 'buildIn'
})

// 计算本地壁纸的实际显示URL
const localWallpaperDisplayUrl = computed(() => {
  const localWallpaper = localSettings.value.locallyUploadedWallpaper
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

function changeWallpaperType(type: 'buildIn' | 'byUrl') {
  if (isGlobal.value) {
    settings.value.wallpaperMode = type
  }
  else {
    settings.value.searchPageWallpaperMode = type
  }

  // Set the wallpaper to empty if it's a locally uploaded wallpaper to prevent the `QUOTA_BYTES quota exceeded` error
  if (type === 'byUrl') {
    if (settings.value.wallpaper.startsWith('data:image/') || isLocalWallpaper(settings.value.wallpaper))
      settings.value.wallpaper = ''
    else if (settings.value.searchPageWallpaper.startsWith('data:image/') || isLocalWallpaper(settings.value.searchPageWallpaper))
      settings.value.searchPageWallpaper = ''
  }
}

function changeWallpaper(url: string) {
  if (isGlobal.value) {
    // If you had already set the wallpaper, it enables the wallpaper masking to prevent text hard to see
    if (url)
      settings.value.enableWallpaperMasking = true
    else
      settings.value.enableWallpaperMasking = false
    settings.value.wallpaper = url
  }
  else {
    settings.value.searchPageWallpaper = url
  }
}

function fileToBase64(inputFile: File) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(inputFile)
    reader.onload = () => resolve(reader.result)
    reader.onerror = error => reject(error)
  })
}

async function handleUploadWallpaper(e: Event) {
  if (uploadWallpaperRef.value)
    (uploadWallpaperRef.value as HTMLInputElement).click()
  const file = (e.target as HTMLInputElement)?.files?.[0]
  if (!file)
    return

  compressAndResizeImage(file, 2560, 1440, 0.9, async (compressedFile: File) => {
    try {
      // 转换为base64
      const base64 = await fileToBase64(compressedFile) as string

      // 清理旧的本地壁纸
      if (localSettings.value.locallyUploadedWallpaper?.isLocal && localSettings.value.locallyUploadedWallpaper?.id) {
        removeLocalWallpaper(localSettings.value.locallyUploadedWallpaper.id)
      }

      // 存储到本地storage
      const localWallpaperRef = await storeLocalWallpaper(compressedFile, base64)

      // 使用特殊标识符作为壁纸URL，而不是base64
      const localWallpaperUrl = `local-wallpaper:${localWallpaperRef.id}`
      changeWallpaper(localWallpaperUrl)

      // 保存本地壁纸引用（不包含base64数据）
      localSettings.value.locallyUploadedWallpaper = {
        ...localWallpaperRef,
        url: localWallpaperUrl, // 使用标识符而不是base64
      }
    }
    catch (error) {
      console.error('上传壁纸失败:', error)
    }
  })
}

function handleRemoveCustomWallpaper() {
  // 清理本地存储的壁纸数据
  if (localSettings.value.locallyUploadedWallpaper?.isLocal && localSettings.value.locallyUploadedWallpaper?.id) {
    removeLocalWallpaper(localSettings.value.locallyUploadedWallpaper.id)
  }

  changeWallpaper('')
  localSettings.value.locallyUploadedWallpaper = null
}

// 检查本地壁纸是否有效，如果无效则清理
function validateLocalWallpaper() {
  const localWallpaper = localSettings.value.locallyUploadedWallpaper
  if (localWallpaper?.isLocal && localWallpaper.id) {
    if (!hasLocalWallpaper(localWallpaper.id)) {
      localSettings.value.locallyUploadedWallpaper = null

      // 如果当前壁纸使用的是丢失的本地壁纸，也清理掉
      const currentWallpaper = isGlobal.value ? settings.value.wallpaper : settings.value.searchPageWallpaper
      if (isLocalWallpaper(currentWallpaper)) {
        changeWallpaper('')
      }
    }
  }
}

// 组件挂载时验证本地壁纸
onMounted(() => {
  validateLocalWallpaper()
})
</script>

<template>
  <SettingsItemGroup :title="$t('settings.group_wallpaper')">
    <SettingsItem v-if="!isGlobal" :title="$t('settings.individually_set_search_page_wallpaper')">
      <template #desc>
        <span color="$bew-warning-color">{{ $t('common.performance_impact_warn') }}</span>
      </template>

      <Radio v-model="settings.individuallySetSearchPageWallpaper" />
    </SettingsItem>

    <template v-if="isGlobal || (settings.individuallySetSearchPageWallpaper && !isGlobal)">
      <SettingsItem :title="$t('settings.wallpaper_mode')" :desc="$t('settings.wallpaper_mode_desc')">
        <div w-full flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
          <div
            flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
            :style="{
              background: isBuildInWallpaper ? 'var(--bew-theme-color)' : '',
              color: isBuildInWallpaper ? 'white' : '',
            }"
            @click="changeWallpaperType('buildIn')"
          >
            {{ $t('settings.wallpaper_mode_opt.build_in') }}
          </div>
          <div
            flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
            :style="{
              background: !isBuildInWallpaper ? 'var(--bew-theme-color)' : '',
              color: !isBuildInWallpaper ? 'white' : '',
            }"
            @click="changeWallpaperType('byUrl')"
          >
            {{ $t('settings.wallpaper_mode_opt.by_url') }}
          </div>
        </div>
      </SettingsItem>

      <!-- 缓存时间设置 - 对所有URL壁纸生效 -->
      <SettingsItem :title="$t('settings.wallpaper_cache_time')">
        <template #desc>
          {{ $t('settings.wallpaper_cache_time_desc') }}
        </template>
        <Input
          v-if="isGlobal"
          v-model="settings.wallpaperCacheTime"
          type="number"
          :min="0"
          :max="168"
          :placeholder="0"
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
          :placeholder="0"
          w-100px
        >
          <template #suffix>
            <span text="sm $bew-text-2">h</span>
          </template>
        </Input>
      </SettingsItem>

      <SettingsItem v-if="isBuildInWallpaper" :title="$t('settings.choose_ur_wallpaper')">
        <template #bottom>
          <div grid="~ xl:cols-5 lg:cols-4 cols-3 gap-4">
            <picture
              aspect-video bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
              un-border="4 transparent" cursor-pointer
              grid place-items-center
              :class="{ 'selected-wallpaper': isGlobal ? settings.wallpaper === '' : settings.searchPageWallpaper === '' }"
              @click="changeWallpaper('')"
            >
              <div i-tabler:photo-off text="3xl $bew-text-3" />
            </picture>

            <Tooltip v-for="item in WALLPAPERS" :key="item.url" placement="top" :content="item.name" aspect-video>
              <picture
                aspect-video bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
                un-border="4 transparent" w-full
                :class="{ 'selected-wallpaper': isGlobal ? settings.wallpaper === item.url : settings.searchPageWallpaper === item.url }"
                @click="changeWallpaper(item.url)"
              >
                <img
                  :src="item.thumbnail || item.url"
                  :alt="item.name"
                  w-full h-full object-cover
                  class="img-no-error"
                >
              </picture>
            </Tooltip>

            <Tooltip placement="top" :content="localSettings.locallyUploadedWallpaper?.name || ''" aspect-video>
              <!-- Upload wallpaper input -->
              <input
                ref="uploadWallpaperRef" type="file" accept="image/*"
                hidden
                @change="handleUploadWallpaper"
              >

              <picture
                class="group"
                :class="{ 'selected-wallpaper': isGlobal
                  ? settings.wallpaper === (localWallpaperDisplayUrl || localSettings.locallyUploadedWallpaper?.url)
                  : settings.searchPageWallpaper === (localWallpaperDisplayUrl || localSettings.locallyUploadedWallpaper?.url) }"
                aspect-video bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
                un-border="4 transparent" w-full
                flex="~ items-center justify-center"
                @click="changeWallpaper(localWallpaperDisplayUrl || localSettings.locallyUploadedWallpaper?.url || '')"
              >
                <div
                  v-if="localSettings.locallyUploadedWallpaper"
                  class="opacity-0 group-hover:opacity-100" duration-300
                  pos="absolute top-4px right-4px" z-1 text="14px" flex="~ gap-1"
                >
                  <button
                    style="backdrop-filter: var(--bew-filter-glass-1);"
                    bg="$bew-content" rounded-full w-28px h-28px
                    grid place-items-center
                    @click="handleUploadWallpaper"
                  >
                    <i i-mingcute:edit-2-line />
                  </button>
                  <button
                    style="backdrop-filter: var(--bew-filter-glass-1);"
                    bg="$bew-content" rounded-full w-28px h-28px
                    grid place-items-center
                    @click="handleRemoveCustomWallpaper"
                  >
                    <i i-mingcute:delete-2-line />
                  </button>
                </div>
                <div
                  v-if="!localSettings.locallyUploadedWallpaper"
                  absolute w-full h-full grid place-items-center
                  @click="handleUploadWallpaper"
                >
                  <div
                    i-tabler:photo-up
                    text="3xl $bew-text-3"
                  />
                </div>
                <img
                  v-else
                  :src="localWallpaperDisplayUrl || localSettings.locallyUploadedWallpaper.url"
                  :alt="localSettings.locallyUploadedWallpaper.name"
                  w-full h-full object-cover
                >
              </picture>
            </Tooltip>
          </div>
        </template>
      </SettingsItem>
      <SettingsItem v-else :title="$t('settings.image_url')">
        <template #bottom>
          <div flex items-center gap-4>
            <picture
              aspect-video bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
              un-border="4 transparent" cursor-pointer shrink-0
              w="xl:1/5 lg:1/4 md:1/3"
            >
              <img
                v-if="isGlobal ? settings.wallpaper : settings.searchPageWallpaper"
                :src="isGlobal ? settings.wallpaper : settings.searchPageWallpaper" alt="" loading="lazy"
                w-full h-full object-cover
                onerror="this.style.display='none'; this.onerror=null;"
              >
            </picture>
            <div>
              <Input v-if="isGlobal" v-model="settings.wallpaper" w-full />
              <Input v-else v-model="settings.searchPageWallpaper" w-full />
              <p color="sm $bew-text-3" mt-2>
                {{ $t('settings.image_url_hint') }}
              </p>
            </div>
          </div>
        </template>
      </SettingsItem>

      <SettingsItem :title="$t('settings.enable_wallpaper_masking')">
        <template #desc>
          <span color="$bew-warning-color">{{ $t('common.performance_impact_warn') }}</span>
        </template>

        <Radio v-if="isGlobal" v-model="settings.enableWallpaperMasking" />
        <Radio v-else v-model="settings.searchPageEnableWallpaperMasking" />
      </SettingsItem>
      <SettingsItem v-if="isGlobal ? settings.enableWallpaperMasking : settings.searchPageEnableWallpaperMasking" :title="$t('settings.wallpaper_mask_opacity')">
        <Slider v-if="isGlobal" v-model="settings.wallpaperMaskOpacity" :label="`${settings.wallpaperMaskOpacity}%`" />
        <Slider v-else v-model="settings.searchPageWallpaperMaskOpacity" :label="`${settings.searchPageWallpaperMaskOpacity}%`" />
      </SettingsItem>
      <SettingsItem v-if="isGlobal ? settings.enableWallpaperMasking : settings.searchPageEnableWallpaperMasking" :title="$t('settings.wallpaper_blur_intensity')">
        <template #desc>
          <span color="$bew-warning-color">{{ $t('common.performance_impact_warn') }}</span>
        </template>
        <Slider v-if="isGlobal" v-model="settings.wallpaperBlurIntensity" :min="0" :max="60" :label="`${settings.wallpaperBlurIntensity}px`" />
        <Slider v-else v-model="settings.searchPageWallpaperBlurIntensity" :min="0" :max="60" :label="`${settings.searchPageWallpaperBlurIntensity}px`" />
      </SettingsItem>
    </template>
  </SettingsItemGroup>
</template>

<style lang="scss" scoped>
.selected-wallpaper {
  --uno: "border-$bew-theme-color-60";
}
</style>
