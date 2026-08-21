// https://app.quicktype.io/?l=ts

export interface MomentResult {
  code: number
  message: string
  ttl: number
  data: Data
}

export interface Data {
  has_more: boolean
  items: DataItem[]
  offset: string
  update_baseline: string
  update_num: number
}

export interface DataItem {
  basic: Basic
  id?: string
  id_str: string
  modules: Modules
  orig?: DataItem
  type: ItemType
  visible: boolean
}

export interface Basic {
  comment_id_str: string
  comment_type: number
  like_icon: LikeIcon
  rid_str: string
}

export interface LikeIcon {
  action_url: string
  end_url: string
  id: number
  start_url: string
}

export interface Modules {
  module_author: ModuleAuthor
  module_dynamic: ModuleDynamic
  module_more: ModuleMore
  module_stat: ModuleStat
  module_interaction?: ModuleInteraction
}

export interface ModuleAuthor {
  avatar?: Avatar
  face: string
  face_nft: boolean
  following: boolean
  jump_url: string
  label: ModuleAuthorLabel
  mid: number
  name: string
  official_verify?: OfficialVerify
  pendant?: Pendant
  pub_action: PubAction
  pub_location_text?: string
  pub_time: string
  pub_ts: number
  type: ModuleAuthorType
  vip?: Vip
  decorate?: Decorate
}

export interface Avatar {
  container_size: ContainerSize
  fallback_layers: FallbackLayers
  mid: string
  layers?: AvatarLayer[]
}

export interface ContainerSize {
  height: number
  width: number
}

export interface FallbackLayers {
  is_critical_group: boolean
  layers: FallbackLayersLayer[]
}

export interface FallbackLayersLayer {
  general_spec: GeneralSpec
  layer_config: LayerConfig
  resource: PurpleResource
  visible: boolean
}

export interface GeneralSpec {
  pos_spec: PosSpec
  render_spec: RenderSpec
  size_spec: ContainerSize
}

export interface PosSpec {
  axis_x: number
  axis_y: number
  coordinate_pos: number
}

export interface RenderSpec {
  opacity: number
}

export interface LayerConfig {
  is_critical?: boolean
  tags: Tags
}

export interface Tags {
  AVATAR_LAYER?: Layer
  GENERAL_CFG?: GeneralCFG
  ICON_LAYER?: Layer
  PENDENT_LAYER?: Layer
}

export interface Layer {
}

export interface GeneralCFG {
  config_type: number
  general_config: GeneralConfig
}

export interface GeneralConfig {
  web_css_style: WebCSSStyle
}

export interface WebCSSStyle {
  borderRadius: BorderRadius
  'background-color'?: BackgroundColor
  border?: Border
  boxSizing?: BoxSizing
}

export enum BackgroundColor {
  RGB255255255 = 'rgb(255,255,255)',
}

export enum Border {
  The2PxSolidRGBA2552552551 = '2px solid rgba(255,255,255,1)',
}

export enum BorderRadius {
  The50 = '50%',
}

export enum BoxSizing {
  BorderBox = 'border-box',
}

export interface PurpleResource {
  res_image: ResImage
  res_type: number
}

export interface ResImage {
  image_src: ImageSrc
}

export interface ImageSrc {
  placeholder?: number
  remote?: Remote
  src_type: number
  local?: number
}

export interface Remote {
  bfs_style: BFSStyle
  url: string
}

export enum BFSStyle {
  WidgetLayerAvatar = 'widget-layer-avatar',
}

export interface AvatarLayer {
  is_critical_group?: boolean
  layers: LayerLayer[]
}

export interface LayerLayer {
  general_spec: GeneralSpec
  layer_config: LayerConfig
  resource: FluffyResource
  visible: boolean
}

export interface FluffyResource {
  res_image?: ResImage
  res_type: number
  res_animation?: ResAnimation
}

export interface ResAnimation {
  webp_src: WebpSrc
}

export interface WebpSrc {
  remote: Remote
  src_type: number
}

export interface Decorate {
  card_url: string
  fan: Fan
  id: number
  jump_url: string
  name: string
  type: number
}

export interface Fan {
  color: string
  is_fan: boolean
  num_str: string
  number: number
}

export enum ModuleAuthorLabel {
  Empty = '',
  番剧 = '番剧',
  合集 = '合集',
}

export interface OfficialVerify {
  desc: string
  type: number
}

export interface Pendant {
  expire: number
  image: string
  image_enhance: string
  image_enhance_frame: string
  n_pid: number
  name: string
  pid: number
}

export enum PubAction {
  投稿了视频 = '投稿了视频',
  更新了 = '更新了',
}

export enum ModuleAuthorType {
  AuthorTypeNormal = 'AUTHOR_TYPE_NORMAL',
  AuthorTypePgc = 'AUTHOR_TYPE_PGC',
  AuthorTypeUgcSeason = 'AUTHOR_TYPE_UGC_SEASON',
}

export interface Vip {
  avatar_subscript: number
  avatar_subscript_url: string
  due_date: number
  label: LabelClass
  nickname_color: Color
  status: number
  theme_type: number
  type: number
}

export interface LabelClass {
  bg_color: Color
  bg_style: number
  border_color: string
  img_label_uri_hans: string
  img_label_uri_hans_static: string
  img_label_uri_hant: string
  img_label_uri_hant_static: string
  label_theme: LabelTheme
  path: string
  text: LabelText
  text_color: TextColorEnum
  use_img_label: boolean
}

export enum Color {
  Empty = '',
  Fb7299 = '#FB7299',
}

export enum LabelTheme {
  AnnualVip = 'annual_vip',
  Empty = '',
  TenAnnualVip = 'ten_annual_vip',
}

export enum LabelText {
  Empty = '',
  十年大会员 = '十年大会员',
  年度大会员 = '年度大会员',
}

export enum TextColorEnum {
  Empty = '',
  Ffffff = '#FFFFFF',
}

export interface ModuleDynamic {
  additional: MomentAdditional | null
  desc: ModuleDynamicDesc | null
  major: Major
  topic: Topic | null
}

export interface MomentAdditional {
  type?: string
  common?: MomentAdditionalCard
  vote?: MomentAdditionalCard
  reserve?: MomentAdditionalCard
  ugc?: MomentAdditionalCard
  goods?: MomentAdditionalCard
  match?: MomentAdditionalCard
  upower_lottery?: MomentAdditionalCard
}

export interface MomentAdditionalCard {
  button?: {
    check?: { text?: string }
    jump_style?: { text?: string }
    jump_url?: string
    status?: number
    text?: string
    type?: number
    uncheck?: { text?: string }
  }
  cover?: string
  desc?: string | { text?: string }
  desc1?: string | { text?: string }
  desc2?: string | { text?: string }
  head_text?: string
  icon?: string
  jump_url?: string
  reserve_total?: number
  rid?: string | number
  title?: string
}

export interface ModuleDynamicDesc {
  rich_text_nodes: PurpleRichTextNode[]
  text: string
}

export interface PurpleRichTextNode {
  orig_text: string
  text: string
  type: string
}

export interface Major {
  archive?: Archive
  article?: MomentMajorContent
  common?: MomentMajorContent
  draw?: { items?: MomentImage[] }
  live_rcmd?: { content?: string }
  opus?: MomentMajorContent & {
    pics?: MomentImage[]
    summary?: string | { rich_text_nodes?: PurpleRichTextNode[], text?: string }
  }
  type: MajorType
  pgc?: Pgc
  /** 合集订阅更新动态，字段形态接近 Archive */
  ugc_season?: UgcSeason
}

export interface MomentImage {
  height?: number
  size?: { height?: number, width?: number }
  src?: string
  url?: string
  width?: number
}

export interface MomentMajorContent {
  cover?: string
  covers?: string[]
  desc?: string
  jump_url?: string
  title?: string
}

export interface Archive {
  aid: string
  badge: Badge
  bvid: string
  cover: string
  coop_info?: Array<{ mid?: number | string }>
  desc: string
  disable_preview: number
  duration_text: string
  jump_url: string
  stat: Stat
  title: string
  type: number
}

export interface Badge {
  bg_color: Color
  color: TextColorEnum
  icon_url?: null
  text: BadgeText
}

export enum BadgeText {
  投稿视频 = '投稿视频',
  番剧 = '番剧',
  充电专属 = '充电专属',
  动态视频 = '动态视频',
  合集 = '合集',
}

export interface Stat {
  like?: string
  danmaku: string
  play: string
  like_str?: string
  share?: string
  reply?: string
  favorite?: string
  coin?: string
}

export interface Pgc {
  badge: Badge
  cover: string
  epid: number
  jump_url: string
  season_id: number
  stat: Stat
  sub_type: number
  title: string
  type: number
}

/** 合集订阅（DYNAMIC_TYPE_UGC_SEASON / MAJOR_TYPE_UGC_SEASON） */
export interface UgcSeason {
  aid: string
  badge: Badge
  bvid: string
  cover: string
  coop_info?: Array<{ mid?: number | string }>
  desc: string
  disable_preview?: number
  duration_text: string
  enable_vt?: number
  jump_url: string
  premiere_online?: string
  stat: Stat
  stat_hidden?: number
  title: string
  type: number
}

export enum MajorType {
  MajorTypeArticle = 'MAJOR_TYPE_ARTICLE',
  MajorTypeArchive = 'MAJOR_TYPE_ARCHIVE',
  MajorTypeDraw = 'MAJOR_TYPE_DRAW',
  MajorTypePgc = 'MAJOR_TYPE_PGC',
  MajorTypeUgcSeason = 'MAJOR_TYPE_UGC_SEASON',
}

export interface Topic {
  id: number
  jump_url: string
  name: string
}

export interface ModuleInteraction {
  items: ModuleInteractionItem[]
}

export interface ModuleInteractionItem {
  desc: ItemDesc
  type: number
}

export interface ItemDesc {
  rich_text_nodes: FluffyRichTextNode[]
  text: string
}

export interface FluffyRichTextNode {
  orig_text: string
  rid?: string
  text: string
  type: string
  emoji?: Emoji
}

export interface Emoji {
  icon_url: string
  size: number
  text: string
  type: number
}

export interface ModuleMore {
  three_point_items: ThreePointItem[]
}

export interface ThreePointItem {
  label: ThreePointItemLabel
  type: ThreePointItemType
}

export enum ThreePointItemLabel {
  举报 = '举报',
  取消关注 = '取消关注',
}

export enum ThreePointItemType {
  ThreePointFollowing = 'THREE_POINT_FOLLOWING',
  ThreePointReport = 'THREE_POINT_REPORT',
}

export interface ModuleStat {
  comment: Comment
  forward: Comment
  like: Like
}

export interface Comment {
  count: number
  forbidden: boolean
}

export interface Like {
  count: number
  disabled?: boolean
  forbidden: boolean
  status: boolean
}

export enum ItemType {
  DynamicTypeArticle = 'DYNAMIC_TYPE_ARTICLE',
  DynamicTypeAV = 'DYNAMIC_TYPE_AV',
  DynamicTypeDraw = 'DYNAMIC_TYPE_DRAW',
  DynamicTypeForward = 'DYNAMIC_TYPE_FORWARD',
  DynamicTypePgcUnion = 'DYNAMIC_TYPE_PGC_UNION',
  DynamicTypeUgcSeason = 'DYNAMIC_TYPE_UGC_SEASON',
}
