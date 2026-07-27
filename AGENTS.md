# AGENTS.md

BewlyCat：基于 BewlyBewly 的 bilibili 浏览器扩展（Vue 3 + TS + Vite + UnoCSS，包管理用 `pnpm`）。

## 命令

- `pnpm lint` / `pnpm lint:fix`
- `pnpm typecheck`
- 构建产物：Chrome/Edge → `extension/`，Firefox → `extension-firefox/`

仅当本次任务实际执行 `git commit` 时，提交前必须通过：

```sh
pnpm lint
pnpm typecheck
```

未执行 `git commit` 时，不要求运行上述检查。

## 结构（速查）

- `src/background/`：后台、消息与 API
- `src/contentScripts/`：页面注入主逻辑（入口 `index.ts`）
- `src/components/`：TopBar / Dock / VideoCard / Settings 等
- `src/stores/`、`src/logic/storage.ts`：状态与设置
- `src/manifest.ts`：manifest
- `src/_locales/`：i18n
- 主 UI 跑在 Shadow DOM 内，注意样式隔离

## 工具约束

- **Chrome DevTools MCP**：仅在用户**主动要求排查/调试页面**时使用；非必要不要用。仅当本机已安装且可调用 chrome-devtools-mcp 时参考相关能力；未安装/未开启则整节忽略。

## 提交规范

- Conventional Commits：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`
- 冒号后说明用中文，准确概括改动
- 有对应 [issue](https://github.com/keleus/BewlyCat/issues) 时在 commit 后附 `#{issue}`
- PR 不要提交 tests 文件和 `AGENTS.md`
