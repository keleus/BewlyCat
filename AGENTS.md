# BewlyCat Agent 指南

基于 BewlyBewly 的 bilibili 浏览器扩展，使用 Vue 3、TypeScript、Vite、UnoCSS 和 `pnpm`。

## 按任务定位

- 页面注入：`src/contentScripts/index.ts`；后台消息与 API：`src/background/`；扩展配置：`src/manifest.ts`。
- UI：`src/components/`；状态与设置：`src/stores/`、`src/logic/storage.ts`；翻译：`src/_locales/`。
- 主 UI 位于 Shadow DOM 内。改样式时使用 `src/styles/variables.scss` 的 token，并查阅 [样式规范](docs/agent-style-guide.md) 的相关章节；共享控件、排版、尺寸、间距、圆角和浮层规范均保留在该文档中。
- 仅在搭建开发环境、加载真实扩展或打包交付时查阅 [贡献指南](docs/CONTRIBUTING-cmn_CN.md)。其构建说明用于开发者和发布流程，不要求 Agent 为日常验证打包。
- PR 拉取、审查、本地集成测试或合并使用 [PR 工作流](docs/agent-pr-review.md)。一般代码修改不加载该流程。
- i18n 修改保留现有键结构和注释，不使用会自动重排键或删除注释的翻译扩展。

## 问题判断与验证边界

- 优先通过实际代码、调用链、状态与数据流及运行上下文判断问题，无需额外说明代码依据；无法确定的部分如实说明。
- 不创建或使用临时 HTML、独立复刻页面、模拟页面等虚拟页面进行测试。
- 仅在用户主动要求时做页面调试、页面验证或调用 `chrome-devtools-mcp`。页面验证使用真实项目和实际运行环境；MCP 还须已安装且可调用。普通“修复”“审查”“测试”请求不自动授权页面操作。
- 此边界适用于所有浏览器工具和 Skills，包括 Browser QA Factory、内置 Browser 与可视化工具；不能通过换工具或生成 mockup 绕过。

## 本地检查

- 按改动选择静态检查：`pnpm exec eslint <相关文件>`、`pnpm lint`、`pnpm typecheck`。未新增或改变依赖、导出时通常无需 `pnpm knip`。
- 当前没有 `test` 脚本或已配置的单元测试套件；CI 中名为 Test 的 job 执行 lint、类型检查、Knip 和构建。不要假定存在隔离于真实账号的测试环境。
- 日常验证不运行生产构建或打包命令。仅需持续编译时使用 `pnpm dev` / `pnpm dev-firefox`；它们内部的开发模式 `build:*` 子命令属于该开发流程。无需为纯文档或静态检查启动 dev。
- dev 启动会清理对应 `extension*` 产物；优先复用已有开发进程，避免覆盖正在使用的构建。Chrome/Edge 产物为 `extension/`，Firefox 为 `extension-firefox/`。
- 已授权任务内的本地编辑、静态检查、修复本次改动造成的检查失败及针对性复验可自主完成，不逐步询问。检查通过后，只有新改动、失败或未解决风险才需要扩大或重复验证。

## Git 与提交

- `pre-commit` 自动运行 `pnpm lint-staged`，`pre-push` 自动运行 `pnpm lint && pnpm typecheck`。不要仅为提交或推送重复预跑同一检查；保留 hooks，除非用户明确要求跳过。
- 仅审查不改源码、不合并、不提交、不推送。提交、合并、推送须在用户明确授权的范围内执行，已有授权无需重复确认；不丢弃、覆盖或混入用户现有修改。
- 提交使用 Conventional Commits，冒号后用中文；支持 `feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert/merge`。有对应 issue 时附 `#<issue>`；合并格式为 `merge: 合并 PR #<number> <标题>`。
- PR 不提交 `AGENTS.md`、本地测试文件或测试产物；实际策略见 `.github/scripts/pr-policy-check.mjs`。本地维护 Agent 配置不代表允许通过 PR 提交这些文件。

## 完成条件

实现任务完成意味着请求范围内的改动已完成且适用检查通过；复杂任务还需覆盖相关调用方、状态/设置、i18n 和文档中实际受影响的部分。继续修复本次改动引入的问题，不停在第一版实现。若有无法解决的环境或外部阻断，明确标为未完成并说明剩余事项，不当作验证通过。收尾简述改动、验证结果及限制；页面验证与 Git 写入仍遵循上述授权边界。
