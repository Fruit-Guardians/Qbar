# QBar 架构

## 边界

- `entrypoints` 只启动对应扩展页面；`app/QBarApp.vue` 负责装配组件，不承担正文解析或网络执行。
- `use-panel-workspace` 协调请求生命周期与扩展消息；`use-panel-theme` 管理主题/偏好；`use-editor-tools` 管理编辑器选区和片段操作。
- `features/request/model` 中的纯函数准备请求、决定正文传输、解析 cURL；UI、导出和后台共用同一套规则。
- `features/workbench` 的纯模型处理网络日志、查询参数、无损 JSON 和差异；工具侧栏只协调内存状态及显式写回。JWT 的算法与解码模型独立于 UI。
- `features/history/model` 在后台单实例串行写本地历史。所有面板订阅同一修订快照；删除进行中的记录后，完成事件不会将其重新插入。
- `extension/background` 拥有执行器与临时 DNR 规则；`content-scripts` 仅承担必须在被检查标签页中完成的动作。
- `shared/lib` 按浏览器 API、时间、随机值、集合划分；后台不再通过混合工具模块导入与其无关的 UI/随机库代码。

## 请求路径

```text
编辑器 / cURL 导入 / 历史恢复
  → prepareExecutionRequest
  → 后台再次准备并验证
  → 普通 Basic GET/表单：NavigationRequestExecutor
  → Raw / JSON / 原始表单 / multipart：FetchRequestExecutor
  → finally 清理规则与监听器
  → 响应 + 历史完成状态
```

JSON 正文不会经 JSON.parse/JSON.stringify 往返；大整数、空白、数组和基础值保持原文。multipart 的 Basic 准备只规范边界与头部换行，保留每部分数据内的换行。Raw 编辑器只解析头部，正文按输入文本保留，不交给 HTTP 库重新生成。

cURL 使用仓库固定版本 curlconverter 的词法/参数解析器，而不是其有损 JSON 生成器。这个内部依赖接口隔离在 `curl-import.ts`，升级依赖时必须运行相关回归测试。浏览器测试使用实际 WASM 解析器；Node 测试只将解析器运行时替换为已安装的原生 tree-sitter，词法和参数代码保持一致。

## 验证

```sh
yarn test
yarn types:check
yarn lint
yarn build:chrome
yarn build:firefox
```

测试覆盖请求隔离、取消/超时、临时规则清理、历史并发/容量/恢复、正文和 cURL 往返、真实回环 HTTP，以及扩展入口/命名/目录约束。Node 的浏览器 API 测试使用模拟对象；回环 HTTP 测试不会被表述为 Chrome 网络栈验证。开发预览明确标识为模拟响应，不进入发布包。

## Load 与连接生命周期

- `extension/background/tab-request.ts` 通过 Tabs API 读取当前被检查标签页，区分实际采集请求和 URL-only GET 草稿。读取前后核对页面 URL；导航中不返回旧捕获记录。
- `session-store` 为正在采集的主文档记录 requestId 和 URL，请求头事件只更新匹配记录，避免两次导航的数据混合。
- `features/request/model/load-feedback.ts` 定义轻提示并保护 Load 关联 ID / 编辑快照，迟到结果不覆盖编辑、导入或恢复。
- 首次连接等待 `use-panel-theme` 恢复 Raw / Follow redirects 设置及编辑器挂载后启动，避免异步偏好恢复破坏 Load 快照；读设置失败使用默认值，卸载后不会延迟连接。
- `app/composables/panel-connection.ts` 管理 ready 握手、退避重连和监听器释放。它不缓存、不重放用户操作；连接中断的在途发包被标记为结果未知。
- `app/components/WorkspaceNotice.vue` 展示非阻塞提示、主动刷新与离线重试。首次打开只读取 URL，不自动刷新、不发包。

## 界面语言

`src/shared/i18n/locale.ts` 管理 `en` / `zh-CN`、浏览器语言回退、异步偏好恢复与串行写入；`index.ts` 提供 Vue `$t` 和设置页上下文，并同步 HTML `lang` 与组件库语言。翻译仅发生在 UI 展示处，发送模型与生成器不依赖 i18n。载入偏好期间的用户选择优先，保存失败保留当前语言并提示重试。

## 外观与响应显示偏好

`app/model/theme-preference.ts` 是独立的三态主题控制器，旧布尔配置只在读取时迁移；新写入仅包含 `uiThemeMode`。系统变化通过媒体查询事件更新外观，不写配置、不修改请求。`use-panel-theme` 负责 Vue 生命周期、存储同步和首次 Load 前的请求偏好恢复。

语言区分选择模式与实际语言，自动模式响应浏览器事件。主题和语言均按选择顺序写入，忽略迟到的初始化读，卸载后解除事件订阅。默认请求参数仍只影响明确设置的当前草稿或新面板，不从其他面板强制更新。

`use-response-rendering` 默认不渲染被检查页面，仅在用户明确启用且后续响应完成后执行；读取历史选择不主动渲染已有响应，读取失败保持关闭。自动渲染和重定向偏好分别保存，不夹带请求内容。

## P0 工作流状态

`repeater-tabs` 隔离面板内草稿 / 响应；`network-context` 共享一个面板级捕获订阅。`EvidenceStore` 由后台持有，串行处理 `evidence` 消息并广播 revision；`use-evidence` 关联操作回执，处理断线 / 超时。响应只在显式保存时进入证据存储，不改变请求历史记录策略。
