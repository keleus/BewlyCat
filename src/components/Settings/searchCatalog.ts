import { MenuType } from './types'

export interface SettingsSearchStorageValue {
  key: string
  value: string
}

export interface SettingsSearchEntry {
  titleKey?: string
  title?: string
  menu: MenuType
  targetTitleKey?: string
  targetTitle?: string
  secondaryTitleKey?: string
  storageValues?: SettingsSearchStorageValue[]
  keywordKeys?: string[]
  keywords?: string[]
}

interface SearchRoute {
  menu: MenuType
  secondaryPage?: string
  secondaryTitleKey?: string
  storageKey?: string
}

const bewlyPagesStorageKey = 'bewly-settings-bewly-pages-page'
const bewlyComponentsStorageKey = 'bewly-settings-bewly-components-page'
const bilibiliStorageKey = 'bewly-settings-bilibili-page'

// 分类菜单只用于结果定位，不应作为独立搜索项参与匹配。
const nonSettingTitleKeyPatterns = [
  /^settings\.menu_/,
  /^settings\.group_/,
  /^settings\.plugin\./,
  /^settings\.bilibili_features\./,
  /^settings\.shortcuts\.group\./,
  /^settings\.maintenance\.(title|backup_title|reset_title)$/,
  /^settings\.topbar_(display_settings|logo_and_channels|switchers|actions|user_menu)$/,
  /^settings\.advanced_performance\.home_grid$/,
]

function isSettingTitleKey(titleKey: string) {
  return !nonSettingTitleKeyPatterns.some(pattern => pattern.test(titleKey))
}

function createEntries(
  route: SearchRoute,
  titleKeys: string[],
  options: Omit<SettingsSearchEntry, 'titleKey' | 'menu' | 'secondaryTitleKey' | 'storageValues'> & {
    storageValues?: SettingsSearchStorageValue[]
  } = {},
): SettingsSearchEntry[] {
  const routeStorageValues = route.secondaryPage
    ? [{ key: route.storageKey ?? bewlyPagesStorageKey, value: route.secondaryPage }]
    : []

  return titleKeys.filter(isSettingTitleKey).map(titleKey => ({
    titleKey,
    menu: route.menu,
    secondaryTitleKey: route.secondaryTitleKey,
    ...options,
    storageValues: [...routeStorageValues, ...(options.storageValues ?? [])],
  }))
}

const generalRoute: SearchRoute = { menu: MenuType.General }
const homeRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'home',
  secondaryTitleKey: 'settings.plugin.home',
  storageKey: bewlyPagesStorageKey,
}
const momentsRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'moments',
  secondaryTitleKey: 'settings.plugin.moments',
  storageKey: bewlyPagesStorageKey,
}
const favoritesRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'favorites',
  secondaryTitleKey: 'settings.plugin.favorites',
  storageKey: bewlyPagesStorageKey,
}
const videoCardRoute: SearchRoute = {
  menu: MenuType.BewlyComponents,
  secondaryPage: 'video-card',
  secondaryTitleKey: 'settings.plugin.video_card',
  storageKey: bewlyComponentsStorageKey,
}
const topBarRoute: SearchRoute = {
  menu: MenuType.BewlyComponents,
  secondaryPage: 'topbar',
  secondaryTitleKey: 'settings.plugin.topbar',
  storageKey: bewlyComponentsStorageKey,
}
const dockRoute: SearchRoute = {
  menu: MenuType.BewlyComponents,
  secondaryPage: 'dock',
  secondaryTitleKey: 'settings.plugin.dock_and_sidebar',
  storageKey: bewlyComponentsStorageKey,
}
const searchPageRoute: SearchRoute = {
  menu: MenuType.BewlyPages,
  secondaryPage: 'search',
  secondaryTitleKey: 'settings.plugin.search',
  storageKey: bewlyPagesStorageKey,
}
const playerRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'player',
  secondaryTitleKey: 'settings.bilibili_features.video_playback',
  storageKey: bilibiliStorageKey,
}
const autoPlayRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'auto-play',
  secondaryTitleKey: 'settings.bilibili_features.auto_play',
  storageKey: bilibiliStorageKey,
}
const appearanceRoute: SearchRoute = { menu: MenuType.Appearance }
const commentsRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'comments',
  secondaryTitleKey: 'settings.bilibili_features.comments',
  storageKey: bilibiliStorageKey,
}
const vipFeaturesRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'vip-features',
  secondaryTitleKey: 'settings.bilibili_features.vip_features',
  storageKey: bilibiliStorageKey,
}
const compatibilityRoute: SearchRoute = {
  menu: MenuType.Bilibili,
  secondaryPage: 'compatibility',
  secondaryTitleKey: 'settings.menu_compatibility',
  storageKey: bilibiliStorageKey,
}
const shortcutsRoute: SearchRoute = { menu: MenuType.Shortcuts }
const aboutRoute: SearchRoute = { menu: MenuType.About }

const wallpaperTitleKeys = [
  'settings.group_wallpaper',
  'settings.wallpaper_mode',
  'settings.wallpaper_cache_time',
  'settings.choose_ur_wallpaper',
  'settings.image_url',
  'settings.enable_wallpaper_masking',
  'settings.wallpaper_mask_opacity',
  'settings.wallpaper_blur_intensity',
]

const linkOpeningOptionKeys = [
  'settings.link_opening_behavior_opt.current_tab',
  'settings.link_opening_behavior_opt.current_tab_if_not_homepage',
  'settings.link_opening_behavior_opt.background',
  'settings.link_opening_behavior_opt.new_tab',
]
const videoCardLinkOpeningOptionKeys = [
  'settings.link_opening_behavior_opt.current_tab',
  'settings.link_opening_behavior_opt.drawer',
  'settings.link_opening_behavior_opt.background',
  'settings.link_opening_behavior_opt.new_tab',
]
const playerModeOptionKeys = [
  'settings.video_player_mode.default',
  'settings.video_player_mode.web_fullscreen',
  'settings.video_player_mode.widescreen',
  'settings.video_player_mode.bewly_widescreen',
]
const autoPlayModeOptionKeys = [
  'settings.auto_play_mode_auto_play',
  'settings.auto_play_mode_auto_play_with_recommend',
  'settings.auto_play_mode_pause_at_end',
  'settings.auto_play_mode_loop',
]
const topBarGlobalTitleKeys = [
  'settings.group_topbar',
  'settings.topbar_display_settings',
  'settings.auto_hide_top_bar',
  'settings.video_page_top_bar_config',
  'settings.always_use_transparent_top_bar',
  'settings.enable_top_bar_gradient',
  'settings.show_top_bar_theme_color_gradient',
  'settings.open_top_bar_items_in_bewly',
  'settings.open_notifications_page_as_drawer',
]

export const settingsSearchEntries: SettingsSearchEntry[] = [
  ...createEntries(generalRoute, [
    'settings.menu_general',
    'settings.group_language',
    'settings.select_language',
    'settings.group_interaction_layout',
    'settings.touch_screen_optimization',
    'settings.enable_grid_layout_switcher',
    'settings.enable_horizontal_scrolling',
    'settings.advanced_performance.home_grid',
    'settings.advanced_performance.release_offscreen_images',
    'settings.advanced_performance.virtualize_home_grid',
    'settings.group_drawer_behavior',
    'settings.close_drawer_without_pressing_esc_again',
  ]),
  ...createEntries(homeRoute, [
    'settings.menu_bewly_pages',
  ], { targetTitleKey: 'settings.plugin.home' }),
  ...createEntries(videoCardRoute, [
    'settings.menu_bewly_components',
  ], { targetTitleKey: 'settings.plugin.video_card' }),

  ...createEntries(favoritesRoute, [
    'settings.plugin.favorites',
    'settings.group_favorites',
  ]),

  ...createEntries(homeRoute, [
    'settings.plugin.home',
    'settings.group_recommendation_mode',
    'settings.remember_no_cookie_recommendation_state',
    'settings.authorize_app',
    'settings.auto_switch_recommendation_mode',
    'settings.preserve_for_you_state',
    'settings.group_recommendation_filters',
    'settings.disable_filters_for_followed_users',
    'settings.filter_out_vertical_videos',
    'settings.filter_by_view_count',
    'settings.filter_by_like_count',
    'settings.filter_by_duration',
    'settings.filter_by_publish_time',
    'settings.filter_by_title',
    'settings.filter_by_user',
    'settings.group_following',
    'settings.use_following_new_layout',
    'settings.enable_following_inactive_blacklist',
    'settings.following_inactive_days',
    'settings.following_tab_show_livestreaming_videos',
    'settings.following_filter_charging_videos',
    'settings.following_filter_dynamic_videos',
    'settings.group_home_tabs',
    'settings.home_tabs_adjustment',
    'settings.fixed_home_tabs_on_home_page',
    'settings.group_search_page_mode',
    'settings.use_search_page_mode',
    'settings.settings_shared_with_the_search_page',
    'settings.search_page_mode_wallpaper_fixed',
  ]),
  ...createEntries(homeRoute, [
    'settings.recommendation_mode',
  ], {
    keywordKeys: ['settings.recommendation_mode_web_no_cookie'],
    keywords: ['Web', 'App'],
  }),
  ...createEntries(momentsRoute, [
    'settings.plugin.moments',
    'settings.group_original_moments_page',
    'settings.original_moments_show_user_card',
    'settings.original_moments_show_live_list',
    'settings.original_moments_show_community_center',
    'settings.original_moments_show_hot_search',
    'settings.original_moments_show_up_list',
    'settings.group_new_moments_page',
    'settings.moments_visible_components',
    'settings.moments_filtered_types',
    'settings.moments_show_user_card',
    'settings.moments_show_publish',
    'settings.moments_show_live',
    'settings.moments_show_up_list',
    'settings.moments_enable_live_preview',
    'settings.moments_enable_video_preview',
    'settings.moments_filter_video_dynamic',
    'settings.moments_filter_draw_dynamic',
    'settings.moments_filter_ugc_season_dynamic',
    'settings.moments_filter_forward_dynamic',
    'settings.moments_filter_pgc_dynamic',
    'settings.moments_filter_article_dynamic',
    'settings.moments_filter_charge_dynamic',
    'settings.moments_filter_video_reservation',
    'settings.moments_filter_live_reservation',
    'settings.moments_filter_live_dynamic',
    'settings.moments_card_open_mode',
    'settings.group_moments_wanted_users',
    'settings.moments_enable_wanted_filter',
    'settings.moments_wanted_users',
    'settings.group_moments_pinned_users',
    'settings.moments_pinned_users',
  ]),
  ...createEntries(momentsRoute, [
    'settings.moments_filter_up_recommendation',
  ], { targetTitleKey: 'settings.moments_filter_up_recommendation_short' }),
  ...createEntries(momentsRoute, [
    'settings.moments_hide_charge_exclusive',
  ], { targetTitleKey: 'settings.moments_filter_charge_dynamic' }),
  ...createEntries(videoCardRoute, [
    'settings.plugin.video_card',
    'settings.group_video_card_grid',
    'settings.auto_switch_list_layout',
    'settings.grid_breakpoints',
    'settings.group_video_card_display',
    'settings.video_card_layout',
    'settings.enable_video_preview',
    'settings.enable_video_ctrl_bar_on_video_card',
    'settings.video_preview_swipe_seek',
    'settings.video_preview_swipe_seek_desc',
    'settings.hover_video_card_delayed',
    'settings.only_cover_video_preview',
    'settings.group_video_card_content',
    'settings.show_video_card_author_avatar',
    'settings.show_video_card_author_name',
    'settings.show_video_card_video_tag',
    'settings.show_video_card_recommend_tag',
    'settings.show_video_card_publish_time',
    'settings.show_video_card_view_count',
    'settings.show_video_card_danmaku_count',
    'settings.show_video_card_like_count',
    'settings.show_video_card_duration',
    'settings.show_video_watched_badge',
    'settings.show_video_card_watch_later',
    'settings.group_video_card_context_menu',
    'settings.video_card_context_menu_follow_user',
    'video_card.operation.not_interested',
    'video_card.operation.not_interested_uploader',
    'video_card.operation.open_in_new_tab',
    'video_card.operation.open_in_background',
    'video_card.operation.open_in_new_window',
    'video_card.operation.open_in_current_tab',
    'video_card.operation.open_in_drawer',
    'video_card.operation.copy_video_link',
    'video_card.operation.copy_clean_video_link',
    'video_card.operation.copy_bv_number',
    'video_card.operation.copy_av_number',
    'video_card.operation.view_the_original_cover',
    'video_card.operation.block_user',
    'settings.video_card_shadow_curve',
    'settings.video_card_shadow_height',
  ]),
  ...createEntries(videoCardRoute, [
    'settings.video_card_title_font_size',
    'settings.video_card_author_font_size',
    'settings.video_card_meta_font_size',
  ], { keywordKeys: ['settings.font_size_option'] }),

  ...createEntries(videoCardRoute, [
    'settings.group_link_opening_behavior',
    'settings.video_card_link_opening_behavior',
  ], { keywordKeys: videoCardLinkOpeningOptionKeys }),

  ...createEntries(topBarRoute, [
    'settings.plugin.topbar',
    ...topBarGlobalTitleKeys,
  ]),
  ...createEntries(topBarRoute, [
    'settings.topbar_logo_and_channels',
    'settings.top_bar_logo_style',
    'settings.show_home_button_in_touch_mode',
  ]),
  ...createEntries(topBarRoute, [
    'settings.group_topbar_pinned_channels',
    'settings.topbar_pinned_channels_title',
  ]),
  ...createEntries(topBarRoute, [
    'settings.topbar_switchers',
    'settings.show_bewly_or_bili_page_switcher',
    'settings.show_bewly_or_bili_top_bar_switcher',
  ]),
  ...createEntries(topBarRoute, [
    'settings.group_search_bar',
    'settings.show_hot_search_in_top_bar',
    'settings.show_search_recommendation',
  ]),
  ...createEntries(topBarRoute, [
    'settings.topbar_actions',
    'settings.show_like_notification_reminder',
    'settings.filter_articles_in_moments',
  ], {
    keywordKeys: ['settings.visibility', 'settings.badge_type', 'settings.top_bar_icon_badges_opt'],
  }),
  ...createEntries(topBarRoute, [
    'settings.topbar_user_menu',
    'settings.hide_lv6_last_login_location_in_top_bar_user_pop',
  ]),
  ...createEntries(topBarRoute, [
    'settings.group_link_opening_behavior',
    'settings.top_bar_link_opening_behavior',
    'settings.search_bar_link_opening_behavior',
  ], { keywordKeys: linkOpeningOptionKeys }),
  ...[
    ['moments', 'topbar.moments'],
    ['favorites', 'topbar.favorites'],
    ['history', 'topbar.history'],
    ['watchLater', 'topbar.watch_later'],
    ['creatorCenter', 'topbar.creative_center'],
    ['upload', 'topbar.upload'],
    ['notifications', 'topbar.notifications'],
  ].flatMap(([, titleKey]) => createEntries(topBarRoute, [titleKey!], {
    keywordKeys: ['settings.visibility', 'settings.badge_type', 'settings.top_bar_icon_badges_opt'],
  })),

  ...createEntries(dockRoute, [
    'settings.plugin.dock_and_sidebar',
    'settings.group_dock',
    'settings.always_use_dock',
    'settings.auto_hide_dock',
    'settings.half_hide_dock',
    'settings.dock_content_adjustment',
    'settings.disable_dock_glowing_effect',
    'settings.disable_light_dark_mode_switcher',
    'settings.back_to_top_and_refresh_buttons_are_separated',
    'settings.always_show_dock_actions_when_auto_hide',
    'settings.enable_undo_refresh_button',
    'settings.group_sidebar',
    'settings.auto_hide_sidebar',
  ]),
  ...createEntries(dockRoute, [
    'settings.dock_position',
  ], { keywordKeys: ['common.position.left', 'common.position.right', 'common.position.bottom'] }),
  ...createEntries(dockRoute, [
    'settings.sidebar_position',
  ], { keywordKeys: ['common.position.left', 'common.position.right'] }),

  ...createEntries(searchPageRoute, [
    'settings.plugin.search',
    'settings.group_logo',
    'settings.logo_color',
    'settings.enable_logo_glowing_effect',
    'settings.logo_visibility',
    'settings.group_search_bar',
    'settings.show_search_recommendation',
    'settings.enable_search_history',
    'settings.bg_darkens_when_the_search_bar_is_focused',
    'settings.bg_blurs_when_the_search_bar_is_focused',
    'settings.choose_search_bar_focused_character',
    'settings.group_hot_search',
    'settings.show_hot_search_in_search_page',
    'settings.group_search_results',
    'settings.use_plugin_search_results_page',
    'settings.depersonalize_search_results',
    'settings.search_results_pagination_mode',
    'settings.individually_set_search_page_wallpaper',
    ...wallpaperTitleKeys,
  ]),

  ...createEntries(playerRoute, [
    'settings.bilibili_features.video_playback',
    'settings.group_player_display_mode',
    'settings.video_player_mode.bewly_widescreen_sidebar_position',
    'settings.video_player_mode.enable_overrides',
    'settings.video_player_mode.overrides',
    'settings.video_player_scroll',
    'settings.auto_exit_fullscreen_on_end',
    'settings.group_player_components',
    'settings.group_playback_memory',
    'settings.remember_playback_rate',
    'settings.remember_video_aspect_ratio',
    'settings.group_video_page_actions',
    'settings.enlarge_favorite_dialog',
    'settings.external_watch_later_button',
    'settings.show_vertical_video_zoom_button',
    'settings.show_video_screenshot_button',
  ]),
  ...createEntries(playerRoute, [
    'settings.video_default_player_mode',
  ], { keywordKeys: playerModeOptionKeys }),
  ...createEntries(playerRoute, [
    'settings.video_player_mode.context_multipart',
    'settings.video_player_mode.context_collection',
    'settings.video_player_mode.context_bangumi',
    'settings.video_player_mode.context_watch_later',
    'settings.video_player_mode.context_playlist',
  ], { keywordKeys: [...playerModeOptionKeys, 'settings.video_player_mode.inherit'] }),
  ...createEntries(playerRoute, [
    'settings.video_danmaku_default_state',
    'settings.video_caption_default_state',
  ], { keywordKeys: ['settings.video_default_state_opt'] }),

  ...createEntries(autoPlayRoute, [
    'settings.bilibili_features.auto_play',
    'settings.group_random_play',
    'settings.enable_random_play',
    'settings.enable_custom_play_order_overrides',
    'settings.custom_play_order_overrides',
    'settings.group_random_play_settings',
    'settings.min_videos_for_random',
    'settings.group_playback_end_behavior',
    'settings.use_bilibili_default_auto_play',
    'settings.group_video_type_end_behavior',
    'settings.group_playlist_start_behavior',
  ]),
  ...createEntries(autoPlayRoute, [
    'settings.auto_play_multipart',
    'settings.auto_play_collection',
    'settings.auto_play_watch_later',
    'settings.auto_play_playlist',
  ], {
    keywordKeys: [
      ...autoPlayModeOptionKeys,
      'settings.custom_play_order_inherit',
      'settings.random_play_order_sequential',
      'settings.random_play_order_reverse',
      'settings.random_play_order_random',
    ],
  }),
  ...createEntries(autoPlayRoute, [
    'settings.auto_play_recommend',
  ], { keywordKeys: autoPlayModeOptionKeys }),
  ...createEntries(autoPlayRoute, [
    'settings.default_custom_play_order',
  ], {
    keywordKeys: [
      'settings.random_play_order_sequential',
      'settings.random_play_order_reverse',
      'settings.random_play_order_random',
    ],
  }),
  ...createEntries(autoPlayRoute, [
    'settings.random_play_mode',
  ], {
    keywordKeys: ['settings.random_play_mode_manual', 'settings.random_play_mode_auto'],
  }),
  ...createEntries(autoPlayRoute, [
    'settings.collected_season_play_all_mode',
  ], {
    keywordKeys: [
      'settings.collected_season_play_all_mode_beginning',
      'settings.collected_season_play_all_mode_latest',
      'settings.collected_season_play_all_mode_last_watched',
    ],
  }),

  ...createEntries(appearanceRoute, [
    'settings.menu_appearance',
    'settings.group_visual_effects',
    'settings.enable_frosted_glass',
    'settings.frosted_glass_blur_intensity',
    'settings.enable_liquid_segment_indicator',
    'settings.disable_shadow',
    'settings.group_page_style',
    'settings.adapt_to_other_page_styles',
    'settings.group_color',
    'settings.theme',
    'settings.theme_schedule',
    'settings.video_page_dark_mode',
    'settings.theme_color',
    'settings.dark_mode_base_color',
    'settings.gradient_theme_color_background',
    'settings.follow_bilibili_evolved_color',
    'settings.group_fonts',
    'settings.customize_font',
    'settings.remove_the_indent_from_chinese_punctuation',
    'settings.override_danmaku_font',
    'settings.customize_css',
    ...wallpaperTitleKeys,
  ]),

  ...createEntries(playerRoute, [
    'settings.menu_bilibili',
  ], { targetTitleKey: 'settings.bilibili_features.video_playback' }),
  ...createEntries(commentsRoute, [
    'settings.bilibili_features.comments',
    'settings.group_comments',
    'settings.show_ip_location',
    'settings.show_sex',
    'settings.show_comment_host_tag',
    'settings.enable_comment_reply_tree_display',
    'settings.comment_reply_tree_mode.title',
    'settings.comment_reply_tree_mode.line_collapse_main',
    'settings.comment_reply_tree_mode.line_keep_main',
    'settings.comment_reply_tree_mode.indent_only',
    'settings.adjust_comment_image_height',
  ]),
  ...createEntries(vipFeaturesRoute, [
    'settings.bilibili_features.vip_features',
    'settings.show_bcoin_receive_reminder',
    'settings.auto_receive_bcoin_coupon',
    'settings.auto_receive_vip_exp',
  ]),
  ...createEntries(compatibilityRoute, [
    'settings.menu_compatibility',
    'settings.group_common',
    'settings.topbar_visibility',
    'settings.use_original_bilibili_topbar',
    'settings.use_original_bilibili_homepage',
    'settings.prevent_mobile_redirect',
    'settings.group_ad_blocking',
    'settings.block_ads',
    'settings.block_top_search_page_ads',
    'settings.clean_url_argument',
    'settings.group_clean_share_link',
    'settings.enable_clean_share_link',
    'settings.clean_share_link_include_title',
    'settings.clean_share_link_remove_tracking_params',
  ]),

  ...createEntries(shortcutsRoute, [
    'settings.shortcuts.title',
    'settings.shortcuts.enable_all_shortcuts_toggle',
    'settings.shortcuts.group.homepage',
    'settings.shortcuts.home_refresh',
    'settings.shortcuts.group.general',
    'settings.shortcuts.danmu_status',
    'settings.shortcuts.web_fullscreen',
    'settings.shortcuts.widescreen',
    'settings.shortcuts.short_step_backward',
    'settings.shortcuts.long_step_backward',
    'settings.shortcuts.play_pause_ext',
    'settings.shortcuts.short_step_forward',
    'settings.shortcuts.long_step_forward',
    'settings.shortcuts.pip',
    'settings.shortcuts.turn_off_light',
    'settings.shortcuts.caption',
    'settings.shortcuts.increase_playback_rate',
    'settings.shortcuts.decrease_playback_rate',
    'settings.shortcuts.reset_playback_rate',
    'settings.shortcuts.previous_frame',
    'settings.shortcuts.next_frame',
    'settings.shortcuts.replay',
    'settings.shortcuts.toggle_follow',
    'settings.shortcuts.group.fullscreen_mode',
    'settings.shortcuts.increase_video_size',
    'settings.shortcuts.decrease_video_size',
    'settings.shortcuts.reset_video_size',
    'settings.shortcuts.video_title',
    'settings.shortcuts.video_time',
    'settings.shortcuts.clock_time',
    'settings.shortcuts.group.global_actions',
    'settings.shortcuts.reset_all_ext_shortcuts',
    'settings.shortcuts.group.official_bilibili',
  ]),

  ...createEntries(aboutRoute, [
    'settings.menu_about',
    'settings.group_settings_sync',
    'settings.enable_settings_sync',
    'settings.group_version_reminder',
    'settings.enable_version_reminder',
    'settings.maintenance.title',
    'settings.maintenance.backup_title',
    'settings.import_settings',
    'settings.export_settings',
    'settings.maintenance.reset_title',
    'settings.reset_settings',
  ]),
]
