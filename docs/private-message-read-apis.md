# 私信已读接口维护备忘

本文记录 BewlyCat 为 [#572](https://github.com/keleus/BewlyCat/issues/572) 实现“全部已读”时确认的网页接口、手机 App RPC、鉴权差异、风控表现和后续切换方案。

记录时间：2026-07-28。B 站接口均为未公开内部接口，字段、鉴权和风控策略可能随时变化，维护时应以当时的网页 bundle 和官方 App 为准。

## 当前实现概览

当前实现使用网页接口：

1. 在 `message.bilibili.com` 的 MAIN world 中分页调用 `get_sessions`。
2. 筛出 `unread_count > 0` 的私信会话。
3. 使用每个会话的 `max_seqno` 调用 `update_ack`。
4. 成功后失效 BewlyCat 顶栏未读缓存，并触发 B 站消息中心刷新会话列表。

相关代码：

- `src/contentScripts/features/notificationMarkAllRead.ts`
- `src/utils/pagePrivateMessage.ts`
- `src/inject/privateMessageBridge.ts`
- `src/contentScripts/features/notificationStateInvalidation.ts`

请求特意放在页面 MAIN world，而不是扩展 background service worker 中。测试中，background 请求 `get_sessions` 曾收到 HTML 风控页面；改为页面请求上下文后连续两次完整操作均正常。

这不代表网页方案不会再触发风控。它仍然需要分页读取会话并逐项提交已读状态，只是能够自然继承消息页的 Cookie、Origin、Referer 和浏览器请求上下文。

当前降低风险的参数：

- 会话分页大小：`20`，与当前网页 bundle 一致。
- 分页间隔：`80 ms`。
- `update_ack` 并发数：`5`。
- 最多读取 `100` 页，避免异常响应造成无限分页。

如果后续再次出现 HTML 风控页，可依次尝试：

1. 降低 `update_ack` 并发数。
2. 增加分页和提交间隔。
3. 只处理页面已加载的会话。
4. 改用本文后半部分记录的 App `ClearUnread` RPC。

## 网页接口

### 获取会话列表

```http
GET https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions
```

当前使用参数：

| 参数 | 值 | 说明 |
| --- | --- | --- |
| `session_type` | `1` | 私信会话列表 |
| `group_fold` | `0` | 展开群组会话 |
| `unfollow_fold` | `0` | 展开未关注用户会话 |
| `sort_rule` | `2` | 按会话时间读取 |
| `size` | `20` | 与当前网页原生分页一致 |
| `end_ts` | 首次为空 | 下一页使用上一页最后一项的 `session_ts` |
| `build` | `0` | 网页固定参数 |
| `mobi_app` | `web` | 网页固定参数 |
| `wts` | 当前 Unix 秒 | WBI 签名时间 |
| `w_rid` | WBI 签名 | 见下文 |

返回结构中当前功能使用：

```ts
interface PrivateMessageSessionData {
  session_list?: PrivateMessageSession[]
  has_more?: number
}

interface PrivateMessageSession {
  talker_id?: number | string
  session_type?: number | string
  unread_count?: number | string
  max_seqno?: number | string
  session_ts?: number | string
  last_msg?: {
    msg_seqno?: number | string
  }
}
```

分页规则：

1. 处理 `data.session_list`。
2. `data.has_more !== 1` 时结束。
3. 下一页 `end_ts` 使用当前页最后一项的 `session_ts`。
4. 如果 `end_ts` 为空或没有变化，应立即停止，防止循环。

### WBI 签名

`get_sessions` 在当前网页 bundle 中通过 `UNIOS_WBI_ENCODE` 调用。当前实现使用标准 WBI 流程：

1. 请求 `https://api.bilibili.com/x/web-interface/nav`。
2. 从 `data.wbi_img.img_url` 和 `sub_url` 提取文件名。
3. 使用标准 mixin 映射生成 32 字符 mixin key。
4. 添加 `wts`。
5. 参数按键名排序，并从值中过滤 `!'()*`。
6. 计算 `md5(query + mixinKey)` 得到 `w_rid`。
7. 收到 `code = -403` 时强制刷新一次 WBI key 后重试。

实现位于 `src/inject/privateMessageBridge.ts`。

### 标记单个会话已读

```http
POST https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack
Content-Type: application/x-www-form-urlencoded
```

请求体：

| 参数 | 来源 |
| --- | --- |
| `talker_id` | 会话的 `talker_id` |
| `session_type` | 会话的 `session_type`，当前只处理 `1` 和 `2` |
| `ack_seqno` | 优先使用 `max_seqno`，降级使用 `last_msg.msg_seqno` |
| `csrf` | 网页 Cookie 中的 `bili_jct` |
| `csrf_token` | 同 `csrf` |
| `build` | `0` |
| `mobi_app` | `web` |

示例：

```ts
await fetch(
  'https://api.vc.bilibili.com/session_svr/v1/session_svr/update_ack',
  {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      talker_id: String(session.talker_id),
      session_type: String(session.session_type),
      ack_seqno: String(session.max_seqno),
      csrf: biliJct,
      csrf_token: biliJct,
      build: '0',
      mobi_app: 'web',
    }),
  },
)
```

建议继续从 `message.bilibili.com` 的 MAIN world 发出请求。不要手工读取或转发 `SESSDATA`。

### 相关但不能实现普通私信全部已读的接口

```http
GET https://api.vc.bilibili.com/session_svr/v1/session_svr/ack_sessions
```

参数包含 `begin_ts`、`build=0` 和 `mobi_app=web`。它用于同步其他端已产生的 ack 状态，不会主动把全部会话设为已读。

```http
POST https://api.vc.bilibili.com/session_svr/v1/session_svr/batch_update_dustbin_ack
```

它只批量处理垃圾箱/智能拦截会话，不能用于普通私信列表。

截至记录时间，网页 bundle 中没有发现通用的 `batch_update_ack`、`clear_unread` 或等价 REST 接口。

## 手机 App 一键已读 RPC

以下信息来自对 B 站官方 Android APK 的静态分析。App 确实使用单次 RPC 完成当前会话页的一键已读。

### 服务定义

```text
Host: grpc.biliapi.net
Protocol: HTTP/2 gRPC
Path: /bilibili.app.im.v1.im/ClearUnread
Package: bilibili.app.im.v1
Service: im
Method: ClearUnread
```

还原出的最小 proto：

```proto
syntax = "proto3";

package bilibili.app.im.v1;

service im {
  rpc ClearUnread(ClearUnreadReq) returns (ClearUnreadReply);
}

message ClearUnreadReq {
  SessionPageType page_type = 1;
  SessionId session_id = 2;
}

message ClearUnreadReply {
}

enum SessionPageType {
  SESSION_PAGE_TYPE_UNKNOWN = 0;
  SESSION_PAGE_TYPE_HOME = 1;
  SESSION_PAGE_TYPE_UNFOLLOWED = 2;
  SESSION_PAGE_TYPE_STRANGER = 3;
  SESSION_PAGE_TYPE_DUSTBIN = 4;
  SESSION_PAGE_TYPE_GROUP = 5;
  SESSION_PAGE_TYPE_HUA_HUO = 6;
  SESSION_PAGE_TYPE_AI = 7;
  SESSION_PAGE_TYPE_CUSTOMER = 8;
}
```

`SessionId` 是可选的多类型会话 ID。App 还原出的类型包含 private、group、fold、assistant、AI、customer 和 system 等。整页一键已读不传 `session_id`，所以实现备用方案时无需先完整还原这个 oneof。

私信首页使用：

```text
page_type = SESSION_PAGE_TYPE_HOME = 1
session_id = omitted
```

对应 protobuf payload：

```text
08 01
```

对应未压缩 unary gRPC 数据帧：

```text
00 00 00 00 02 08 01
│  │           └─ protobuf: field 1, enum value 1
│  └─ payload length: 2
└─ compression flag: 0
```

### 鉴权与 metadata

APK 中明确生成：

```http
authorization: identify_v1 <APP_ACCESS_KEY>
x-bili-mid: <MID>
x-bili-metadata-bin: <protobuf binary metadata>
```

`x-bili-metadata-bin` 至少包含：

- App access key
- `mobi_app`
- App 版本号
- buvid
- 设备和网络相关信息

App 网络层还定义了 `x-bili-device-bin`、`x-bili-network-bin`、`x-bili-locale-bin` 等 metadata。是否全部为 `ClearUnread` 的硬性要求尚未用真实 App token 验证。

无鉴权最小请求的实测响应：

```text
HTTP 200
bili-status-code: -101
grpc-status: 2
grpc-message: -101
details: 账号未登录
```

这说明 RPC 路径和 framing 正确，同时也确认它不会自动识别网页登录 Cookie。网页 `SESSDATA` 不能代替 App access key。

### grpcurl 调用形态

保存上面的 proto 后，可以按以下形式调用：

```bash
grpcurl \
  -proto im.proto \
  -H "authorization: identify_v1 ${ACCESS_KEY}" \
  -H "x-bili-mid: ${MID}" \
  -d '{"pageType":"SESSION_PAGE_TYPE_HOME"}' \
  grpc.biliapi.net:443 \
  bilibili.app.im.v1.im/ClearUnread
```

此命令只展示 RPC 形态。服务端可能还要求有效的 `x-bili-metadata-bin`，不能假设只有 `authorization` 和 `x-bili-mid` 就足够。

### 原始 HTTP/2 调用形态

如果不引入完整 gRPC 客户端，Node.js 可以直接发送 unary frame：

```js
import { Buffer } from 'node:buffer'
import http2 from 'node:http2'

const client = http2.connect('https://grpc.biliapi.net')
const request = client.request({
  ':method': 'POST',
  ':path': '/bilibili.app.im.v1.im/ClearUnread',
  'content-type': 'application/grpc',
  'te': 'trailers',
  'authorization': `identify_v1 ${accessKey}`,
  'x-bili-mid': String(mid),
})

request.on('response', headers => console.log(headers))
request.on('trailers', trailers => console.log(trailers))
request.end(Buffer.from([0, 0, 0, 0, 2, 0x08, 0x01]))
```

成功时应检查 `grpc-status = 0`；B 站业务错误还可能通过 `bili-status-code`、`grpc-message` 和 `grpc-status-details-bin` 返回。

## BewlyCat 中接入 App RPC 的备用路线

项目已经有主页 App 推荐模式所需的 access key 授权流程，不需要重新设计登录：

- `src/utils/authProvider.ts`
  - `getTVLoginQRCode()`
  - `pollTVLoginQRCode()`
  - `saveAppAuthTokens()`
  - `refreshAppAccessToken()`
  - `hasValidAppAuthTokens()`
- `src/logic/storage.ts`
  - `appAuthTokens.accessToken`
  - `appAuthTokens.refreshToken`
  - `appAuthTokens.mid`
- `src/components/Settings/PluginComponentsAndPages/Home/Home.vue`
  - App 推荐模式的 TV 二维码授权入口

如果网页方案未来不再可靠，建议：

1. 仅在用户已经授权 App 推荐模式、且 `hasValidAppAuthTokens()` 为真时显示或启用 App RPC 方案。
2. access token 过期时先调用 `refreshAppAccessToken()`。
3. 从 `appAuthTokens` 读取 `accessToken` 和 `mid`，不得写入日志、Toast 或 PR 调试信息。
4. 为 `grpc.biliapi.net` 增加最小 host permission。
5. 在 background 中发送 `ClearUnread`，避免把 access token 暴露给网页 MAIN world。
6. 首先尝试 `authorization`、`x-bili-mid` 和最小 metadata；如果服务端拒绝，再继续还原 `x-bili-metadata-bin` 的完整 proto。
7. 成功后复用当前的未读状态失效和原生会话列表刷新逻辑。
8. RPC 返回 `-101` 时只尝试一次 token 刷新，避免无限重试。

不建议自动把所有用户切换到 App RPC：

- 只有网页登录态的用户未必授权过 App access key。
- gRPC metadata 与 App 版本可能变化。
- 新增 `biliapi.net` 权限和 App token 使用需要更明确的隐私说明。
- 当前网页方案已经过两次完整实测，无异常时应继续保持较小的权限和凭据范围。

## 后续排查清单

网页方案异常时记录：

- 是 `get_sessions` 还是 `update_ack` 失败。
- HTTP 状态、`content-type` 和 B 站 JSON `code`，不要记录 Cookie。
- 是否返回 HTML 风控页。
- 失败发生在第几页、成功/失败会话数量。
- 当前分页间隔和提交并发数。

App RPC 异常时记录：

- `grpc-status`
- `grpc-message`
- `bili-status-code`
- 是否在刷新 access token 后仍失败
- 是否要求新增或更新 binary metadata

任何日志都不得包含 access token、refresh token、Cookie、二维码 auth code 或完整 binary metadata。
