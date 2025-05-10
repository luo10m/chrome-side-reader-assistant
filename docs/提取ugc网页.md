
────────────────────────────────────────
一、核心目标拆解

1. 在典型 UGC 页面（以小红书为例）上，可靠地分离并抓取A. 标题区（可能为空）B. 帖子区：作者、发布时间、正文、媒体(图/视频)C. 评论区：评论人、时间、正文、点赞等
2. 将上述数据序列化成结构化对象并持久化（可增量更新）
3. 支持导出（Markdown / JSON / CSV…）
4. 基于该结构化数据，与 AI 进行对话、分析、总结

────────────────────────────────────────
二、抓取层（Extraction Layer）

1. 分区识别策略• DOM Selector 白名单

   - 预调研多家 UGC 站（小红书/微博/知乎/Reddit…），归纳常见结构并写成“站点适配器”数组：{ host: /xiaohongshu\.com/, titleSel: 'h1, .note-title', postSel: '.note', commentSel: '.comment-item', … }
   - 站点未知时走兜底：使用 Readability / 阶段化启发式（最长文本块 = 主帖；与主帖同级的 siblings = 评论）。• 动态加载检测
   - 评论往往异步加载，需 MutationObserver 监听或拦截 XHR，等评论节点插入后再解析 / 增量解析。
2. 结构化输出草案{
   url, capturedAt,
   title,
   post: { author, authorId, avatar, publishedAt, contentText, contentHtml, medias:[{type,url}] },
   comments:[{ id, author, authorId, contentText, publishedAt, likes, replyTo? }],
   meta:{ site:'小红书', language:'zh' }
   }
3. 增量/重复抓取问题
   • 为每条数据生成稳定 id/hash（如 commentId or textHash）
   • 每次抓取只上报新片段，后台合并（前面“chunk-diff”思路可沿用）
   • 触发时机：首屏＋用户滚动到评论区＋“展开更多”按钮 click 截获

────────────────────────────────────────
三、存储层（Persistence Layer）

选型：
• 小规模（浏览器端使用）：IndexedDB（如 idb-keyval 包）或 chrome.storage.local；
• 若想跨设备或后端 AI 服务统一访问，可在后台同步到远端（Supabase、Firestore、Self-hosted DB）

数据模型：pageTable

- url (PK)
- title
- capturedAt / updatedAtpostTable
- url (FK)
- contentHash / bodycommentTable
- url (FK)
- commentId (PK 或 Unique)
- contentHash / body

增量更新流程

1. content-script 把 diff 后的新行发给 background
2. background 查本地 DB：若 commentId 未存在 → insert，若 hash 变 → update + 标识为 edited
3. 保存成功后触发事件/消息用于通知前端或推送

────────────────────────────────────────
四、导出层（Export Layer）

支持两类输出：

1. Markdown：结构化拼接# 标题

   元信息块 (作者 / 时间 / 链接)
   正文（保留 Markdown 语法 / 图片引用）
   ------------------------------------------------------------------

   ## 评论

   - **用户A** *(2023-10-10)*：评论内容 …
   - …
     可一键下载为 *.md*，或者复制到剪贴板。
2. JSON / CSV：直接序列化 pageTable+post+comments，方便二次处理。

触发方式：
• 浏览器 Action 按钮 / 右键菜单
• 网页侧边栏“导出”按钮
• 定时后台自动导出到本地文件夹 / 云端盘

────────────────────────────────────────
五、AI 对话层（Conversational Layer）

1. 技术模式选型A. 直接注入 Prompt：将所需段落文本与用户问题拼成 prompt 发送到 OpenAI/Claude。适合短内容。B. 检索增强生成 (RAG)：① 本地/云端对每段文本生成向量（embeddings），存入向量库（比如 chroma.js、Supabase Vector、Weaviate）。② 用户提问 → embed → 最近邻检索 → 取若干片段组装 prompt → 发送给 LLM。好处：评论海量时依旧可问答，且保持上下文相关性。
2. 对话粒度• “总结帖子” → 只检索 post 部分• “网友如何评价 X” → 检索评论向量• “生成买家指南” → 先摘要评论，再指令式生成结构化输出
3. 状态管理• 把用户历史问答存浏览器 IndexedDB，形成 thread，可持续调用 embeddings+metadata• 对每个对话步骤记录 prompt 与 response，便于溯源与二次处理
4. 隐私与成本
   • 对评论文本做脱敏（去 @、ID）
   • 配置：“仅本地模型” / “云端推理”
   • 针对长评论列表，可先做 Map-Reduce 摘要减少 token

────────────────────────────────────────
六、整体流程示意

1. 用户打开 UGC 页面
2. 内容脚本 =>a. 识别/抓取 title、post、第一屏评论b. 发送 structured payload（含哈希）给 background
3. background =>a. 合并更新到 IndexedDBb. 触发 UI badge “New Comments 3”
4. 用户继续滚动 / 点击“展开更多评论”a. MutationObserver 捕获新增节点 → 重复第 2,3 步
5. 用户点工具栏“导出”a. background 查询 DB → 组装 Markdown / JSON → chrome.downloads
6. 用户在侧边栏 AI 聊天框提问
   a. 前端 embed 问题向量
   b. background 在向量库检索相关 chunks
   c. 拼 prompt + OpenAI API / 本地 llama.cpp WASM
   d. 返回回答并在 UI 展示

────────────────────────────────────────
七、可逐步实施的里程碑

1. MVP• 针对 1–2 个站点编写适配器 → 抓取 Post + Comments → IndexedDB / storage 持久化• 手动按钮导出 Markdown
2. 增量跟踪 + 通知• chunk-hash 去重• URL 轮询 or history 监听 → 新增评论提示 Badge
3. AI 对话基础版• 简单把全文 + 问题发送 GPT-3.5 → 返回结果
4. RAG-优化版• 本地向量库 + chunk 检索 + GPT-3.5/4
5. 多站点通用化 + 配置 GUI
   • 适配器可通过 JSON 配置新增，不必改代码
   • 用户自定义最小段长、导出模板等

这样就能形成以“结构化抓取 → 持久化 → 导出 → AI 利用”为主线的完整工作流，并可根据资源与需求在本地或云端灵活扩展。
