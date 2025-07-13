# Claude Code 编程工具功能分析文档

## 1. 工具简介

Claude Code 是由 Anthropic 开发的智能编程工具（Agentic Coding Tool），支持在终端中通过自然语言指令高效编写、编辑、理解和管理代码。它能够自动化常见开发任务，如修复 bug、代码重构、测试运行、Git 操作等，并支持丰富的扩展能力（如 MCP、多工具集成）。

注：可以使用 Context 7 获得最新版本详细信息
注：由于特别原因，我必须使用 `ccr code` 启动 Claude Code.



**正确的使用方式：**

- （首选）管道模式：我可以通过 echo "命令" | code 的方式向 Claude Code CLI 发送指令，回车结束

- 交互式模式：您可以手动在 Claude Code CLI 界面中输入命令


注：可以使用 Context 7 获得最新版本详细信息






---

## 2. 安装与启动

### 安装步骤

1. 确保已安装 Node.js 18+。
2. 在终端执行：
   ```
   npm install -g @anthropic-ai/claude-code
   ```
3. 进入项目目录，运行：
   ```
   ccr code
   ```
4. 按照提示完成 OAuth 认证及环境初始化。

### 启动参数

- `ccr code`：进入交互式 REPL 会话。
- `claude "query"`：用初始提示启动会话。
- `claude -p "query"`：一次性执行命令后退出。
- `cat file | claude -p "query"`：通过管道传递文件内容进行处理。
- `claude config`：查看/修改配置。
- `claude update`：升级至最新版。
- `claude mcp`：管理 MCP 服务器。
- 常用 Flags：
  - `--print`：仅打印响应，不进入交互模式。
  - `--verbose`：详细日志。
  - `--dangerously-skip-permissions`：跳过权限提示（仅限隔离环境）。

---

## 3. 斜杠命令（Slash Commands）

### 内置斜杠命令

| 命令                   | 功能说明                         |
| ---------------------- | -------------------------------- |
| `/help`              | 获取帮助                         |
| `/init`              | 初始化/更新 CLAUDE.md            |
| `/clear`             | 清除会话历史                     |
| `/compact`           | 压缩会话，减少 token 消耗        |
| `/cost`              | 显示 token 使用统计              |
| `/config`            | 查看/修改配置                    |
| `/doctor`            | 检查安装健康状况                 |
| `/login` `/logout` | 切换/注销账户                    |
| `/model`             | 选择/切换模型                    |
| `/review`            | 请求代码审查                     |
| `/pr_comments`       | 查看 PR 评论                     |
| `/permissions`       | 查看/更新权限                    |
| `/terminal-setup`    | 配置多行输入快捷键               |
| `/bug`               | 上报错误                         |
| `/add-dir`           | 添加额外工作目录                 |
| `/mcp`               | 管理 MCP 服务器连接与 OAuth 验证 |

### 自定义斜杠命令

- 可在 `.claude/commands/`（项目级）或 `~/.claude/commands/`（用户级）下创建 Markdown 文件，定义常用提示模板。
- 支持命名空间与参数传递（如 `/project:fix-issue 123`）。
- 可在命令文件中用 `$ARGUMENTS` 占位符、`!` 执行 Bash 命令、`@` 引用文件内容。

---

## 4. 工具与权限（Tools & Permissions）

### 工具类型

- **只读工具**：如 FileReadTool、GrepTool、LSTool、NotebookReadTool，无需授权。
- **写入/执行工具**：如 FileEditTool、FileWriteTool、BashTool、NotebookEditTool，需显式授权。
- **AgentTool**：运行子代理处理复杂任务，无需权限。
- **MCP 工具**：通过 MCP 协议扩展外部工具和服务。

### 权限管理

- 分层权限系统，敏感操作需用户批准。
- 可通过 `/permissions` 命令、配置文件或启动参数管理工具授权。
- 推荐在隔离环境下使用高权限模式。

---

## 5. 配置与上下文管理

### CLAUDE.md 文件

- 记录常用命令、代码风格、测试说明、仓库规范、开发环境设置等。
- 支持多级加载（项目根目录、父/子目录、用户目录）。
- 可用 `/init` 自动生成基础模板。

### 终端与通知设置

- 支持 Bash、Zsh。
- 可通过 `/terminal-setup` 配置多行输入快捷键（如 Shift+Enter）。
- 通知可配置为终端响铃或系统通知。

---

## 6. 工作流与最佳实践

- **探索-规划-编码-提交**：先让 Claude 阅读/规划，再编码、最后提交。
- **测试驱动开发（TDD）**：先写测试再实现功能。
- **视觉驱动开发**：结合截图/设计稿进行 UI 还原。
- **安全 YOLO 模式**：低风险任务可跳过权限确认（仅建议在隔离容器环境下）。
- **代码库问答**：支持自然语言提问代码库结构、实现细节等。

---

## 7. 成本管理

- 每次交互消耗 tokens，可用 `/cost` 命令和控制台查看消耗。
- 优化策略：用 `/compact` 压缩对话、精准提问、分解复杂任务、清除历史。

---

## 8. 与第三方 API 集成

- 支持接入 Amazon Bedrock、Google Vertex AI、MCP 协议等。
- 通过配置环境变量与凭证实现集成。
- MCP 支持将外部服务暴露为斜杠命令。

---

## 9. 安全性与隐私

- 权限系统防止未授权操作。
- 输入清理、命令黑名单防范 prompt 注入等攻击。
- 数据仅用于产品改进，反馈信息 30 天内删除。

---

## 10. 常见问题解答（FAQ）

- **Claude Code 支持哪些系统？** macOS、Ubuntu、Windows（WSL）。
- **如何切换模型？** `/model` 命令。
- **如何初始化项目？** `/init` 命令生成 CLAUDE.md。
- **如何降低 token 消耗？** `/compact`、分解任务、精准提问。
- **Claude Code 能处理图片吗？** 支持图像分析（如 UI 设计稿）。
- **如何保障安全？** 采用权限分层、输入清理、敏感命令黑名单等措施。

---

## 参考资料

- [官方文档 - 斜线命令](https://docs.anthropic.com/zh-TW/docs/claude-code/slash-commands)
- [Claude Code完全指南](https://blog.axiaoxin.com/post/claude-code-full-guide/)
- [知乎 - Claude Code Agent 0.2.9 版本Prompt&amp;Tools最细致解读](https://zhuanlan.zhihu.com/p/1898032398752514746)
