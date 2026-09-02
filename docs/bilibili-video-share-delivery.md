# Bilibili 视频分享交付说明

## 已完成验证

- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- 仓库外临时 Node 契约检查：11/11 通过，覆盖 BVID 路由、完整标题保留、标题内含 URL 时的目标链接选择、匹配 BVID 的页面状态、SPA 过渡期 DOM/state 标识与分 P `cid` 校验、无 BVID 的旧页面初始状态隔离、规范 URL、时间格式、封面地址白名单、会话更新和基础海报输出。按仓库 PR 文件策略，临时检查文件未放入仓库。
- `git diff --check`：通过。
- `pnpm dev`：开发服务器运行在 `http://localhost:3303/`；`options/index.html`、`popup/index.html` 和 `@vite/client` 可正常响应。
- fresh extension session：标准 BV 视频页能够加载 BewlyCat Shadow DOM 分享 Dialog；已观察到标题、封面/占位、二维码、快速分享和海报视图。
- 交互路径：时间开关会更新最终链接和显示时间；海报画布输出为 `1080 × 1080`；英文/数字词组（包括 `DJI Power`）不会被标题换行拆开；Enter 可触发当前复制按钮；tab 方向键可切换海报视图；Escape、关闭按钮和焦点回收路径已检查；320px 下两个 tab 等宽可达且 `scrollWidth === clientWidth`，tab/panel 的 `id`、`aria-controls` 和 `aria-labelledby` 关系已检查。

## 尚未完成或受限

- 尚未在所有登录状态、分 P/合集切换、操作栏重绘、剪贴板拒绝、Web Share 失败、封面 CORS 失败和高 DPI 组合下完成完整手动矩阵；SPA 换页期间现在会等待当前 state/DOM/播放器信号一致后再绑定增强入口。
- `pnpm start:chromium` 的仓库配置 runner 仍可能受到 `chromium-web-ext-profile` 被已有 Chromium 会话占用的影响，曾出现 `Extensions.loadUnpacked` 的 CDP 连接中断；这属于本机浏览器 profile 状态，不能作为 runner 通过证据。
- 本次实现未执行任何 `build`、打包或发布命令。

## 变更范围

- 新增 Bilibili 视频分享适配器、生命周期控制器、分享 Dialog 和海报渲染工具。
- 接入四种现有 locale、全局分享事件和 Shadow DOM App 生命周期。
- 增加 Dialog 的关闭按钮无障碍名称、面板引用和关闭前通知能力。
- 为 Chromium 开发 runner 增加缺失 profile 的自动创建参数。
- 新增分享功能规格与海报视觉设计记录。
