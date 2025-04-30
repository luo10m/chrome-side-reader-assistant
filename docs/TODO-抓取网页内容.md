# 开发「抓取网页内容功能」文档

**本扩展现已支持「网页正文抓取 + 流式摘要」。下列文档概述整体架构、主要流程、关键 API 及注意事项，便于后续维护与二次开发。**

## 一、整体架构

**• Content Script（src/js/content-script.js）**
**‑ 负责在每个标签页注入，DOM Ready 后自动提取 **`document.body.innerText`，并向后台发送

```
{ action: 'pageContent', url, content }
```

**• Background（chrome/background.js）**
**‑ 维护 **`pageCache`（最多 10 条，键为 tabId）。**
**‑ 暴露两类消息：

1. **接收 **`pageContent` → 更新缓存
2. **接收 **`summarizePage` → 调用 OpenAI 流式接口，逐块把摘要通过

`{ action: 'summaryStream', messageId, done, content }`
**下发到侧栏。**
**‑ 摘要完成后，把「URL → 正文 → 摘要」三条消息顺序写入 **`chatHistory`
**（chrome.storage.local），供 AI 聊天历史复用。**

**• Side Panel UI（src/js/index.js）**
**‑ 新增 ****“开始摘要”** 按钮（id=`summarize-btn`）。**
**‑ 点击后向后台发送 `summarizePage`；接收并实时渲染 `summaryStream`。**
**‑ 完成或出错后恢复按钮可用状态。

## 二、消息协议

**content-script → background**
**• action: **`pageContent`
** payload: **`{ url, content }`

**side-panel → background**
**• action: **`summarizePage`

**background → side-panel**
**• action: **`summaryStream`
** payload: **`{ messageId, done, content }`

**background → side-panel（错误）**
**• action: **`summaryError`
** payload: **`{ error }`

## 三、关键存储结构

**chrome.storage.local**
**• pageCache:**

```
{
  [tabId]: { url, content, timestamp }
}
```

**• chatHistory: 与原有 AI 聊天保持相同格式**
**• settings: 用户设置（新增字段 **`defaultAI: 'openai'`）

**内存**
**• **`pageCache`：同上，始终与 storage 同步**
**• `currentSettings`：后台运行时的配置快照

## 四、主要函数

**content-script**
**• **`extractPageText()` – 抓取正文并发送

**background**
**• **`upsertPageCache(tabId, url, content)` – 写缓存，裁剪至 10 条**
**• `summarizeWithOpenAI(tabId, url, content)` – 调用 OpenAI 接口（支持流式）**
**• `cacheHistory(url, pageText, summaryText)` – 将三段消息写入 chatHistory

**side-panel**
**• **`initSummaryButton()` – 绑定按钮事件**
**• `chrome.runtime.onMessage` – 渲染流式摘要

## 五、UI 变更

**在 sidepanel HTML 中增加：**

```
<button id="summarize-btn" data-i18n="summarize_btn">开始摘要</button>
```

**CSS 可复用现有按钮样式，如需特殊样式自行追加。**

## 六、配置与运行

1. **在「设置」页填写 **`OpenAI API Key`，保证 `defaultAI` 为 `openai`。
2. **重新加载扩展；打开任意网页 → 打开侧栏 → 点击 ****开始摘要**。
3. **扩展最多缓存 10 个标签页正文；可在后台重载或关闭标签后自动回收。**
4. **若需切换至 Ollama，只需将 **`defaultAI` 及相关 URL/Model 改回并复用现有逻辑。

## 七、注意事项

**• 当前正文提取仅用 **`innerText`，复杂网页可替换为 Readability 等算法。**
**• OpenAI 流式返回遵循官方 SSE 协议，解析时务必忽略 `[DONE]`。**
**• Manifest V3 下后台为长驻脚本；若迁移至 Service Worker，需要配合 `alarms` 保活。**
**• 超长网页 for token 安全可在 `summarizeWithOpenAI()` 内部增加截断（如前 10 000 字符）。**
**• 现有队列大小 10 可在 `MAX_PAGE_CACHE` 调整；大于 10 自动按时间淘汰旧项。




# 参考设计


**核心改动包含 3 个文件：**

1. **src/js/content-script.js**
   **‑ 每次页面加载完成后抓取正文文本并发给后台**
2. **chrome/background.js**
   **‑ 维护最多 10 条的「网页内容缓存队列」**
   **‑ 新增 “pageContent / summarizePage / summaryStream / summaryError” 消息协议**
   **‑ 默认使用 OpenAI，支持流式摘要**
   **‑ 将网页内容 + 摘要作为对话历史缓存到 chrome.storage.local**
3. **src/js/index.js**
   **‑ 在侧栏新增“开始摘要”按钮监听**
   **‑ 实时接收并渲染后台推送的流式摘要结果**

**只需把下面代码片段直接替换/合并到对应文件即可运行。**

```
// -------------------------------------------------------------
// 已有的“复制代码”逻辑（原文件内容保持不变）
// -------------------------------------------------------------
document.addEventListener('click', (event) => {
    if (event.target.classList.contains('copy-button')) {
        const code = event.target.getAttribute('data-code');
        if (code) {
            const processedCode = code.replace(/\\n/g, '\n')
                                      .replace(/\\r/g, '\r')
                                      .replace(/\\t/g, '\t');
            navigator.clipboard.writeText(processedCode).then(() => {
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => { button.textContent = originalText; }, 2000);
            }).catch(err => console.error('Failed to copy: ', err));
        } else {
            const codeBlock = event.target.closest('.code-block');
            if (codeBlock) {
                const codeElement = codeBlock.querySelector('code');
                if (codeElement) {
                    const code = codeElement.textContent;
                    navigator.clipboard.writeText(code).then(() => {
                        const button = event.target;
                        const originalText = button.textContent;
                        button.textContent = 'Copied!';
                        setTimeout(() => { button.textContent = originalText; }, 2000);
                    }).catch(err => console.error('Failed to copy: ', err));
                }
            }
        }
    }
});


// =============================================================
// 新增：抓取当前页面正文并发送给后台（简易版，只用 innerText）
// =============================================================
function extractPageText() {
    try {
        const text = document.body ? document.body.innerText : '';
        chrome.runtime.sendMessage({
            action: 'pageContent',
            url: location.href,
            content: text
        });
    } catch (e) {
        console.error('Failed to extract page text', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', extractPageText, { once: true });
} else {
    extractPageText();
}
```

**content-script.js**

```
// ======================== 现有代码保留 ========================
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const defaultSettings = {
    ollamaUrl: 'http://192.168.5.99:11434/api/generate',
    ollamaModel: 'qwen2.5:7b',
    theme: 'light',
    language: 'en',
    defaultAI: 'openai',          // 设为 openai 作为默认
    useProxy: false,
    useStreaming: true,
    loadLastChat: true,
    systemPrompt: 'You are a helpful assistant.',
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-3.5-turbo',
    openaiCustomModel: '',
};

let currentSettings = { ...defaultSettings };

// -------------------------------------------------------------
// 新增：网页内容缓存（最多 10 条，按最近使用顺序）
// -------------------------------------------------------------
const MAX_PAGE_CACHE = 10;
let pageCache = {};   // { tabId: { url, content, timestamp } }

chrome.storage.local.get(['pageCache'], (res) => {
    if (res.pageCache) pageCache = res.pageCache;
});

function persistPageCache() {
    chrome.storage.local.set({ pageCache });
}

function upsertPageCache(tabId, url, content) {
    pageCache[tabId] = { url, content, timestamp: Date.now() };

    // 按时间倒序，只保留最新 10 条
    const sorted = Object.entries(pageCache)
        .sort((a, b) => b[1].timestamp - a[1].timestamp)
        .slice(0, MAX_PAGE_CACHE);
    pageCache = Object.fromEntries(sorted);
    persistPageCache();
}

// -------------------------------------------------------------
// 发送摘要请求（默认 OpenAI，可流式）
// -------------------------------------------------------------
async function summarizeWithOpenAI(tabId, url, content) {
    const apiKey = currentSettings.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API Key is not configured');

    const messageId = Date.now().toString();
    const model   = currentSettings.openaiCustomModel || currentSettings.openaiModel;
    const baseUrl = (currentSettings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const useStreaming = currentSettings.useStreaming !== false;

    const resp = await fetch(`${baseUrl}/chat/completions`, {
        method : 'POST',
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            stream: useStreaming,
            messages: [
                { role: 'system', content: 'You are a helpful assistant that summarises web pages.' },
                { role: 'user',   content: `Summarise the following web page.\nURL: ${url}\n\n${content}` }
            ]
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI error: ${resp.status} ${errText}`);
    }

    // 非流式
    if (!useStreaming) {
        const json = await resp.json();
        const summary = json.choices?.[0]?.message?.content || '';
        chrome.runtime.sendMessage({
            action: 'summaryStream',
            messageId,
            done: true,
            content: summary
        });
        cacheHistory(url, content, summary);
        return;
    }

    // 流式
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   full    = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            chrome.runtime.sendMessage({
                action: 'summaryStream',
                messageId,
                done: true,
                content: full
            });
            cacheHistory(url, content, full);
            break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.replace('data: ', '');
            if (payload === '[DONE]') continue;

            try {
                const data  = JSON.parse(payload);
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) {
                    full += delta;
                    chrome.runtime.sendMessage({
                        action: 'summaryStream',
                        messageId,
                        done: false,
                        content: delta
                    });
                }
            } catch (_) {/* ignore bad JSON */}
        }
    }
}

// -------------------------------------------------------------
// 把网页内容 + 摘要插入对话历史并缓存到 storage
// -------------------------------------------------------------
function cacheHistory(url, pageText, summaryText) {
    chrome.storage.local.get(['chatHistory'], (res) => {
        const history = res.chatHistory || [];
        history.push({ role: 'system',    content: `Webpage URL: ${url}` });
        history.push({ role: 'user',      content: pageText });
        history.push({ role: 'assistant', content: summaryText });
        chrome.storage.local.set({ chatHistory: history });
    });
}

// ====================== 主 Message 监听 =======================
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {

    // ---------- 1) Content-script 发送的网页正文 ----------
    if (req.action === 'pageContent') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId != null) {
            upsertPageCache(tabId, req.url, req.content);
        }
        return false;   // 同步返回
    }

    // ---------- 2) 侧栏请求开始摘要 ----------
    if (req.action === 'summarizePage') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (!tabId || !pageCache[tabId]) {
            sendResponse({ error: 'No cached content for this tab.' });
            return true;
        }

        const { url, content } = pageCache[tabId];
        summarizeWithOpenAI(tabId, url, content)
            .catch(err => {
                chrome.runtime.sendMessage({
                    action: 'summaryError',
                    error: err.message
                });
            });

        sendResponse({ started: true });
        return true;    // 表示异步响应
    }

    // 其余原有消息分支（ollama / settings / translation …）
    // ---- 原文件的其余 onMessage 逻辑保持不变 ----
    // ...
});
```

**background.js**

```
// ==================== 现有 import 与变量 ====================
import { loadAIChat } from './modules/ai-chat.js';
import { loadSettings } from './modules/settings.js';
import { loadTranslate } from './modules/translate.js';
import { getSettings } from './services/ollama-service.js';
import { addCopyListeners } from './utils/copy-utils.js';
import { initI18n, updateDomTexts } from './utils/i18n.js';

// ---------------- 新增 DOM 元素 ----------------
const summarizeBtn = document.getElementById('summarize-btn'); // 需要在 popup.html/sidepanel.html 中添加该按钮

// ==================== 其余初始化逻辑保持不变 ====================

// -------------------------------------------------------------
// 新增：点击“开始摘要” -> 请求后台
// -------------------------------------------------------------
function initSummaryButton() {
    if (!summarizeBtn) return;

    summarizeBtn.addEventListener('click', () => {
        summarizeBtn.disabled = true;

        chrome.runtime.sendMessage({ action: 'summarizePage' }, (resp) => {
            if (resp?.error) {
                alert(resp.error);
                summarizeBtn.disabled = false;
            }
        });
    });
}

// -------------------------------------------------------------
// 新增：接收后台流式摘要并渲染
// -------------------------------------------------------------
let summaryMessageId = null;
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'summaryStream') {
        const chatContainer = document.querySelector('#ai-chat-content .chat-messages');
        if (!chatContainer) return;

        // 创建/获取展示元素
        if (summaryMessageId !== msg.messageId) {
            summaryMessageId = msg.messageId;
            const div = document.createElement('div');
            div.className = 'assistant-msg';
            div.dataset.messageId = msg.messageId;
            chatContainer.appendChild(div);
        }
        const div = chatContainer.querySelector(`[data-message-id="${msg.messageId}"]`);
        if (div) div.textContent += msg.content;

        if (msg.done) {
            summarizeBtn.disabled = false;
        }
    } else if (msg.action === 'summaryError') {
        alert(`Summary error: ${msg.error}`);
        summarizeBtn.disabled = false;
    }
});

// -------------------------------------------------------------
// 在 UI 初始化流程里调用
// -------------------------------------------------------------
function initUI() {
    // ... 原本的 UI 初始化代码 ...
    addCopyListeners();

    // 初始化摘要按钮
    initSummaryButton();
}
```

**index.js**

**💡 说明与注意**

1. **HTML（或 sidepanel.html）里需增加一个按钮：**

```
<button id="summarize-btn" data-i18n="summarize_btn">开始摘要</button>
```

1. **由于把 **`defaultAI` 改为 `openai`，请在“设置”页面里填入 `openaiApiKey` 后再测试。
2. **当前实现每个标签页最多缓存一条正文；全局只保留最近 10 条。如果需要更复杂策略，修改 **`upsertPageCache` 即可。
3. **抓取正文仅用 **`document.body.innerText`，完全依赖大模型自行过滤噪声，从而“充分发挥大模型能力，少用算法”。
4. **侧栏只有在用户打开并点击「开始摘要」按钮时才会显示摘要内容。**
