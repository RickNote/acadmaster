# XiaoEt (学术大拿)

一个基于 Chrome Manifest V3 的学术翻译扩展，支持选中翻译、整页/整文档翻译、OCR 图片翻译以及内嵌 PDF 预览。

主要功能
- 文本选中翻译（右键或快捷键触发）
- 整页/整文档翻译，支持双语对照模式
- OCR 图片识别并翻译
- 内嵌 PDF 查看器（基于 PDF.js）用于本地 PDF 的学术查看与翻译
- 支持多翻译引擎、自动回退与流式分块结果

快速开始
1. 打开 Chrome -> chrome://extensions/ -> 打开“开发者模式”
2. 点击“加载已解压的扩展程序（Load unpacked）”，选择本仓库目录 `xiaoet-extension-main`
3. 修改代码后在扩展页面点击刷新以加载最新代码

开发与测试
- 本项目为纯前端（无构建系统），直接在 Chrome 中以未打包扩展运行。
- 快捷键：
  - Alt+Shift+X — 翻译选中内容
  - Alt+Shift+D — 翻译整页/整文档
- 设置页面：点击扩展图标 -> 打开设置（`options.html`）可配置 API key、引擎、目标语言等，并可测试 API keys

项目结构（简要）
- `src/background/service-worker.js`：统一的翻译网关与缓存逻辑
- `src/content/`：内容脚本（OCR、UI、文档翻译、上下文抽取等）
- `src/pdf/`：内嵌 PDF 查看器（PDF.js）和 cmap/locale 资源
- `options.html` / `options.js`：设置页面

注意事项
- 本仓库不包含任何后端；使用外部翻译引擎需在设置中填入相应 API Key
- 项目字符串为中文（zh-CN）

许可
本项目遵循 MIT 许可证（详见仓库根目录下的 `LICENSE`）。

贡献
欢迎提交 issue 和 pull request。提交前请确保代码风格一致并提供可复现的说明。

联系方式
- 仓库: https://github.com/Rugkey/xiaoet-extension