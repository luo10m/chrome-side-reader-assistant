

# MVT¹ 站点适配 + 结构化抓取

## 详细开发设计文档

### 1. 项目背景与目标

**chrome-side-reader-assistant 目前已实现全文抓取和AI摘要功能，但缺乏对UGC内容的结构化处理。MVT¹ 阶段将实现站点适配器机制和结构化抓取能力，为后续功能打下基础。**

**主要目标**：

* **针对小红书、知乎等UGC网站实现结构化抓取**
* **区分并提取标题区、帖子区（作者、正文、发布时间、媒体）、评论区**
* **保持与现有全文提取流程兼容**

### 2. 系统架构设计

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│                     │    │                     │    │                     │
│  Content Script     │    │   Background        │    │      UI Layer       │
│                     │    │                     │    │                     │
│ ┌─────────────────┐ │    │ ┌─────────────────┐ │    │                     │
│ │  Site Adapters  │ │    │ │ Message Handler │ │    │                     │
│ └─────────────────┘ │    │ └─────────────────┘ │    │                     │
│         │           │    │         │           │    │                     │
│ ┌─────────────────┐ │    │ ┌─────────────────┐ │    │                     │
│ │Structure Extract│────────▶│  Memory Cache  │ │    │                     │
│ └─────────────────┘ │    │ └─────────────────┘ │    │                     │
│         │           │    │                     │    │                     │
│ ┌─────────────────┐ │    │                     │    │                     │
│ │Full-text Extract│────────▶                   │    │                     │
│ └─────────────────┘ │    │                     │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### 3. 关键模块设计

#### 3.1 站点适配器模块 (site-adapters.js)

```
/**
 * 站点适配器定义 - 使用IIFE避免污染全局作用域
 * 通过window对象暴露必要的函数
 */
(function(window) {
    // 站点适配器数组
    const siteAdapters = [
        {
            name: "小红书",
            hostPattern: /xiaohongshu\.com/,
            selectors: {
                title: "h1.title, .note-title",
                post: {
                    container: ".note-content, .content",
                    author: ".user-nickname, .author-name", 
                    publishTime: ".publish-time, time",
                    content: ".content .desc, .content-wrap",
                    images: ".note-image img, .image-item img"
                },
                comments: {
                    container: ".comment-item, .comment-card",
                    author: ".user-nickname, .author-name",
                    content: ".content, .comment-content",
                    time: ".comment-time, time",
                    likes: ".like-count, .like-wrapper"
                }
            },
            // 额外的站点特定处理函数
            extractors: {
                // 函数示例: 从DOM元素提取文本、时间、图片URL等
                postMediaUrls: function(postEl) {
                    if (!postEl) return [];
                    const imgs = postEl.querySelectorAll('img');
                    return Array.from(imgs).map(img => img.src || img.getAttribute('data-src')).filter(Boolean);
                }
            }
        },
        {
            name: "知乎",
            hostPattern: /zhihu\.com/,
            selectors: {
                title: "h1.QuestionHeader-title, .Post-Title",
                post: {
                    container: ".Question-main, .Post-content",
                    author: ".AuthorInfo-name, .PostInfo-author",
                    publishTime: ".ContentItem-time, .PostInfo-time",
                    content: ".RichContent-inner, .Post-RichTextContainer",
                    images: ".RichContent-inner img, .Post-RichTextContainer img"
                },
                comments: {
                    container: ".CommentItem, .NestComment",
                    author: ".CommentItem-meta .UserLink-link, .NestComment-user",
                    content: ".CommentItem-content, .NestComment-content",
                    time: ".CommentItem-time, .NestComment-time",
                    likes: ".CommentItem-likeCount, .NestComment-likeCount"
                }
            }
        }
    ];

    /**
     * 根据页面URL获取适配器
     * @param {string} url - 当前页面URL
     * @returns {Object|null} - 匹配的适配器或null
     */
    function getAdapterByUrl(url) {
        try {
            const host = new URL(url).hostname;
            return siteAdapters.find(adapter => 
                adapter.hostPattern.test(host)
            ) || null;
        } catch (e) {
            console.error('获取适配器失败:', e);
            return null;
        }
    }

    // 将函数暴露到全局作用域
    window.getAdapterByUrl = getAdapterByUrl;
    
    // 仅用于调试
    window._siteAdapters = siteAdapters;
    
    console.log('站点适配器已加载，支持的站点:', siteAdapters.map(a => a.name).join(', '));
})(window);
```

#### 3.2 工具函数 (content-script.js 顶部)

```
// ===================== 工具函数 =====================
/**
 * 从选择器获取文本内容
 * @param {string} selector - CSS选择器
 * @returns {string} 文本内容或空字符串
 */
function getTextContent(selector) {
    try {
        const el = document.querySelector(selector);
        return el ? el.textContent.trim() : '';
    } catch (e) {
        console.error('获取文本内容失败:', e);
        return '';
    }
}

/**
 * 从元素内提取子选择器对应文本
 * @param {Element} el - 父元素
 * @param {string} selector - 子元素选择器
 * @returns {string} 文本内容或空字符串
 */
function extractText(el, selector) {
    try {
        if (!el) return '';
        const child = el.querySelector(selector);
        return child ? child.textContent.trim() : '';
    } catch (e) {
        console.error('提取文本失败:', e);
        return '';
    }
}

/**
 * 获取元素的HTML内容
 * @param {string} selector - CSS选择器
 * @returns {string} HTML内容或空字符串
 */
function getElementHTML(selector) {
    try {
        const el = document.querySelector(selector);
        return el ? el.innerHTML : '';
    } catch (e) {
        console.error('获取HTML内容失败:', e);
        return '';
    }
}

/**
 * 获取图片URL数组
 * @param {string} selector - 图片选择器
 * @returns {Array<string>} 图片URL数组
 */
function getImagesUrls(selector) {
    try {
        const imgs = document.querySelectorAll(selector);
        return Array.from(imgs)
            .map(img => img.src || img.getAttribute('data-src'))
            .filter(Boolean); // 过滤掉null/undefined/空字符串
    } catch (e) {
        console.error('获取图片URL失败:', e);
        return [];
    }
}

/**
 * 为评论生成稳定ID
 * @param {Element} commentEl - 评论DOM元素
 * @returns {string} 生成的ID
 */
function generateCommentId(commentEl) {
    try {
        // 首先尝试获取元素自带的ID或data属性
        const id = commentEl.id || 
                  commentEl.getAttribute('data-id') || 
                  commentEl.getAttribute('data-comment-id');
        
        if (id) return 'comment_' + id;
        
        // 回退到使用评论内容文本的哈希
        const text = commentEl.textContent || '';
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0; // 转为32位整数
        }
        return 'comment_' + Math.abs(hash).toString(16);
    } catch (e) {
        console.error('生成评论ID失败:', e);
        return 'comment_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
}
```

#### 3.3 结构化抓取模块 (content-script.js 扩展)

```
/**
 * 使用适配器提取结构化内容
 * @param {Object} adapter - 站点适配器
 * @returns {Object|null} - 结构化内容对象或null
 */
function extractStructuredData(adapter) {
    if (!adapter) return null;
    
    try {
        const { selectors } = adapter;
        const url = window.location.href;
        
        // 提取帖子容器元素
        const postContainer = document.querySelector(selectors.post.container);
        
        const result = {
            url,
            title: getTextContent(selectors.title),
            post: {
                author: getTextContent(selectors.post.author),
                publishTime: getTextContent(selectors.post.publishTime),
                content: getTextContent(selectors.post.content),
                contentHtml: getElementHTML(selectors.post.content),
                mediaUrls: adapter.extractors?.postMediaUrls ? 
                           adapter.extractors.postMediaUrls(postContainer) : 
                           getImagesUrls(selectors.post.images)
            },
            comments: [],
            meta: {
                site: adapter.name,
                capturedAt: Date.now(),
                language: document.documentElement.lang || 'unknown'
            }
        };
        
        // 提取评论
        const commentEls = document.querySelectorAll(selectors.comments.container);
        commentEls.forEach((el, index) => {
            result.comments.push({
                id: generateCommentId(el),
                order: index,
                author: extractText(el, selectors.comments.author),
                content: extractText(el, selectors.comments.content),
                time: extractText(el, selectors.comments.time),
                likes: extractText(el, selectors.comments.likes)
            });
        });
        
        return result;
    } catch (e) {
        console.error('结构化提取失败:', e);
        return null;
    }
}

/**
 * 从页面提取内容，使用适配器或回退到现有方法
 */
function extractPageContent() {
    try {
        // 获取URL和适配器
        const url = window.location.href;
        const adapter = window.getAdapterByUrl?.(url);
        
        // 1. 尝试使用适配器进行结构化提取
        if (adapter) {
            console.log('使用站点适配器:', adapter.name);
            const structuredData = extractStructuredData(adapter);
            
            if (structuredData) {
                // 发送结构化数据
                if (isExtensionContextValid()) {
                    chrome.runtime.sendMessage({
                        action: 'pageStructured',
                        data: structuredData,
                        timestamp: Date.now()
                    });
                    console.log('结构化数据已发送，包含评论数:', structuredData.comments.length);
                }
            }
        }
        
        // 2. 无论是否成功提取结构化数据，都执行现有的全文提取流程
        // 这确保了与现有AI摘要功能的兼容性
        extractPageText();
        
    } catch (e) {
        console.error('内容提取失败:', e);
        // 回退到现有方法
        extractPageText();
    }
}

// 修改现有的提取触发点
function attemptExtraction(maxAttempts = 3, delay = 2000) {
    let attempts = 0;
    
    function tryExtract() {
        attempts++;
        console.log(`尝试内容提取 #${attempts}`);
        
        // 替换为新的提取函数
        extractPageContent();
        
        if (attempts < maxAttempts) {
            setTimeout(tryExtract, delay);
        }
    }
    
    // 开始第一次尝试
    tryExtract();
}
```

#### 3.4 Background.js 消息处理扩展

```
// 结构化页面缓存 (仅内存中，MVT¹阶段不持久化)
const structuredPageCache = {};

// 在现有消息监听中添加结构化数据处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 处理结构化页面数据
    if (request.action === 'pageStructured') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            const structuredData = request.data;
            
            // 缓存结构化数据 (仅内存)
            structuredPageCache[tabId] = {
                url: structuredData.url,
                data: structuredData,
                timestamp: request.timestamp
            };
            
            console.log('已缓存结构化数据:', {
                url: structuredData.url,
                title: structuredData.title,
                commentsCount: structuredData.comments.length,
                site: structuredData.meta.site
            });
            
            // 注意：MVT¹阶段不写入storage，仅内存缓存用于验证
            // MVT²将实现IndexedDB持久化
            
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'No tab ID available' });
        }
        return true; // 保持消息通道打开
    }
    
    // 保持其他现有消息处理...
```

### 4. 文件变更列表

1. **新增文件**
   * `src/js/site-adapters.js` - 站点适配器定义
2. **修改文件**
   * `src/js/content-script.js`
     * **添加工具函数**
     * **添加 extractStructuredData 函数**
     * **添加 extractPageContent 函数**
     * **修改 attemptExtraction 调用 extractPageContent**
   * `chrome/background.js`
     * **添加 structuredPageCache 对象**
     * **扩展消息监听处理 'pageStructured'**
   * `manifest.json`
     * **更新 content_scripts 配置，添加 site-adapters.js**

### 5. manifest.json 更新

```
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": [
      "src/js/site-adapters.js",
      "src/js/content-script.js"
    ],
    "run_at": "document_idle"
  }
]
```

### 6. 实现流程

1. **构建适配器模块**
   * **创建 site-adapters.js**
   * **实现小红书适配器**
   * **实现知乎适配器**
   * **添加适配器获取函数**
2. **实现结构化抓取**
   * **在 content-script.js 中添加工具函数**
   * **添加结构化抓取函数**
   * **整合到现有抓取流程**
3. **修改 Background 处理**
   * **添加结构化数据缓存**
   * **扩展消息监听处理**
4. **测试与调试**
   * **在小红书和知乎页面测试**
   * **验证结构化数据提取**
   * **确认与现有功能兼容**

### 7. 消息流程说明

**在 MVT¹ 阶段，我们将同时发送两种消息：**

1. **pageStructured** - 新增的结构化数据消息
   * **包含完整的结构化对象（标题、帖子、评论）**
   * **仅在适配的站点上发送**
   * **在 background.js 中仅缓存在内存中，不持久化**
2. **pageContent** - 现有的全文提取消息
   * **保持不变，继续支持现有的 AI 摘要功能**
   * **在所有站点上发送**
   * **继续使用现有的 pageCache 机制**

**这种双轨并行的设计确保了新功能不会破坏现有功能，同时为后续 MVT 阶段做好准备。在 MVT³ 阶段，我们可能会考虑让 AI 摘要直接使用结构化数据中的 post.content，届时可能会调整这一流程。**

### 8. 验收标准

1. **基础功能验证**
   * **正确识别目标网站（小红书/知乎）**
   * **成功提取结构化数据（标题、作者、内容、评论）**
   * **在 background 控制台能看到日志和缓存数据**
2. **兼容性验证**
   * **与现有全文抓取功能并存不冲突**
   * **非目标站点时正确回退到通用抓取流程**
   * **不影响现有 AI 摘要功能**
3. **数据准确性**
   * **提取的结构与网页内容一致**
   * **评论内容完整、有序**
   * **多媒体内容URL正确**
4. **错误处理**
   * **适配器选择器失效时有合理的错误处理**
   * **不会因为结构化提取失败而影响全文提取**

### 9. 测试清单

1. **小红书测试**
   * **打开小红书帖子页面**
   * **检查 background 控制台是否打印 pageStructured 消息**
   * **验证结构化数据包含标题、作者、正文和评论**
2. **知乎测试**
   * **打开知乎问答或文章页面**
   * **检查 background 控制台是否打印 pageStructured 消息**
   * **验证结构化数据包含标题、作者、正文和评论**
3. **非适配站点测试**
   * **打开非适配站点（如 example.com）**
   * **确认只发送 pageContent 消息，不发送 pageStructured 消息**
   * **验证现有功能正常工作**
4. **多次提取测试**
   * **在同一页面触发多次 attemptExtraction**
   * **确认每次尝试都正确发送消息，无异常堆栈**
   * **验证 background 正确处理重复消息**

### 10. 后续规划

**MVT¹ 完成后，后续工作方向:**

1. **MVT² IndexedDB 持久化**
   * **设计数据模型，为结构化数据创建适当的存储方案**
   * **实现 IndexedDB 封装**
   * **添加侧边栏浏览功能**
2. **MVT³ 增量跟踪**
   * **利用 MVT¹ 中已实现的评论 ID 生成机制**
   * **实现增量更新和去重逻辑**
   * **添加 MutationObserver 监听新评论**
3. **MVT⁴ 通知机制**
   * **实现 Badge 和桌面通知**
   * **完善 URL 监听机制**

### 11. 注意事项与风险

1. **站点结构变化风险**
   * **小红书等网站可能频繁更新DOM结构**
   * **减缓方案: 适配器使用多重选择器，设计容错机制**
   * **考虑未来实现远程配置更新适配器**
2. **性能考量**
   * **结构化抓取不应显著增加页面处理时间**
   * **内存中缓存应有合理大小限制**
   * **确保工具函数有适当的错误处理**
3. **兼容性**
   * **保持与现有功能兼容，特别是全文提取和AI摘要流程**
   * **确保在非适配站点上正确回退到通用抓取**
4. **错误处理**
   * **所有关键函数都应有 try-catch 包装**
   * **日志应清晰指示错误来源**
   * **失败时应有合理的回退机制**

---

**开发估时**: 5-7个工作日**  **
**优先级**: 高 (基础功能)**  **
**负责人**: TBD
