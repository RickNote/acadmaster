
# XiaoEt（学术大拿）

一个面向学术阅读与笔记的 Chrome 浏览器扩展，专注于快速、准确的网页与文档翻译：支持选中翻译、整页/整文档翻译（含双语对照）、图片 OCR 翻译，以及内嵌的 PDF 学术查看器。

如果你想在阅读英文论文、资料或截图时快速获得高质量中文释义，XiaoEt 就是为此而生。

✨ 亮点

- 极简：无需后端，代码可直接以未打包扩展运行（Manifest V3）
- 多引擎：支持多翻译引擎并在失败时自动回退到可用引擎
- 实用：选中即翻译、支持整页/文档批量翻译与双语展示
- OCR：内置 Tesseract OCR，可对图片进行识别并翻译
- PDF 支持：内嵌 PDF.js 学术查看器，方便本地 PDF 翻译与阅读

快速上手（3 步）

1. 打开 Chrome -> chrome://extensions/ -> 启用“开发者模式”
2. 点击“加载已解压的扩展程序（Load unpacked）”，选择本仓库根目录 `xiaoet-extension-main`
3. 在任意页面选中文本或右键图片，或使用快捷键触发翻译

常用快捷键

- Alt+Shift+X — 翻译选中内容
- Alt+Shift+D — 翻译整页/整文档

界面与设置

- 点击扩展图标打开主面板（或在网页选中文字后使用右键菜单）
- 设置页面：`options.html` 可配置翻译引擎、API Key（支持测试按键）、目标语言、提示词配置和双语显示等

支持的翻译引擎（示例）

- DeepL（需要 API Key）
- OpenAI（如使用 GPT 系列模型，需 API Key）
- DeepSeek（自研/第三方，支持流式）
- Google Translate（作为回退引擎）

开发者说明（给想参与的人）

- 代码是纯前端、无构建系统：直接修改源码并在 chrome://extensions/ 中刷新即可看到效果
- 关键脚本位置：
  - `src/background/service-worker.js`：处理请求路由、缓存、与外部 API 通信
  - `src/content/ui.js`：负责 ShadowDOM 中的翻译卡片 UI
  - `src/content/document-translator.js`：整页/文档翻译与双语应用逻辑
  - `src/content/ocr-translator.js` / `tesseract-full.js`：OCR 相关
  - `src/pdf/`：PDF.js 与学术查看器资源（cmap、locale、字体）

重要实现细节（便于排查问题）

- 所有翻译请求均通过 service worker 进行集中管理（message types: REQUEST_TRANSLATE, REQUEST_STREAM_TRANSLATE 等）
- 使用 LRU 缓存（最大 200 条），键为文本的 djb2 完整哈希
- 所有外部请求使用 `safeFetch()`，非 2xx 会抛错并触发回退引擎
- 翻译函数返回形如 `{ text, detectedLang, fallbackEngine }` 的对象，UI 使用 `.text` 显示翻译结果

常见问题（FAQ）

Q: 为什么有时翻译失败？
A: 请在 `options` 中确认所选引擎的 API Key 是否正确，并在设置页使用“测试”按钮验证；若主引擎不可用，扩展会自动回退到 Google Translate（若配置可用）。

Q: OCR 识别精度不高怎么办？
A: 尽量提供清晰、分辨率较高的图片；对于截图或照片，先裁切并确保文字为水平状态会提升效果。

贡献指南

- 欢迎以 Issue 或 Pull Request 形式提交改进：
  1. Fork 本仓库并在新分支上工作
  2. 保持中文界面字符串一致（项目以 `zh-CN` 为主）
  3. 在 PR 描述中写明改动目的与复现步骤

许可与版权

本项目采用 MIT 许可证，详情见根目录 `LICENSE` 文件。

致谢

基于 PDF.js 与 Tesseract.js 的优秀开源实现；以及所有反馈与贡献者。

联系方式

- 仓库: https://github.com/Rugkey/xiaoet-extension

祝你阅读愉快！如果需要，我可以帮你：在 README 中加入示例截图、API Key 配置示例、或 GitHub Actions 用于自动检查/格式化。
