# DevTools 视觉规范

QBar 保留 DevTools 内嵌面板形态，用紧凑工具栏和原生表单完成操作，不引入独立工作台窗口。

## 视觉角色

统一在 `src/app/styles/design-tokens.scss` 定义明暗主题：surface / canvas / toolbar 区分表面层级，text / muted 区分信息层级，primary / selected / hover / focus / disabled 表达操作状态。颜色不跟随 Chrome 自定义强调色，也不依赖 Chrome 私有 CSS。

- UI 字体 13px；辅助说明 12px / 18px。
- 主控件高度 28px、圆角 6px；Settings 分组使用 8px 圆角和细边框，不加投影。
- 编辑器保持 12px / 18px 与 8px 内边距；高亮层与输入层同步，避免光标错位。
- 主要操作 Send 保持主色；编码、哈希、Payloads、自定义片段统一收进 Utilities（⋮），功能不删减。
- 当前页签、鼠标悬停、键盘焦点、禁用态分别呈现；Tree 的字段复制操作在行悬停或键盘聚焦时出现，触屏始终显示。
- Settings 隐藏无关的请求工具栏，General / About 共用导航、间距、链接与状态样式。窄面板导航变为横排。
- 对比度测试覆盖明暗主题的正文、说明、选中态、主按钮及 JSON 语法色。

## 语言

界面文案通过 `src/shared/i18n` 的双语词典与 Vue 插件渲染，不扫描或改写 DOM。默认语言参考浏览器偏好，可在设置中覆盖，保存键为 `uiLanguage`。English 使用源文案，中文使用词典；参数占位符两端保持一致。协议值、代码示例和用户数据不经过翻译；已知 JSON 诊断仅翻译说明并保留行列信息，外部诊断保持原文。Vuetify 内置表格与分页同步使用对应语言。

## 参考

采用公开设计原则，自行实现 QBar 的语义色和组件样式，不导入 DevTools 内部代码。

- [Chrome DevTools UX style guide](https://github.com/ChromeDevTools/devtools-frontend/blob/main/docs/styleguide/ux/styles.md)
- [DevTools semantic design tokens](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/design_system_tokens.css)
- [DevTools Preferences](https://developer.chrome.com/docs/devtools/settings/preferences)
