# Gemini CLI 编程工具功能分析文档

## 一、产品说明

Gemini CLI 是 Google 推出的开源 AI 终端助手，将 Gemini 2.5 Pro 强大的多模态 AI 能力直接带入开发者的命令行环境。它不仅能理解和编辑大规模代码库，还能自动化复杂的开发与运维任务、生成应用、处理文档、与本地及远程工具集成。Gemini CLI 支持自然语言指令，帮助开发者高效完成编程、调试、文档、流程自动化等多种场景任务，是开发者、团队和个人提升生产力的利器。

主要特性包括：

- 支持超大代码库的查询与编辑（1M token 上下文窗口）
- 多模态输入（如 PDF、草图、图片等）
- 自动化运维（如 PR 查询、复杂 rebase 处理）
- 工具与 MCP 服务器扩展（如集成 Imagen、Veo、Lyria 等媒体生成工具）
- 集成 Google Search 工具，实时获取最新信息
- 开源可扩展，支持自定义和社区贡献



正确的使用方式：

- （首选）管道模式：我可以通过 echo "命令" | gemini 的方式向 Gemini 发送指令，回车结束

- 交互式模式：您可以手动在 Gemini CLI 界面中输入命令

注：可以使用 Context 7 获得最新版本详细信息




## 二、启动及参数

### 1. 环境准备

- 需安装 Node.js 20 或更高版本

### 2. 快速启动

#### 临时运行

```bash
npx https://github.com/google-gemini/gemini-cli
```

#### 全局安装

```bash
npm install -g @google/gemini-cli
gemini
```

### 3. 配置与认证

首次启动时需选择主题，并进行账户认证：

- **Google 账号登录**：免费获得 Gemini 2.5 Pro，每分钟 60 次、每天 1000 次请求额度
- **Gemini API Key**：从 Google AI Studio 获取，设置环境变量 `GEMINI_API_KEY` 可自定义模型及更高速率（付费可解锁更高额度）
- **Vertex AI Key**：从 Google Cloud 获取，设置 `GOOGLE_API_KEY` 和 `GOOGLE_GENAI_USE_VERTEXAI=true` 支持企业级用量

#### 参数举例

```bash
export GEMINI_API_KEY="YOUR_API_KEY"
export GOOGLE_API_KEY="YOUR_API_KEY"
export GOOGLE_GENAI_USE_VERTEXAI=true
```

### 4. 常用命令行参数

- `--help`：查看帮助
- `--yolo`：允许自动运行敏感操作（如写文件、网络访问），开发调试用
- `--config`：指定配置文件路径
- `--model`：指定使用的 Gemini 模型
- `--color-theme`：指定主题
- 更多参数详见官方文档

## 三、斜杠命令（Slash Commands）

Gemini CLI 支持多种内置斜杠命令（以 `/` 开头），用于管理会话、定制界面、控制行为等。以下为常用斜杠命令及其功能简介：

- **`/bug`**提交 Gemini CLI 的问题反馈。默认会在 GitHub 仓库创建 issue，后跟的字符串作为问题标题。可通过 `.gemini/settings.json` 配置 `bugCommand` 修改默认行为。
- **`/chat`**管理和恢复会话历史，实现分支会话或恢复之前的状态。子命令：

  - `save <tag>`：保存当前会话历史，需指定标签
  - `resume <tag>`：恢复指定标签的会话
  - `list`：列出可用的会话标签
- **`/clear`**清除终端屏幕，包括当前可见的会话历史和滚动内容。快捷键：**Ctrl+L**
- **`/compress`**用摘要替换当前全部对话上下文，节省 token 并保留任务摘要。
- **`/editor`**打开编辑器选择对话框。
- **`/help`** 或 **`/?`**显示 Gemini CLI 的帮助信息，包括所有命令及用法。
- **`/mcp`**列出已配置的 Model Context Protocol (MCP) 服务器及其工具和状态。子命令：

  - `desc`/`descriptions`：显示详细描述
  - `nodesc`/`nodescriptions`：仅显示名称
  - `schema`：显示工具参数的完整 JSON schema
    快捷键：**Ctrl+T** 切换描述显示
- **`/memory`**管理 AI 的分层指令上下文（由 GEMINI.md 文件加载）。子命令：

  - `add <text>`：添加记忆内容
  - `show`：显示当前全部记忆内容
  - `refresh`：重新加载所有 GEMINI.md 文件
- **`/restore [tool_call_id]`**恢复项目文件到上一次工具调用前的状态。可不带参数列出所有可用检查点。需启用 `--checkpointing` 选项。
- **`/stats`**显示当前会话的详细统计信息，包括 token 使用量、缓存节省量、会话时长等。
- **`/theme`**打开主题切换对话框。
- **`/auth`**打开认证方式切换对话框。
- **`/about`**显示版本信息。
- **`/tools`**列出当前可用工具。子命令：

  - `desc`/`descriptions`：显示工具详细描述
  - `nodesc`/`nodescriptions`：仅显示工具名称
- **`/privacy`**显示隐私声明，并允许用户选择是否同意数据收集。
- **`/quit`** 或 **`/exit`**
  退出 Gemini CLI。

---

斜杠命令为日常操作和高级管理提供了便捷入口，建议结合 `/help` 查看实时命令文档。

## 四、内置工具（Tools）

Gemini CLI 内置一系列强大的工具，AI 会根据任务自动调用，用户可选择授权执行：

- `ReadFile`/`WriteFile`/`Edit`：读写本地文件
- `FindFiles`/`ReadFolder`/`ReadManyFiles`：查找、读取文件夹及多文件内容
- `Shell`：运行 shell 命令
- `GoogleSearch`/`Search`：调用 Google 搜索，获取实时网络信息
- `WebFetch`：抓取网页内容
- `SaveMemory`：保存会话/上下文
- `@search`：在 prompt 中引用实时搜索结果

工具调用时，涉及敏感操作（如写本地文件、访问外网）会弹窗提示，用户可选择本次允许、始终允许或拒绝，确保安全可控。

## 五、典型应用场景

- **代码理解与迁移**：自动总结架构、迁移代码、生成单元测试
- **项目初始化与生成**：从 PDF/草图生成应用、批量创建目录结构
- **自动化运维**：批量处理 PR、生成报告、自动化部署脚本
- **多模态处理**：图片批量转换、发票图片信息提取、PDF 文档整理
- **智能文档生成**：自动生成 changelog、Markdown 文档、项目说明

## 六、总结

Gemini CLI 以自然语言为核心交互方式，结合丰富的本地与云端工具，极大提升了开发者在终端中的生产力和自动化能力。其开放性和可扩展性，使其不仅适合个人开发者，也能满足企业级复杂场景需求。
