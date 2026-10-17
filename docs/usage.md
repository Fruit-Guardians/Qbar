# 安装与使用

[← 项目首页](../README.md)

## 下载安装包

打开 [Releases](https://github.com/Fruit-Guardians/Qbar/releases/latest)，下载 `QBar-chrome.zip` 或 `QBar-firefox.zip` 并解压。不需要安装 Node.js 或 Yarn；不要下载 GitHub 自动生成的 Source code 压缩包代替扩展包。

### Chrome

1. 把解压后的文件夹放在固定位置，确认里面有 `manifest.json`。
2. 打开 `chrome://extensions`，开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择该文件夹。
4. 打开网页的 DevTools，选择 **QBar**。安装前已打开的 DevTools 需重新打开。

Chrome 会直接使用这个文件夹，安装后请保留它。

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击**临时载入附加组件**，选择解压目录里的 `manifest.json`。
3. 打开网页的 DevTools，选择 **QBar**。

Release 中的 Firefox 包未签名，使用临时加载方式；浏览器重启后需要重新加载。

### 校验安装包

同时下载 Release 的 `SHA256SUMS.txt`，和两个 ZIP 放在同一目录，在 macOS 或 Linux 执行：

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Windows PowerShell 可执行 `Get-FileHash .\QBar-chrome.zip -Algorithm SHA256`，与校验文件中的对应摘要比较。

## 从源码构建

先按[开发环境](development.md#环境准备)安装依赖，再执行：

```sh
yarn build:chrome
yarn build:firefox
```

### 加载 Chrome 构建

1. 打开 `chrome://extensions`，开启**开发者模式**。
2. 点击**加载已解压的扩展程序**，选择 `dist/chrome`。
3. 打开目标网页的 DevTools，在标签栏或 `»` 菜单选择 **QBar**。

### 加载 Firefox 构建

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 点击**临时载入附加组件**，选择 `dist/firefox/manifest.json`。
3. 打开目标网页的 DevTools，选择 **QBar**。

临时加载的附加组件会在 Firefox 重启后移除。安装扩展后，需要重新打开已经打开的 DevTools。

### 本地压缩包

```sh
yarn dist:chrome
yarn dist:firefox
```

输出为项目根目录的 `QBar-chrome.zip` / `QBar-firefox.zip`。Chrome 手动安装时先解压，再加载扩展目录。打包脚本不依赖系统 `zip` 命令。

## 一次请求

1. 点击 **Load** 读取当前标签页请求，或通过其菜单导入 cURL。
2. 在 **Basic** 模式编辑 URL、Headers 与 Body，或在 **Raw** 模式直接编辑报文。
3. 检查重定向与超时设置，点击 **Send**。
4. 查看状态码、耗时、响应大小及响应正文；进行中的请求可以取消。
5. 需要在终端复现时，点击 **Copy cURL**。

普通 Basic GET / 表单使用页面导航；Raw、JSON、原始表单与 multipart 使用 Fetch。页面导航可能改变被检查页面。

## 请求历史

打开 **History** 可以按 URL、方法或状态筛选记录，恢复到编辑器、复制 cURL 或删除记录。**恢复不会自动发送请求。**

- 历史保存在浏览器本地，最多 100 条，总容量上限为 2 MB。
- 记录包含请求头与正文，不保存响应正文。Cookie、Authorization 或正文中的凭据也可能随请求保存。
- 可以关闭记录；关闭记录不会自动删除已有历史。
- 清空所有记录需要确认。

## 主题与辅助工具

面板首次使用时参考系统明暗偏好；通过主题按钮手动切换后会保存选择。工具栏提供编码、哈希、常用测试片段及自定义片段管理。

## 传输与导入说明

QBar 使用浏览器网络栈，而不是命令行 cURL：

- 协议协商和部分请求头由浏览器控制，编辑器里的 `HTTP/1.1` 不是强制协议配置。
- Raw 请求不自动携带目标站点 Cookie；需要时在请求头中明确填写。
- cURL 导入只解析命令文本，不执行 shell 命令。重复表单键、JSON 原文、Content-Type 参数、Cookie、Basic Authorization、超时及重定向设置有对应处理。
- `-F` / `--form-string` 的文字字段可生成 multipart；读取本地文件的参数需提供实际正文，文件路径不会被当作文件内容。
- 代理、证书、跨域重定向等选项与命令行环境存在差异；导入确认区域会展示支持情况及差异。

## 更新扩展

下载新版本，解压并用新文件替换原扩展目录里的内容，然后在扩展管理页重新加载，并重新打开 DevTools。源码用户重新构建后也需要重新加载。开发网页预览不等于已安装的扩展；预览使用模拟适配器，不发送真实网络请求。

## 首次打开与 Load 提示

v0.1.1 起，面板首次打开会尝试读取当前页 URL，生成 **URL-only GET draft**。这只是新建的 GET 草稿，不是实际捕获的请求，因此没有页面原请求的请求头与正文，也不会自动发送。

- **Captured page request**：Load 读到了当前页面的真实主文档请求。
- **URL-only GET draft**：尚无匹配的采集记录。可以直接编辑草稿，或点击 **Reload page & Load** 主动刷新被检查页面，再读取请求。刷新可能丢失网页未保存的数据。
- **Site access is missing**：点击 **Open permissions** 授予站点访问权限后重试。
- **Page is navigating**：页面跳转中，待加载完成再点 Load。
- **非 HTTP/HTTPS 页面**：浏览器内部页等不提供正常网页请求记录，打开普通网页后重试。

Load 过程中继续修改、导入 cURL 或恢复历史时，旧 Load 结果不会覆盖编辑器。它只读取当前被检查标签页的主文档请求，不是 Network 面板中任意 XHR 的选择器。

## 后台连接与错误反馈

后台断线会显示重连状态，发送按钮在握手成功前暂停使用。重连采用有上限的退避间隔，不会自动重发请求或重新执行测试；编辑内容保留。

如果断线发生在发送过程中，请求可能已经到达服务器。先核实服务器状态，再决定是否手动重发，尤其是写入类请求。多次重连失败时可点击 **Reconnect**；扩展更新后如仍断线，请重新打开 DevTools。

失败、超时或连接中断时，状态栏提供 **Copy diagnostics**。摘要只包含版本、连接状态、失败类别、编辑模式与超时配置，不包含 URL、请求头、正文或原始服务端错误文本。

## JWT 检查工具

工具栏的 **Tools → JWT** 打开面板内的检查侧栏，不遮挡请求编辑区。可以粘贴完整 Token 或 `Bearer …`，也可以主动点击 **Read Authorization** 读取当前请求里启用的 Bearer 请求头；打开面板不会自动读取。

- 展示 Header / Payload JSON，以及 `exp`、`nbf`、`iat` 对应的 UTC 时间与当前状态。解码不代表签名通过；JSON 数字展示遵循 JavaScript 精度，复制或写入请求的 Token 原文不变。
- 手动选择预期算法：HS256 使用 UTF-8 密钥原文，RS256 / ES256 使用 SPKI PEM 公钥。点击 **Verify signature** 校验；不会读取 Token 中的远程密钥地址。其他算法与 JWE 暂只显示相应提示，不执行校验或解密。
- **Signature valid** 仅代表当前提供密钥下签名匹配，不代表 issuer、audience、时效等业务校验通过。Token、密钥或算法变化会清除之前的校验结果。
- **Use as Bearer header** 替换当前请求的 Authorization 请求头，但不发送请求。点击 **Send** 后才发包；发送中的请求不会被此工具修改。请求历史仍沿用已有的请求头记录规则。
- 密钥只保存在面板内存，离开 JWT 页签或关闭工具侧栏就清空。工具本身不联网、不保存 Token 或密钥；**Copy token** 由用户主动写入系统剪贴板。

工具栏 **Utilities（⋮）** 包含 Encoding、Hashing、Payloads 和 Custom。SQLi、XSS、LFI、SSRF、SSTI、Shell 和 Test 统一放进 **Utilities → Payloads** 子菜单，原有条目与自定义 Payload 数据保留。

实现参考：[JWT 格式与时间字段（RFC 7519）](https://www.rfc-editor.org/rfc/rfc7519)、[算法校验原则（RFC 8725）](https://www.rfc-editor.org/rfc/rfc8725)。

## 面板内工具侧栏

点击 **Tools**，在 Requests、Params、JSON、Compare、JWT 页签之间切换。侧栏与历史互斥；窗口宽度不超过 1024px 时工具区移到编辑器下方。不会新开网页或弹窗。

### 页面请求选择器

**Requests** 从当前标签页的 DevTools 网络日志读取最近请求，并接收新完成的请求。按 URL 或方法筛选后点击 **Load request** 只会载入 Raw 编辑器；确认内容后点击 Send 才重发。

日志仅在当前侧栏打开期间留在内存，最多 200 条 / 4 MiB，单条最多 512 KiB，不持久保存响应正文。关闭侧栏会停止监听，页面导航会清空清单。**Refresh log** 重读日志；**Clear list** 只清工具中的清单，不删除 Chrome Network 日志。DevTools 打开前的请求可能缺失，需手动刷新页面重新采集。

缺少完整请求正文、文件上传数据或只给出表单参数而没有正文原文时，会提示并禁止直接载入，避免把残缺内容当成原请求发送。可改用 Copy as cURL 导入并核对正文。浏览器托管的协议、Cookie 和受限请求头仍受已有传输规则影响。

### 查询参数

**Params** 逐行编辑 URL 查询参数，支持同名多值、启停与删除，并与 Basic / Raw URL 同步。未修改项保持原始编码、顺序、裸 flag 与空值；修改的名称/值使用百分号编码，URL 片段不变。禁用项留在当前参数编辑器中，外部修改 URL 时重新解析清单；禁用状态不写入请求历史。非法百分号编码先在 URL 中修正。

### JSON

**JSON** 可读取请求正文、当前响应正文，或使用 Scratch。提供 Validate、Format、Minify，以及可折叠的树和字段路径/值复制。格式化保留数字字面值、重复键与数组顺序，不把大整数转成 JavaScript Number。校验错误标明行列与偏移。

只有来源为 Request body，且方法允许正文、没有在发送、请求仍与读取时一致，才能点击 **Use in body** 写回；格式化本身不修改请求，也不自动发送。复制字段值采用 JSON 字面值形式（字符串含引号）。重复对象键会保留，但相同键的路径不唯一。工具限制 1 MiB、64 层与 10,000 节点；树单层先显示 200 项，复制值仍包含全部子项。

### 请求与响应对比

**Compare** 可选择 Current draft request 或 Last completed exchange，点击 **Pin baseline** 固定基线。继续修改并发送后，可查看请求行、请求头、请求正文、响应状态、响应头、响应正文的逐行增删与耗时。重复头和顺序不被折叠。

Last completed exchange 使用真正发送时的请求快照，而不是当前草稿。超时或失败不会替换上次完成记录；Basic 导航没有返回响应正文时显示 No response captured，不伪造响应。固定基线只留在内存，最多 2 MiB；每项差异最多处理单侧 256 KiB、展示 2,000 行，大变更采用分块增删并标注截断。Clear baseline 或关闭 DevTools 后释放基线。

请求采集参考：[Chrome DevTools Network API](https://developer.chrome.com/docs/extensions/reference/api/devtools/network)。

载入网络请求后修改正文时，Send 和 Copy cURL 会忽略原始 `Content-Length`、`Transfer-Encoding`、`Trailer`，由浏览器/客户端按实际正文重新生成消息边界，避免旧长度截断正文。编辑器仍可显示捕获值，比较中的已完成请求快照使用发送前清理后的请求。

## Request 语法高亮

Raw 模式的 Request 编辑区现在区分 HTTP 方法、路径、请求头与 JSON 属性、字符串、数字和布尔值。支持 `application/json`、`+json`，以及以对象或数组起始的 JSON 正文；未完成的输入仍可继续编辑，普通正文按纯文本显示。

颜色仅用于显示，不解析重写正文，不影响发包内容。文本输入仍由原生 textarea 承担，支持原有选区、剪贴板、撤销与片段工具；显示层跟随横纵滚动和尺寸变化。输入法组合期间显示原生文字，结束后恢复高亮；系统强制配色时使用系统文字颜色。超过 256 KiB UTF-8 或 10,000 行时显示纯文本并提示，避免大正文的高亮开销。

## Response 结构化视图

Raw 模式的响应区直接提供 **Pretty / Tree / Raw**，不必先打开 Tools：

- **Pretty**：有效 JSON 默认格式化，保留数字字面值、重复键和数组顺序，不修改捕获的响应；HTTP 状态行和响应头仍可见。
- **Tree**：折叠对象与数组，逐字段复制路径或 JSON 值；根节点默认展开，单层先显示 200 个成员，复制值仍包含完整子项。
- **Raw**：查看捕获的状态、响应头和未格式化的响应正文。这里不是底层网络字节流导出，浏览器协议/正文解码仍遵循既有规则。
- **Copy body**：无论当前视图如何，复制原始响应正文，不带状态行和响应头；Pretty / Raw 仍保留搜索、选择和渲染工具。

非 JSON、空正文或不可用正文使用 Raw。无效 JSON、超过 1 MiB、64 层或 10,000 节点时提示并保留原文，不强行转换。HTML 等内容在查看器中按文本展示，只有主动 Render 才进入已有渲染流程。

## 设置与 About

- **主题**：跟随系统 / 浅色 / 深色。新用户默认跟随系统，并在系统明暗切换时即时更新；旧版本明确选过的明暗主题保持原样，可手动改回跟随系统。工具栏主题菜单和设置页共用偏好；保存失败时保留当前显示并提示重试。
- **响应渲染**：新用户默认只在 QBar 内查看响应。「自动渲染到页面」会在后续响应完成时替换被检查页面内容；可通过响应工具栏手动渲染。旧版本已保存的渲染选择保留。

工具栏右侧齿轮打开面板内 **Settings**，不新开窗口；**Back to request** 或 Esc 返回。打开设置会收起 Tools / History 并隐藏无关的请求工具栏，但不会卸载请求编辑区。

- **语言**：Settings → General → Language（设置 → 常规 → 语言）可选跟随浏览器语言、简体中文或 English，即时生效并保存在本机。首次使用跟随浏览器语言，未支持的语言使用 English。自动模式会响应浏览器语言变化；主题和语言会同步至其他已打开面板，不覆盖它们的请求草稿。语言切换不会重建编辑器、发送请求或翻译 URL、请求头、正文、响应原文、cURL、JWT、JSON 键值和自定义载荷；浏览器返回的原始诊断信息保留原文。
- **General**：主题、Basic / Raw 模式、默认超时、Follow redirects 和历史记录开关。主题与模式沿用现有偏好；超时设置同时用于当前草稿和新面板。导入/历史恢复仍保留该请求自己的超时；状态栏的单次超时选择不改全局默认值。
- 发送中暂停请求默认项的修改；历史开关与已有本地历史共用同一状态，关闭不会删除已有数据，Manage history 进入已有历史管理界面。
- **About**：项目用途、当前构建版本、主要功能与本地数据说明，并提供仓库、使用文档、反馈及 Credits & notices 链接。链接在主动点击后打开外部网站。
- 重定向/默认超时保存失败时会提示仅应用于当前面板，设置操作不会发送请求。

## Repeater 与证据

请求编辑器顶部可新建或复制标签，最多 20 个。标签临时保留，发送时锁定切换；修改后的草稿与实际发送结果独立。

点击「证据」手动保存当前结果、标题及备注。支持搜索、快照查看、新标签恢复及 JSON 导出；默认脱敏，分享前检查导出预览。详见 [P0 工作流](p0-workflow.md)。

## 请求认证、Cookie 与比较报告

- Basic 模式的 **Auth** 页签、Raw 模式的 **认证与 Cookie** 折叠区都只作用于当前请求。填写后点击应用，再手动发送；切换请求标签会清空未应用的认证输入。
- Bearer / Basic / 自定义头会替换同名认证头；移除 Authorization 会删除该头。Basic 用户名不支持冒号。
- Cookie「原传输行为」保留现有请求头和浏览器发送路径；「不发送」会在发送前再次删除 Cookie；「仅显式头」只使用填写的 Cookie。后两项通过独立 Fetch 路径重放，不写浏览器 Cookie 存储。切回原传输行为不会恢复之前删除的头。
- JWT 检查器中可编辑 Header / Payload，再本地重建 Token。旧签名被保留但不再有效；这不是重新签名，写回 Bearer 也不会发送请求。
- Tools → Compare 固定基线后，在忽略路径中每行填写一个精确 JSON Pointer，例如 `/timestamp`、`/data/requestId`。对象键顺序不影响比较，数组顺序仍有意义；忽略规则只作用于比较视图，不修改响应。非 JSON 或超过解析上限时按原文比较。
- 比较完成后可保存为证据，补充标签与复现步骤，下载 JSON 或 Markdown。默认脱敏报告省略自由备注、标签、复现步骤与比较基线，以免泄漏其中的凭证；完整导出才包含这些内容。原始快照仍保存在本地。
