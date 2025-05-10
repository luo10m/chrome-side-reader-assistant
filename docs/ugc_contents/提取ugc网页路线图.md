chrome-side-reader-assistant
完整项目路线图（仅规划，不含代码）

────────────────────────────
总体目标
────────────────────────────

1. 结构化提取典型 UGC 网页（标题区 / 帖子区 / 评论区）。
2. 在浏览器端持久化并增量更新内容。
3. 发生新增评论等变化时即时提醒。
4. 支持一键导出为 Markdown。
5. 为后续 AI 对话 / RAG 提供可检索的数据层。

────────────────────────────
阶段划分（MVT¹ → MVT⁵）
────────────────────────────
MVT¹ 站点适配 + 结构化抓取
MVT² IndexedDB 持久化 + 侧边栏浏览
MVT³ 增量跟踪 / 去重
MVT⁴ URL 监听 + Badge / 通知
MVT⁵ Markdown 导出

────────────────────────────
MVT¹ 站点适配 + 结构化抓取
────────────────────────────
目标
• 对 1–2 个目标站（小红书、知乎）在单个帖子页内提取
  – 标题、作者、正文、媒体
  – 首屏评论（基础字段）

任务

1. 适配器接口• 新增 site-adapters.js：host → selector 映射。
2. content-script.js 重构• 根据适配器生成结构化对象 {title, post, comments[]}。• 新增 action:'pageStructured' 消息。
3. background.js 初步接收
   • 打印 / 内存缓存结构化对象，保持原 pageContent 流程不变。

验收
– 在小红书帖子页，后台日志可见完整结构化 JSON。

────────────────────────────
MVT² IndexedDB 持久化 + 侧边栏浏览
────────────────────────────
目标
• 将结构化数据写入 IndexedDB。
• 侧边栏新增“已抓取页面”视图，可查看抓取详情。

任务

1. IndexedDB 封装（db.js）• savePage、getPage、updatePage API。
2. background.js 调用 savePage。
3. side-panel UI• 页面列表：标题 + 评论数 + 抓取时间。• 详情页：正文 + 评论。
4. History 监听（提早）
   • content-script 补丁 pushState/replaceState，切换帖子即重新抓取。

验收
– 切换帖子→侧边栏列表出现新条目；刷新浏览器后数据保留。

────────────────────────────
MVT³ 增量跟踪 / 去重
────────────────────────────
目标
• 对同一 URL 的后续抓取只存储 “真正新或被编辑” 的评论/正文。

任务

1. 为评论生成 stableId（data-id 或文本 hash）。
2. background/db 按 id 比较旧新数据，记录新增 / edited。
3. 当有差异时发送 action:'pageDiff' {newCount, editedCount}。
4. 节流：MutationObserver 批量侦测评论节点插入，每 500 ms 汇总一次。

验收
– 滚动加载更多评论，新评论计数正确；重复抓取不产生冗余数据。

────────────────────────────
MVT⁴ URL 监听 + Badge / 通知
────────────────────────────
目标
• 页面变化或检测到新评论时，给用户显式提醒。

任务

1. Badge• background 收到 pageDiff → chrome.action.setBadgeText(newCount)。• 当用户浏览侧边栏详情或页面切换时清零。
2. 桌面通知• newCount > 0 时 chrome.notifications.create。
3. 轮询兜底
   • 保留 checkUrlChange setInterval > 仅在 History 补丁失效时生效。

验收
– 新评论出现时扩展图标显示数字；点击详情后数字消失。

────────────────────────────
MVT⁵ Markdown 导出
────────────────────────────
目标
• 用户可一键把当前 URL 对应的结构化数据导出为 .md 文件。

任务

1. Markdown 模板# Title

   > 链接 / 作者 / 时间
   > 正文
   >

   ---

   ## 评论

   - **User**：文本
2. background.js• 读取 IndexedDB → 拼 Markdown → 生成 Blob。• chrome.action.onClicked 执行下载。
3. 侧边栏“导出”按钮（可选）。
4. manifest.json 添加 "downloads" 权限。

验收
– 点击扩展图标出现保存对话框；导出文件内容排版正确。

────────────────────────────
里程碑与时间预估（示例）
────────────────────────────
• MVT¹：1 周  解析接口 + 单站抓取
• MVT²：1 周  IndexedDB & UI 列表
• MVT³：1 周  增量逻辑 + 去重
• MVT⁴：0.5 周 Badge / 通知
• MVT⁵：0.5 周 Markdown 导出

────────────────────────────
风险 & 注意事项
────────────────────────────
• 站点结构频繁变化——适配器需可热更新 / 配置化。
• 信息量大时 IndexedDB 增长——定期清理或分页加载，提供手工清理功能。
• 频繁消息导致性能下降——MutationObserver 需做节流。
• Clipboard / Downloads 权限需在 manifest 声明，否则用户需重新安装扩展。

以上路线图与当前源码（chrome/background.js + src/js/content-script.js）兼容，可按阶段逐步合并，保证现有“全文抓取 + AI 摘要”功能持续可用，同时迭代出结构化抓取、增量更新、提醒与导出能力。
