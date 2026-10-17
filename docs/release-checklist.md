# 发布验收

发布前先运行 `yarn release:check v0.2.0`、`yarn check`、`yarn dist:chrome` 和 `yarn dist:firefox`。ZIP 应含根目录 Manifest、所有 HTML/JS/CSS 和 WASM；压缩包不应包含开发预览适配器。

## 真实 Chrome 扩展验收

使用本机回环测试服务与非敏感测试数据，不以网页预览代替真实扩展：

- 安装后首次打开能生成当前 URL 的空 GET 草稿，标注来源，不自动发包。
- 无捕获记录的 Load 为轻提示；用户主动刷新后能读到真实主文档请求。
- 页面 URL 变化后，Load 不带入旧页面的 POST 正文。
- GET、JSON POST、cURL 导入的表单请求能到达测试服务，并核对原始正文。
- 历史恢复和 cURL 导入只填入编辑器，不自动发送。
- 慢请求可以取消；超时后显示终态并保留编辑内容。
- 浅色与深色模式均可操作；复制诊断不包含请求数据。
- 重载扩展并重新打开 DevTools 后可以重新连接，历史仍可读取。

## v0.2 工作台回归

- 保存 Raw / Follow redirects 设置后重新打开面板，首次 URL 草稿正常载入，不显示误报的编辑冲突。
- 设置读取失败仍可连接；设置读取中关闭面板不创建延迟连接（Node 生命周期测试）。
- Tools / History 互斥，五个工具页签可切换，窄窗口无页面横向溢出。
- Requests 读取真实 HAR 并载入 JSON POST；关闭停止监听，缺失正文禁止直接载入，载入不自动发送。
- Params 的重复参数、裸 flag、中文编码与 URL 片段往返保持一致，禁用项不进入发送 URL。
- JSON 格式化后大整数与重复键不丢失；正文变化后禁止过期写回。
- Compare 使用实际发送时的快照；失败与迟到结果不替换上次完成记录。
- JWT 解码与有效/无效签名，修改 Token/密钥后旧结果消失，离开页签清空密钥。
- Settings / About 在面板内打开，返回保留未完成的 Raw 输入；主题、超时与历史开关联动，重开后默认超时恢复，About 版本与 Manifest 一致。
- Response 的 Pretty / Tree / Raw 切换、字段复制与 Copy body；大整数和重复键保留，无效/超限 JSON 回退原文。
- Raw Request 明暗高亮、滚动、选区、复制和撤销，Send 原文保持一致；大请求回退纯文本。
- 编辑捕获正文后再次发送，服务端收到完整正文，没有旧 Content-Length 截断。

## 模拟测试与真实验证的区别

Node 回归测试覆盖后台重连 / 握手 / 监听器释放、错误分类、旧结果隔离、导航竞态和权限缺失。真实 Chrome 验收记录见每次发布的验证记录；不要将模拟 worker 断线写成实际终止 Chrome worker 的测试。

Firefox 应单独进行真实加载测试；仅构建通过时，应明确标记为“已构建，未做本机 Firefox UI 验收”。

## 包与下载验证

- Tag 必须与 package.json 一致；更新日志和版本发布说明齐备。
- Manifest 版本、浏览器注册、完整资源与生产包预览隔离校验通过。
- 从相同产物重复打包，核对 SHA-256 一致。
- 为 Chrome / Firefox ZIP 生成 `SHA256SUMS.txt`。
- 发布后重新下载安装包并核对摘要，不仅检查上传成功。
- Chrome 为手动解压加载包；未签名的 Firefox 包仅用于临时加载。
