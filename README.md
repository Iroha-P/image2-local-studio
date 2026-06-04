# Image2 Local Studio

一个本地 `gpt-image-2` API 生图工具：Node.js 服务 + HTML 前端。前端包含参数控制面板、可编辑 Prompt Skill、Skill 预览图和图片墙，支持保存 API 配置、生成图片、超分保存、下载图片和删除本地图片。

## 一键启动

双击 `start.bat`，或在当前目录运行：

```powershell
.\start.bat
```

首次启动会自动安装本地超分依赖 `sharp`。启动后打开：

```text
http://localhost:8787
```

## 尺寸逻辑

OpenAI 官方 `images/generations` 当前可用的原生尺寸为：

- `auto`
- `1024x1024`
- `1024x1536`
- `1536x1024`

工具把尺寸分成两层：

- 官方原生尺寸：真实传给 OpenAI API 的 `size`。
- 最终导出尺寸：本地保存前的尺寸。1K/2K/4K/自定义尺寸会在本机用 `sharp` 超分保存。

因此 4K 不是强行传给官方 API，而是在官方图生成成功后做本地超分。

## 使用方式

1. 在左侧 API 面板填写 OpenAI API Key，点击“保存”。
2. 选择官方原生尺寸，再选择最终导出尺寸。
3. 调整质量、背景、格式、压缩、审核等参数。
4. 在 Prompt Skill 面板选择预设，查看预览图，按需修改名称、说明、预览图 URL 和 Prompt。
5. 点击“调用”把 Skill Prompt 填入主提示词框。
6. 点击“生成图片”，成功后图片会保存到 `data/images`，并显示在图片墙。
7. 图片墙里可以预览、下载保存或删除图片。

## Skill 编辑

内置 Skill 位于：

```text
skills/awesome-gpt-image-2/presets.json
```

首次运行会复制到：

```text
data/skill-presets.json
```

前端保存 Skill 时修改的是 `data/skill-presets.json`。点击“重置 Skill”会恢复到内置版本。

页面里的 Skill 支持：

- 新增并命名
- 修改说明、预览图 URL 和 Prompt
- 调用到主提示词
- 保存到本地
- 删除当前 Skill
- 同步 GitHub 仓库场景
- 翻译当前 Skill 为简体中文

同步也可以用命令行执行：

```powershell
npm run sync-skills
```

当前同步来源：

- YouMind OpenLab `awesome-gpt-image-2`：CC BY 4.0
- EvoLinkAI `awesome-gpt-image-2-API-and-Prompts`：CC0 1.0

同步脚本优先读取中文 README：YouMind 使用 `README_zh.md`，EvoLinkAI 使用 `README_zh-CN.md`。脚本会抽取 README 中可识别的 `No.` / `Case` 场景、Prompt 代码块和预览图链接，写入 `data/skill-presets.json`。当前已同步 333 个 Skill。

说明：YouMind 的中文 README 包含中文 Prompt；EvoLinkAI 的中文 README 入口中仍有大量英文 Case/Prompt。遇到看不懂的英文 Skill，可以在页面点击“翻译中文”，它会使用已保存的 OpenAI API Key 翻译当前 Skill 并保存。

## 项目主页

`docs/index.html` 是为 GitHub Pages 准备的静态项目主页。GitHub Pages 只能托管静态主页，不能直接运行本项目的 Node 生图 API；真实生图服务仍需要本地运行，或部署到支持 Node.js 的服务器。

## 本地文件

- `server/index.js`: 本地 API 服务，代理 OpenAI 图像生成并保存/超分图片。
- `public/index.html`: 前端页面。
- `public/app.js`: 前端交互。
- `public/styles.css`: 前端样式。
- `public/skill-previews`: 内置 Skill 预览图。
- `skills/awesome-gpt-image-2`: 内置提示词 skill 和预设。
- `data/config.json`: 本地 API 配置，首次启动自动创建。
- `data/skill-presets.json`: 可编辑 Skill 配置。
- `data/images`: 本地图片保存目录。

## 内置 Skill 来源

本项目内置的 Prompt Skill 参考并改写自：

https://github.com/YouMind-OpenLab/awesome-gpt-image-2

同时支持同步：

https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts

YouMind 原仓库许可证为 CC BY 4.0，EvoLinkAI 原仓库许可证为 CC0 1.0。同步数据会保留来源与许可证说明。

## OpenAI 图像接口

服务默认调用：

```text
POST https://api.openai.com/v1/images/generations
```

默认模型为 `gpt-image-2`。相关参数参考 OpenAI 官方文档：

https://platform.openai.com/docs/guides/image-generation
https://platform.openai.com/docs/api-reference/images/create
