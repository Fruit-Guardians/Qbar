# 参与开发

[← 项目首页](../README.md) · [架构说明](architecture.md)

## 环境准备

- Node.js **22**。
- Corepack / Yarn **4.5.3**，版本由 `packageManager` 固定。
- 定制依赖首次构建需要 `python3`、C/C++ 编译工具、`make`、`jq`、`patch` 和 `tar`。

macOS 请安装 Xcode Command Line Tools，并准备上述命令；Ubuntu 可安装 `build-essential python3 jq patch tar`。依赖构建配方见 `build/package-generators`，补丁见 `build/package-patches`。

```sh
git clone https://github.com/Fruit-Guardians/Qbar.git
cd Qbar
corepack enable
yarn install --immutable
```

## 本地预览

```sh
yarn dev:ui
```

打开 `http://127.0.0.1:5173/panel.html`。预览使用独立的模拟浏览器适配器，**不会发送真实网络请求**。需要验证真实浏览器 API 与传输行为时，构建并加载扩展。

## 检查与构建

```sh
# 回归测试、类型检查、ESLint 与 Prettier
yarn check

# 两个浏览器的扩展
yarn build:chrome
yarn build:firefox

# 可重复的 ZIP 打包
yarn dist:chrome
yarn dist:firefox
```

发布候选版还需执行 `yarn release:check`，检查 package 版本、更新日志和 `docs/releases/v版本.md`。传入 Tag 时必须与版本完全一致，例如 `yarn release:check v0.2.0`。打包前会拒绝旧版本或错误浏览器 Manifest、缺失资源和开发预览代码。

也可以分别执行 `yarn test`、`yarn types:check` 和 `yarn lint`。

## 项目结构

```text
src/
  entrypoints/         # 面板、DevTools 注册、权限页入口
  app/                 # 工作区装配、组合逻辑、主题与样式
  features/
    request/           # 请求编辑、响应展示、cURL 和正文处理
    history/           # 历史侧栏与持久化模型
    tools/             # JWT、编码、哈希、测试与自定义片段
    workbench/         # 页面请求、参数、无损 JSON 与对比侧栏
  extension/
    background/        # 消息路由、执行器、队列与会话
    content-scripts/   # 表单导航、响应渲染与路径测试
  shared/              # 协议类型、HTTP 头常量与基础函数
build/                 # 构建插件、预览适配器与依赖配方
scripts/               # 扩展打包、产物与发布元数据校验
tests/                 # 回归测试与辅助工具
docs/                  # 使用指南、架构与展示素材
```

组件使用职责命名，例如 `BasicRequestEditor.vue`；逻辑文件使用 kebab-case。源码统一使用 `@/` 别名。正文处理器显式注册，不依赖文件排序。

## 提交改动

1. 描述要解决的问题与预期行为，尽量保持改动集中。
2. 请求行为改动附可复现输入与回归测试；报告问题时删除 Token、Cookie 等敏感信息。
3. UI 改动附明暗主题截图，检查紧凑面板的布局。
4. 执行 `yarn check`，并构建 Chrome 与 Firefox 版本。

浏览器 API 模拟测试和回环 HTTP 测试不等同于真实扩展验证。提交说明中请区分模拟测试、开发预览和实际浏览器验证。
