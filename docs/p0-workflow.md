# v0.2.0 P0 工作流

## 本轮交付

### 捕获与恢复

- 面板打开时先检查现有的页面捕获；没有完整记录时只生成 URL 草稿，不编造请求头或 POST 正文。
- 主文档捕获以请求 ID 关联正文和请求头；请求头未到齐、formData 仅可重建但非原始字节、文件 / 二进制正文不可恢复的记录标为不完整。
- 捕获元数据随会话记录保存，后台重启后仍能区分完整与不完整记录。
- DevTools 请求列表在面板存活期间持续监听，即使工具栏没有展开。关闭面板后释放监听器和未完成的 HAR 读取。
- 兼容 Chrome 回调式 HAR 与 Firefox Promise 式 HAR。读取超时、导航、重复刷新不会把旧快照写回新状态。
- 后台只返回 URL 草稿时，尝试从 DevTools 日志补齐同 URL 的最新 `document` 请求；最新记录不完整时不回退到旧 POST，XHR 同 URL 也不当成文档。
- 读取期间编辑、切换标签、导入、发送，都会使迟到的 Load 失效。断线只恢复连接，不重发请求。

### Repeater

- 最多 20 个临时标签，独立保留请求、编辑模式、响应、最近结果、耗时和来源。
- 新建、复制、键盘左右 / Home / End 切换；修改过的草稿显示圆点。
- 关闭有编辑或结果的标签需要确认；至少保留一个空标签。
- 标签只在本次面板中保留。关闭 DevTools 前应将重要结果保存为证据；本轮不自动将标签或响应写入磁盘。
- 一次发送一个请求，运行期间锁定切换、复制和关闭标签。仍可编辑当前草稿，但结果绑定实际发送快照，而非后来修改的内容。
- 支持取消，包括权限检查尚未完成的阶段。取消未获确认时最多等待 5 秒，显示结果未知并重连，不自动重试。
- 请求超时后再等最多 10 秒完成回执；超限显示结果未知，不把未知当作成功或已取消。
- HTTP 4xx/5xx 是可查看的 HTTP 响应，不当作网络异常。超时、取消、连接中断和传输错误保留不同结果。
- Basic 导航传输返回 HTTP 元数据，正文明确标为不可用；Raw / Fetch 保留可获取的响应正文。
- 切回旧标签不会触发“自动渲染到页面”。

### 证据

- 与请求历史分开：点击「证据 → 保存当前结果」才存完整请求、响应和备注；取消 / 超时等无响应结果也可保存。
- 使用实际发送快照，与当前草稿后续编辑隔离。
- 本机存储上限 50 条、总计 4 MiB、单条 512 KiB。超限明确拒绝，不静默截断或淘汰证据。
- 搜索、修改标题 / 备注、确认移除、查看请求 / 响应快照、在新标签恢复请求；恢复不发送。
- 默认脱敏 JSON 导出：省略标题、备注、正文、URL 用户名 / 密码 / fragment、全部请求头和查询参数值；URL 路径及字段名仍可见，分享前检查预览。
- 可主动取消脱敏以导出完整证据。完整本地记录和完整导出可能包含凭据。
- 后台统一串行写入、多面板广播版本；备注编辑和移除携带已选版本，冲突时保留编辑内容并提示重选，保存失败或回执超时不会自动重试。刷新列表后再决定是否重试，避免重复保存。

## 内部消息契约

新增 `evidence` 消息；不新增权限、不改变 HTTP 发送格式。

```ts
// panel -> background
{ type: 'evidence', tabId, actionId, data:
  | { action: 'list' }
  | { action: 'save', exchange, title, notes }
  | { action: 'update', id, title, notes }
  | { action: 'remove', id }
}
// background -> requesting panel; actionId correlates a completion/error
{ type: 'evidence', actionId, data?: { version: 1, revision, entries }, error?: string }
// Other panels receive snapshots without the requester's actionId.
```

`exchange` 包含请求、可选响应、结果、错误、时间及传输模式。只记录本机交互，不发送到外部服务。`qbarEvidenceV1` 独立于 `requestHistoryV1` 和 UI 偏好。读取失败保留原值；超限、校验或写入失败不会更新已保存版本。

## 验收

- 模型：精确正文与大整数、深拷贝、串行存储、写入失败、容量上限、缺失正文和脱敏。
- 工作台：标签隔离、取消、过期消息、后台断线、编辑保护、HAR 回调 / Promise 兼容及监听清理。
- 真实 localhost HTTP：生产 Fetch executor 发送 Unicode 和大整数正文；201、403、断连、超时、取消，无自动重试。
- 浏览器预览用于界面和交互验证；预览发包是 fixture，不代表真实扩展发包。

参考：[Chrome devtools.network](https://developer.chrome.com/docs/extensions/reference/api/devtools/network)、[Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)。

## Cookie 现状

本轮没有独立 Cookie 管理器或身份档案。捕获到的 `Cookie` 可在请求头内查看、编辑、禁用、复制 cURL 及随证据保存；脱敏导出会清除 Cookie / Set-Cookie 等所有头值。Raw 使用 `credentials: omit`，不自动从浏览器 Cookie jar 取当前登录态，发送用户明确提供的 Cookie 由临时请求头规则处理。Basic 导航仍遵循浏览器正常会话语义；需要隔离身份时使用 Raw 并显式提供 Cookie。
