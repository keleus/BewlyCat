# Bilibili 视频增强分享 Spec

- 状态：已实现；验证记录见 [交付说明](./bilibili-video-share-delivery.md)
- 目标项目：BewlyCat
- 功能基线：相邻的 `bilibili-share-extension` 项目
- 技术约束：Vue 3、TypeScript、Vite、UnoCSS、pnpm
- 文档范围：仅描述本地实现计划与验收标准，不包含代码实现

## Problem Statement

Bilibili 视频页的原生分享入口只提供站点内置的复制、二维码和平台动作，难以在一个稳定的界面中完成以下常见任务：复制可控的分享文本或页面链接、选择从当前播放时间开始、查看高分辨率二维码、生成可下载的正方形海报，以及在浏览器支持时调用系统分享。

源扩展已经验证了一套针对标准 BV 视频页的行为契约：识别可见的原生分享入口，生成带 `share_source=copy_web` 的 Bilibili 兼容链接，可选追加向下取整的 `t` 秒参数，并在封面不可读取时仍能生成可用的二维码、链接和降级海报。

BewlyCat 已经具备视频页生命周期、Shadow DOM 应用壳、统一 Dialog/Button/Icon 组件、二维码依赖、剪贴板净化逻辑和浏览器存储封装。缺少的是把这些能力组合成一个与现有页面生命周期和设计系统一致的增强分享流程，同时避免重复实现现有的分享链接净化和持久化机制。

## Solution

在 BewlyCat 的顶层标准视频页中接管可见且可确认属于视频操作栏的 Bilibili 原生分享入口，打开 BewlyCat 内部的 Vue 分享 Dialog。原生 DOM 保留不删除；当适配器无法安全识别当前视频、入口被遮挡或弹窗操作不可用时，用户可以继续调用 Bilibili 原生分享流程。

弹窗提供两种视图：

- 快捷分享：显示封面、标题、UP 主、BVID、当前时间和最终分享链接，支持复制分享文本、复制页面链接、系统 Web Share 和打开 Bilibili 原生分享。
- 二维码海报：本地生成二维码和 `1080 × 1080` PNG 海报，使用深灰到黑色渐变、轻微噪点、压暗圆角封面、半透明标签和紧凑底部信息区；支持复制 PNG（浏览器能力可用时）和下载 PNG。

分享 URL 和分享文本由单一的 TypeScript 适配器生成。默认保留 Bilibili 原生兼容格式；当现有 `enableCleanShareLink` 策略启用时，所有增强弹窗的面向用户输出遵循现有净化设置，不修改既有净化函数的参数名单或行为。

初版不保存视频封面、海报、最近分享记录或弹窗标签状态。需要持久化的只有现有分享链接策略，它们继续由 `settings` 通过 BewlyCat 的本地设置协调器保存；当前播放时间和“从当前时间开始分享”勾选状态属于一次弹窗会话。

## User Stories

1. 作为 Bilibili 视频观看者，我希望点击视频操作栏的分享入口就能打开增强分享弹窗，以便不离开当前视频完成分享准备。
2. 作为用户，我希望只有标准 `www.bilibili.com/video/BV...` 视频页启用增强入口，以便其他页面不被误拦截。
3. 作为用户，我希望原生分享节点仍然存在，以便增强功能失效时可以使用 Bilibili 自带流程。
4. 作为用户，我希望弹窗显示当前视频标题，以便确认分享对象正确。
5. 作为用户，我希望弹窗显示 UP 主和 BVID，以便核对视频身份。
6. 作为用户，我希望弹窗优先显示视频封面，以便在复制或生成海报前快速确认内容。
7. 作为用户，我希望封面缺失或跨域像素不可读取时仍能分享链接和二维码，以便图片能力失败不会阻断核心分享任务。
8. 作为用户，我希望弹窗显示当前播放器时间，以便决定是否从当前进度分享。
9. 作为用户，我希望勾选“从当前时间开始分享”后生成 `t` 参数，以便收件人打开链接时从当前秒数附近开始播放。
10. 作为用户，我希望时间参数使用整数秒向下取整，以便 URL 与 Bilibili 原生分享行为一致。
11. 作为用户，我希望超过一小时的视频时间显示为 `HH:MM:SS`，以便时间信息无歧义。
12. 作为用户，我希望未勾选时间选项时生成不带 `t` 的链接，以便分享整段视频入口。
13. 作为用户，我希望默认链接带有 Bilibili 兼容的 `share_source=copy_web`，以便保留原生分享语义。
14. 作为用户，我希望一键复制 Bilibili 格式分享文本，以便直接粘贴到聊天或社交平台。
15. 作为用户，我希望一键复制纯页面链接，以便在不需要标题时使用短内容。
16. 作为启用分享链接净化的用户，我希望复制结果遵循现有净化设置，以便不同入口的链接处理规则一致。
17. 作为用户，我希望在浏览器支持 Web Share 时调用系统分享面板，以便使用系统提供的应用列表。
18. 作为不支持 Web Share 的用户，我希望系统分享按钮不可用或给出明确失败反馈，以便知道应改用复制操作。
19. 作为用户，我希望看到可扫码打开最终链接的二维码，以便在手机上继续观看。
20. 作为用户，我希望二维码始终放在不透明白色底板和足够 quiet zone 上，以便提高扫码成功率。
21. 作为用户，我希望切换时间选项后二维码同步更新，以便二维码与页面上显示的链接一致。
22. 作为用户，我希望切换到海报视图时看到正方形海报预览，以便确认导出结果。
23. 作为用户，我希望海报固定输出 `1080 × 1080` 真实像素，以便在高 DPI 设备上保持清晰。
24. 作为用户，我希望海报包含标题、作者、BVID、可选的当前时间和二维码，以便脱离原页面也能识别分享内容。
25. 作为用户，我希望长标题在海报中被有界截断而不是溢出，以便导出的图片保持完整布局。
26. 作为用户，我希望海报使用稳定的深灰到黑色渐变和高对比文字，以便不同封面颜色下仍保持统一可读。
27. 作为用户，我希望封面使用圆角和压暗处理，并在下方显示半透明标签，以便内容层次清晰。
28. 作为用户，我希望二维码显著缩小并与底部 Logo、作者和 BV 号紧凑排列，以便海报主体突出。
29. 作为支持图片剪贴板的用户，我希望复制海报 PNG 后可以直接粘贴到其他应用，以便减少中间保存步骤。
30. 作为不支持图片剪贴板的用户，我希望仍可下载海报，以便功能有可用替代路径。
31. 作为用户，我希望点击“打开 Bilibili 原生分享”后能回到原生平台动作，以便使用动态、微信、QQ、QQ 空间、微博、贴吧和嵌入代码等未在增强弹窗中稳定复刻的能力。
32. 作为未登录用户，我希望原生平台动作失败时不影响复制链接和二维码，以便登录状态不阻断基础分享。
33. 作为用户，我希望按 Escape、点击遮罩或关闭按钮都能关闭弹窗，以便快速退出。
34. 作为键盘用户，我希望弹窗有 Dialog 语义、可见焦点和焦点循环，以便不依赖鼠标完成操作。
35. 作为键盘用户，我希望关闭弹窗后焦点回到触发分享的原生入口，以便继续浏览页面。
36. 作为窄屏用户，我希望弹窗内容可滚动且控件不会互相遮挡，以便在移动尺寸窗口中完成分享。
37. 作为使用深色主题的用户，我希望弹窗沿用 BewlyCat 当前主题和语义颜色，以便界面不出现孤立的亮色样式。
38. 作为用户，我希望 Bilibili 重绘操作栏后增强入口不会重复绑定，以便一次点击只打开一个弹窗。
39. 作为用户，我希望 SPA 切换到另一个视频后旧弹窗和旧绑定被清理，以便不会分享上一个视频的信息。
40. 作为用户，我希望播放器、操作栏或封面延迟加载时功能最终能够重试发现，以便加载时序不会决定功能是否可用。
41. 作为用户，我希望非视频页、嵌入 iframe 和不受支持的特殊播放页保持原有行为，以便功能边界清晰。
42. 作为维护者，我希望 URL、文本、时间、封面 URL 和海报纯函数有独立契约，以便 Bilibili DOM 变化时可以先验证数据层。
43. 作为维护者，我希望所有界面文案进入中简、中繁、英文和粤语 locale，以便不同语言环境下没有硬编码文本。
44. 作为维护者，我希望仅使用现有权限和依赖就能完成第一版，以便降低扩展权限和发布风险。
45. 作为维护者，我希望验证只运行仓库允许的 lint、类型检查和开发编译，以便遵守 BewlyCat 的验证约束。

## Implementation Decisions

### 1. 支持边界与入口识别

- 初版只处理顶层、HTTPS、主机为 `www.bilibili.com`、路径匹配 `/video/BV[0-9A-Za-z]{10}(?:/|$)` 的标准 BV 视频页。
- `isVideoOrBangumiPage()` 可作为页面生命周期的粗粒度门控，但分享适配器必须再做严格 BV 路由校验；番剧、课程、直播、专栏、搜索、列表和嵌入页不进入本功能的增强流程。
- 原生入口识别采用优先级策略：稳定 ID 与类名组合优先，其次是视频操作栏上下文中的分享节点，最后才使用带有明确原生复制文案的有限启发式。
- 候选入口必须通过连接状态、可见性、尺寸和遮挡检查，并确认属于视频信息/工具栏上下文。不能因为页面存在任意包含 `share` 的元素就拦截点击。
- 入口绑定放在 `src/contentScripts/` 的视频页功能控制器中，由现有 `src/contentScripts/index.ts` 的初始化和路由生命周期启动与销毁。控制器使用已有的 `pushstate`、`replacestate`、`popstate`、`hashchange` 事件协作机制，不再另行复制一套全局 history 补丁。
- 使用一个合并调度的 `MutationObserver` 观察原生视频操作区变化，处理 Bilibili Vue 重绘、节点替换和延迟挂载；同一原生节点最多存在一个捕获监听器。
- 只有在适配器成功建立当前视频会话后才阻止原生 click。适配失败时保留原生点击路径，避免增强功能故障造成分享入口失效。

### 2. 原生 fallback 与生命周期

- 增强入口不删除、不隐藏、不替换原生 DOM；若 BewlyCat 的宽屏布局移动原生操作节点，控制器按最终连接节点重新绑定。
- 弹窗中的原生 fallback 保存入口的动态连接状态。触发原生 click 时临时解除增强捕获监听，调用原生节点动作，再恢复监听，避免递归打开增强弹窗。
- 路由变化、当前 BVID 变化、入口节点被移除或应用销毁时，必须关闭当前弹窗并移除监听器、Observer、定时器和 pending 异步任务。
- 弹窗打开后只刷新当前时间和会话派生 URL，不重新抓取可能已经属于另一个视频的标题或封面；检测到 BVID 变化则关闭并等待新入口重新建立会话。
- 入口发现应等待现有视频页稳定时序，不能为了分享功能提前搬动播放器、顶栏或操作栏 DOM。

### 3. 数据适配器与分享契约

在 `src/utils/` 下新增一个窄职责的分享适配器模块；它只负责可测试的数据读取、校验和派生，不负责 Vue 渲染或存储。

```ts
interface VideoShareSession {
  adapterVersion: string
  bvid: string
  title: string
  coverUrl: string
  coverState: 'available' | 'unavailable'
  owner: string
  tags: string[]
  duration: number
  currentTime: number
  withTimestamp: boolean
  url: string
  text: string
  capabilities: {
    qr: boolean
    poster: boolean
    copy: boolean
    webShare: boolean
    nativeFallback: boolean
    download: boolean
  }
}
```

- BVID 从当前 pathname 提取并严格校验；页面私有全局状态只能作为高优先级数据源或校验辅助，不能成为唯一依赖。
- 标题读取顺序为页面视频数据、视频标题节点、`h1`、Open Graph 元数据、document title；去除 Bilibili 页面品牌后缀，空值使用带 BVID 的安全 fallback。
- 作者读取视频数据 owner，再回退到视频作者区域；空值显示本地化的“未提供”类文案。
- 封面读取顺序为已验证的视频数据 `videoData.pic`、可见的原生分享封面、Open Graph 图片和页面视频封面。只接受 HTTP/HTTPS 的 Bilibili 图片主机及其子域名，协议相对 URL 规范化为 HTTPS，拒绝 data、javascript 和任意第三方地址。
- 当前时间只从可见、有效的主播放器 `video` 元素读取；不可用或负值归零。时长读取视频数据，失败时回退播放器 duration。
- `buildBilibiliShareUrl` 使用 `URL`/`URLSearchParams` 生成 `https://www.bilibili.com/video/{bvid}/`，默认设置 `share_source=copy_web`；勾选时间后增加 `t=floor(max(currentTime, 0))`。
- `formatTimestamp` 在一小时以内返回 `MM:SS`，超过一小时返回 `HH:MM:SS`；不使用字符串拼接解析 URL。
- 默认分享文本保持源扩展契约：`【标题】`、可选的 `【精准空降到 时间】` 和最终 URL。
- 时间勾选切换只更新一个会话边界：`currentTime`、`withTimestamp`、`url`、`text` 同步更新，BVID 和元数据不变。

### 4. 与现有“分享链接净化”的关系

- 不新增另一套“清理分享链接”设置，也不修改 `cleanBilibiliUrl`、`cleanBilibiliShareText` 的既有追踪参数集合。
- `enableCleanShareLink`、`cleanShareLinkIncludeTitle` 和 `cleanShareLinkRemoveTrackingParams` 继续是唯一的分享净化策略来源；它们属于 `Settings`，由现有 `useSettingsStorage` 和后台设置协调器持久化。
- 增强弹窗的复制页面链接遵循现有“移除追踪参数”开关；复制分享文本遵循现有“是否包含标题”语义。关闭净化时保留源扩展的 Bilibili 兼容文本格式。
- 二维码、海报中的二维码和 Web Share 使用与弹窗展示一致的最终有效 URL，避免用户看到的链接与实际扫码/系统分享链接不一致。
- 触发原生 fallback 时不主动重写原生 DOM 或原生内部动作；现有 `src/inject/index.ts` 的 copy 事件净化继续负责原生复制路径，增强控制器不重复处理同一份剪贴板事件。
- 由于现有设置已是共享设置，新增功能不增加独立 storage key，也不改变云端同步字段判定；新代码只能读取设置，不应把临时会话写回 `settings`。

### 5. Vue 弹窗与交互组件

- 在 `src/components/` 新增视频分享 Dialog 及必要的局部子组件；复用 `Dialog.vue` 的关闭协议、Teleport、加载遮罩和 Escape/遮罩关闭行为，并在分享 Dialog 的最高合适层级补充焦点初始定位、循环和关闭后回收；操作控件复用 `Button.vue`、`Icon.vue`、`Tooltip.vue`，不手写第二套 modal 外壳。
- 弹窗由内容脚本主应用挂载在 `#bewly` 的 Shadow DOM 内，通过现有组件自动注册和 `setupApp` 接入，不创建页面文档外的独立闭合 Shadow DOM。
- 结构保持“视频身份信息 + 二维码 + 分段视图 + 操作区”的层次。宽屏采用双栏，窄屏切为单栏；所有固定格式区域使用 `aspect-ratio`、`min/max` 和稳定的网格约束，避免标题、加载态或按钮导致布局跳动。
- “快捷分享/二维码海报”使用 `src/styles/segmentControl.scss` 的 `.bew-segment-control`、`.bew-segment-control__item` 和对应 `data-segment-item`/`data-active` 约定；需要液态指示器时统一使用 `LiquidSegmentIndicator.vue`，页面不重复实现指示器。
- 样式只使用 `src/styles/variables.scss` 中的语义 token：正文、标题、控件字号和行高使用对应 `--bew-font-size-*`/`--bew-line-height-*`，间距使用 4px 基准的 `--bew-space-*`，圆角使用 `--bew-modal-radius`、`--bew-panel-radius`、`--bew-card-radius`、`--bew-interactive-radius` 等语义别名。
- 操作按钮使用 Iconify/Lucide 风格的现有 Icon 资源；纯图标按钮必须有 aria-label 和 Tooltip，文字按钮在可扫描性优先的操作中保留图标加文字。
- 所有 default、hover、focus-visible、active、disabled 状态均需明确；点击目标不小于 `24 × 24 CSS px`，不通过负字距或视口缩放字号解决拥挤。
- 页面标题、UP 主名、BVID、链接等不可信数据通过文本绑定渲染，不使用 `v-html`；海报文字通过 canvas `fillText`，避免把页面数据当作 HTML。
- 弹窗状态至少包括 active tab、时间开关、二维码错误、海报 loading/success/error、操作 success/error 和关闭状态。异步海报渲染使用递增 token 或等价取消门，旧任务不能覆盖新会话。
- `navigator.clipboard.writeText`、图片剪贴板、`navigator.share`、canvas 和下载能力按运行时能力检测；单项失败显示 toast/status，并保留其他操作。
- 使用 `prefers-reduced-motion` 时关闭或缩短非必要动画；弹窗内容区限制高度并在内部滚动，防止滚动穿透。

### 6. QR 与海报

- QR 直接复用已安装的 `qrcode.vue`，不新增 QR 依赖、不调用远程二维码服务；展示尺寸和海报嵌入尺寸分别由 UI 与 canvas 需求决定，但都基于同一个最终 URL。
- 海报渲染可拆成 `src/utils/` 的纯函数/渲染模块，输入只接受 `VideoShareSession` 和 canvas；固定输出真实像素 `1080 × 1080`。
- 封面加载设置 `crossOrigin`，只对已校验的 Bilibili 图片 URL 发起浏览器图片请求。像素读取失败视为不可读封面，不尝试绕过 CORS，不上传封面或海报。
- 海报背景固定使用深灰到黑色渐变并叠加轻微确定性噪点；不依赖封面主色采样，也不因封面颜色改变文字方案。
- 海报标题最多两行；封面使用圆角裁剪、固定黑色 scrim 和底部渐变压暗，封面下最多显示四个半透明标签。
- 封面无法绘制时，海报仍包含安全默认背景、标题、BVID、时间信息和二维码；二维码始终使用不透明白色底板和 quiet zone。
- 文件名遵循 `bilibili-{bvid}-share.png`，只保留字母、数字、下划线和连字符；下载使用页面上下文的 anchor/data URL，不申请 `downloads` 权限。

### 7. 设置、存储与本地数据边界

- 初版不增加新的开关或独立分享设置。源扩展功能默认在满足支持边界时可用，禁用需求由原生 fallback 和后续明确产品需求另行处理。
- 现有三个分享净化字段继续位于 `src/logic/storage.ts` 的 `Settings`，默认值和迁移逻辑不改变：
  - `enableCleanShareLink`
  - `cleanShareLinkIncludeTitle`
  - `cleanShareLinkRemoveTrackingParams`
- 这些字段经 `useSettingsStorage` 写入已有设置存储协议；不新增 `useStorageLocal` key，不把图片、canvas、Blob、data URL、当前时间、active tab 或一次性 status 写入 `browser.storage.local`。
- 现有 `src/background/settingsStorageCoordinator.ts`、`src/background/index.ts` 和云端同步流程无需为临时分享会话增加消息协议或权限。若以后新增用户可配置的分享选项，必须先判断它是跨设备设置还是设备本地设置，再按现有 Settings/LocalSettings 边界加入，不得在组件内直接调用存储 API。
- 设置初始化必须等待 `settingsReady` 后再注册依赖净化策略的监听器，避免默认值覆盖已保存设置；设置变化时只更新后续分享会话，不改写已打开会话的身份数据。

### 8. 模块职责与预期修改面

| 模块 | 计划职责 |
| --- | --- |
| `src/contentScripts/index.ts` | 在现有视频页初始化、路由变化和销毁生命周期中启动/停止分享控制器；不承载海报细节。 |
| `src/contentScripts/` 视频功能模块 | 发现原生入口、可见性/遮挡校验、捕获 click、Observer 去重、SPA 重绑定、原生 fallback 和弹窗实例管理。 |
| `src/components/` 视频分享 Dialog | 渲染 Shadow DOM 内的弹窗、分段视图、时间开关、操作反馈、键盘可访问性和响应式布局。 |
| `src/utils/` 分享适配器 | BVID/页面元数据/播放器数据读取、Bilibili URL/文本生成、时间格式化、封面 URL 校验与会话更新。 |
| `src/utils/` 海报渲染模块 | canvas 尺寸、深色渐变与噪点、封面圆角压暗、标签、二维码嵌入和安全文件名。 |
| `src/logic/storage.ts` | 仅确认并复用现有分享净化字段；不新增会话持久化字段。若类型或默认值需要兼容修正，保持现有迁移策略。 |
| `src/inject/index.ts` / `src/utils/pageSettingsProtocol.ts` | 保持现有原生 copy 事件净化协议；仅在确有字段变化时同步，初版预计无需新增 payload 字段。 |
| `src/components/Settings/Compatibility/Compatibility.vue` | 保持现有净化设置 UI；初版不添加重复的增强分享设置。 |
| `src/components/Settings/searchCatalog.ts` | 只有新增设置项时才更新；初版无需新增条目。 |
| `src/_locales/cmn-CN.yml`、`cmn-TW.yml`、`en.yml`、`jyut.yml` | 增加弹窗、操作、状态、错误、无封面和能力降级文案；现有净化文案保持语义不变。 |
| `src/manifest.ts` | 首选不变；复核现有 `storage`、Bilibili/图片 host permissions 是否已覆盖实现，第一版不申请 `downloads`、`tabs`、`cookies`、`<all_urls>` 或远程服务权限。 |
| `src/background/` | 初版不新增后台消息；仅在验证发现页面上下文无法完成某项能力时再单独评估，不能预先加入权限或 fallback 协议。 |

### 9. 实施阶段与完成标准

1. 契约层：先建立严格 BV 路由、入口候选、会话数据、URL/文本/时间格式和安全封面 URL 的 TypeScript seam，并用最小纯函数检查锁定外部行为。
2. 生命周期层：接入现有视频页初始化、稳定等待、history 事件和 MutationObserver，实现入口去重、路由清理、原生 fallback 和资源销毁。
3. 弹窗层：使用 Vue 组件接入 Shadow DOM、Dialog 关闭协议、焦点管理、分段视图、复制/Web Share/二维码和本地化状态反馈。
4. 海报层：加入按需 canvas 渲染、深色渐变与噪点、封面圆角压暗、标签、二维码嵌入、图片复制和安全文件名下载。
5. 验证层：在 `pnpm dev` 下完成真实视频页状态矩阵，再运行 `pnpm lint` 和 `pnpm typecheck`；不执行任何构建命令。

完成标准：

- 标准 BV 视频页的可见原生分享入口能稳定打开增强 Dialog，非目标页面和 iframe 不被拦截。
- 无论封面、剪贴板、图片剪贴板或 Web Share 哪一项失败，复制链接、二维码或原生 fallback 至少保留一条可用路径。
- 时间切换、链接净化、二维码、海报和 Web Share 使用同一个有效 URL，不出现过期会话或重复点击处理。
- 弹窗在浅色/深色主题、窄屏和键盘操作下无重叠、无焦点丢失，并符合现有 token 与 Shadow DOM 样式边界。
- 变更不新增独立分享存储键、远程服务、后台消息或扩展权限；文案在四种现有 locale 中齐全。
- `pnpm lint`、`pnpm typecheck` 成功，`pnpm dev` 下能观察到内容脚本编译和目标交互；未执行任何 `build` 操作。

## Data Structures

### 会话数据

`VideoShareSession` 是一次打开弹窗时从当前视频页面采集的不可持久化快照。`url` 和 `text` 是派生字段，不接受组件自行拼接；时间切换通过一个 `updateShareSession` 边界函数更新。

字段约束如下：

| 字段 | 约束 |
| --- | --- |
| `adapterVersion` | 适配器契约版本，用于后续诊断 DOM 变化，不参与用户数据存储。 |
| `bvid` | 严格的 `BV` 加 10 位字母数字标识。 |
| `title` | 清理品牌后缀的非空文本，必要时使用 BVID fallback。 |
| `coverUrl` | 校验后的 Bilibili HTTPS 图片 URL，失败为空字符串。 |
| `coverState` | 只表示 URL 是否可用，不等同于 canvas 是否可读。 |
| `owner` | 非空时为作者名，缺失时为空字符串。 |
| `duration` | 非负有限秒数；不可用时为 0。 |
| `currentTime` | 非负有限秒数；不可用时为 0。 |
| `withTimestamp` | 仅表示当前弹窗会话开关。 |
| `url` | 由 BVID、`share_source` 和可选 `t` 派生。 |
| `text` | 由标题、可选时间说明和 URL 派生。 |
| `capabilities` | 当前浏览器能力快照，按钮据此禁用或显示降级反馈。 |

### 弹窗状态

弹窗内部状态为短生命周期 UI 状态，不写入存储：

- `activeTab`: `quick` 或 `poster`
- `withTimestamp`: boolean
- `posterState`: `idle`、`loading`、`ready`、`error`
- `operationState`: 当前操作的 `idle`、`pending`、`success` 或 `error`
- `statusMessage`: 本地化、短生命周期的可访问状态文本
- `sessionGeneration`: 用于丢弃过期异步海报结果

### 持久化数据

初版唯一相关的持久化字段是现有 `Settings` 中的三个分享净化字段，存储介质和同步行为均保持当前实现：

- 主设置：通过 `useSettingsStorage` 进入已有 `browser.storage.local` 设置协调器。
- 云端同步：若用户已启用现有设置同步，字段沿既有同步协议处理；功能不创建单独云端键。
- 不持久化：视频标题、封面 URL、海报 PNG、二维码矩阵、BVID、当前播放时间、时间开关、弹窗标签、操作状态和错误信息。

## Interaction Flow

1. 内容脚本确认当前为顶层标准 BV 视频页，并等待既有视频页 DOM 稳定。
2. 分享控制器按选择器优先级寻找可见、未遮挡且属于视频操作栏的原生入口。
3. 控制器为该节点绑定捕获监听，并在 MutationObserver/路由事件后合并重试；已绑定节点不重复绑定。
4. 用户点击入口后，控制器先建立最新 `VideoShareSession`。建立失败时不阻止原生 click。
5. 会话有效时阻止原生动作，创建/更新 Vue Dialog，并把触发入口作为焦点回收目标。
6. Dialog 首屏显示视频身份、封面（或安全占位）、UP 主、BVID、当前时间和二维码；二维码使用当前最终 URL。
7. 用户切换时间开关时，读取最新播放器秒数，更新 session 的 `url`/`text`，刷新链接、二维码和已显示的海报。
8. 用户点击复制文本或复制链接时，调用统一输出策略；成功显示 toast/status，失败不关闭弹窗。
9. 用户点击系统分享时，在用户手势上下文调用 `navigator.share`；取消分享不视为应用错误，其他异常显示可恢复提示。
10. 用户切换海报视图时懒生成海报；渲染期间显示加载状态，过期渲染结果丢弃。
11. 用户复制或下载海报时，复用已完成的 canvas；若图片剪贴板不可用，保留下载路径。
12. 用户点击原生 fallback 时临时解绑增强监听，触发原生入口，恢复监听并关闭增强 Dialog；若入口已失效，显示错误并不伪造平台动作。
13. 用户按 Escape、点击遮罩或关闭按钮时，按 `Dialog.vue` 关闭协议结束过渡，再由父级清理实例；焦点回到原生入口。
14. SPA 路由变化或原生节点重绘时，控制器关闭旧实例、清理旧监听并以新 BVID 重新采集；离开支持范围后完全卸载功能。

## Compatibility And Security

### 浏览器与扩展平台

- 继续兼容 BewlyCat 当前由 Vite/tsup 生成的 Chrome/Edge 与 Firefox 产物；不依赖仅单一浏览器提供的 API 作为核心路径。
- `navigator.share`、`navigator.clipboard.writeText`、`ClipboardItem`、canvas `toBlob` 和 anchor 下载均按能力检测；核心复制链接/显示二维码不能依赖某一项可选能力。
- 不新增后台消息、远程请求或扩展权限。现有 `src/manifest.ts` 的 Bilibili 与图片 host 范围只在实现确实需要时复核，不扩大到任意站点。
- Web Share 必须在用户 click 的 transient activation 内调用；不能搬到 service worker 延迟执行。
- 海报的图片请求不发送 Cookie，不读取账户信息，不上传封面或生成结果；CORS 失败直接走默认背景/无封面路径。

### Bilibili 页面兼容

- Bilibili 的 class、id、层级和私有初始状态均视为易变适配面。适配器保留多级 selector、DOM/meta fallback 和 `adapterVersion`，不把任意私有字段当作长期 API。
- 原生分享节点可能是 `div` 而不是 `button`；识别逻辑不得只依赖 button role。
- 页面可能同时出现顶部、播放器、动态或其他相似分享节点；必须要求视频工具栏上下文、可见性和原生复制文案条件。
- 登录遮罩、未登录状态、全屏、宽屏布局、播放器重建、分 P/合集切换和原生操作栏重绘都不能导致重复监听或错误视频数据泄漏到新会话。
- 初版不复刻未稳定验证的平台内部 URL；动态、微信、QQ、QQ 空间、微博、贴吧和嵌入代码通过原生 fallback 保留完整能力。
- 不拦截搜索页、直播页、专栏页、番剧/课程特殊页、Bilibili 子站或跨域 iframe。

### 安全边界

- 所有页面标题、作者、BVID、链接参数和 DOM 文本都是不可信输入；只使用文本绑定、`URL` API、canvas 文本绘制和白名单图片 URL。
- 拒绝 `data:`、`javascript:`、任意第三方图片主机和无效 BVID；不将页面消息直接转换为 fetch、下载或导航命令。
- 海报文件名经过字符白名单处理；canvas 文本换行和行数有上限，避免超长输入导致布局或内存异常。
- 原生 fallback 的临时解绑必须在 `finally` 等价路径恢复监听，避免一次 fallback 让后续原生分享永久失去增强控制。

## Testing Decisions

测试只验证外部行为和模块边界，不锁定易变的 Vue 内部 DOM 细节。测试优先放在最高稳定 seam：分享适配器的纯函数契约、海报纯函数/渲染输入输出和控制器的入口状态转换；真实页面只覆盖少量集成行为。

### 单元契约

在目标仓库现有测试组织允许的范围内，为分享适配器和海报逻辑增加最小可运行的纯函数检查，覆盖：

- 标准 BV 路由接受，直播、专栏、错误主机、错误协议和无效 BVID 拒绝。
- URL 始终使用规范 host、路径、尾斜线和 `share_source=copy_web`；时间参数严格向下取整且不接受负数。
- `MM:SS`/`HH:MM:SS` 边界格式。
- 标题、作者和封面 fallback；data URL、javascript URL、非 Bilibili 图片主机拒绝。
- 更新会话只改变时间相关派生字段，不改变 BVID 和身份元数据。
- 二维码输入来自最终 URL，矩阵为有界方阵；不引入网络请求。
- 海报 canvas 输出为 `1080 × 1080`，标题最多两行，封面圆角压暗，标签有界，二维码明显小于主体封面并与底部信息不重叠，文件名只含安全字符。
- canvas/ClipboardItem 不可用时返回可识别失败，下载路径仍可用。

### 控制器与组件行为

使用 fake DOM、fake video、fake clipboard 和最小事件对象验证：

- 首选入口、上下文入口、不可见入口、被遮挡入口和相似非视频入口的选择结果。
- 同一节点在多次 MutationObserver 通知和 history 事件后只绑定一次。
- 适配失败时原生 click 不被吞掉；适配成功时增强 Dialog 打开且原生处理不重复执行。
- 原生 fallback 临时解除监听、触发一次原生动作并恢复监听。
- BVID/路由变化关闭旧会话并清理定时器/监听。
- Escape、遮罩、关闭按钮、焦点回收、焦点循环和 loading 时关闭策略符合 `Dialog.vue` 的既有协议。
- 时间开关同步更新文字、链接、二维码和海报，不产生过期异步结果覆盖。
- Web Share、文本剪贴板、图片剪贴板、下载能力的成功、取消和失败反馈。

### 真实开发验证

按项目约束执行且只执行以下验证：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm dev`：在开发模式观察 Vite 内容脚本编译、Shadow DOM 样式加载、视频页 SPA 切换和原生分享入口重绘。

不执行任何 `build`、打包或发布命令作为本 spec 的验证步骤。浏览器手动验证应在开发模式下进行，至少覆盖普通 BV 视频、未登录/登录状态、播放中与未播放、分 P/合集切换、封面 CORS 失败、浅色/深色主题、窄屏、高 DPI 和入口重绘。

## Out of Scope

- 不实现代码、依赖变更、manifest 变更或后台消息；本文件只是实现 spec。
- 不处理番剧、课程、直播、专栏、动态、搜索结果、Bilibili 子站和跨域 iframe 的增强分享。
- 不在增强 Dialog 内独立复刻动态、微信、QQ、QQ 空间、微博、贴吧等平台的内部动作 URL；统一通过原生 fallback 保底。
- 不上传或云端同步封面、二维码、海报、分享记录或剪贴板内容。
- 不新增分享历史、收藏夹、模板编辑器、用户自定义海报尺寸、批量分享或后台队列。
- 不新增“启用增强分享”开关、时间偏好记忆或 active tab 持久化；这些属于未被源功能要求覆盖的产品决策。
- 不申请 `downloads`、`tabs`、`cookies`、`webRequest`、`<all_urls>` 或第三方图片/二维码服务权限。
- 不改变现有 `cleanBilibiliUrl`、`cleanBilibiliShareText`、`enableCleanShareLink` 的既有行为，不把增强弹窗作为原生 copy 事件的第二个拦截器。

## Further Notes

- 源扩展的 `bilibili-adapter.js`、`share-dialog.js`、`poster-generator.js`、`qr-code.js`、`entry.js` 和契约测试是行为参考，不直接复制 JavaScript 文件；目标实现必须改写为 Vue 3/TypeScript，并接入 BewlyCat 的现有组件和生命周期。
- 现有 `qrcode.vue` 已满足首版二维码需求；只有在它无法满足高分辨率 canvas 或海报嵌入契约时，才重新评估本地实现，且不预先增加依赖。
- `src/manifest.ts` 当前已经声明 `storage`、Bilibili 和图片 host 范围；实现阶段先用页面上下文完成剪贴板、Web Share、canvas 和下载，再根据实际失败证据评估权限，而不是按源扩展的占位 service worker 预先扩展能力。
- 若 Bilibili DOM 结构变化导致适配器失效，优先更新 selector/fallback 和适配器契约测试；不要把站点变化扩散为组件、存储或后台层的耦合。
- 完成实现后，交付说明应列出实际改动文件、`pnpm lint`、`pnpm typecheck` 和 `pnpm dev` 观察结果；任何未运行或失败的验证必须明确说明。
