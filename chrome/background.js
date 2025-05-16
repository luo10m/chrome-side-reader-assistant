// Import page-cache-listener.js
importScripts('../src/js/background/page-cache-listener.js');

// Set panel behavior to open on action click
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// 聊天历史存储相关函数
// 保存聊天历史
function saveChatHistory(tabId, messages) {
    chrome.storage.local.set({ ['pageMessages_' + tabId]: messages });
}

// 读取聊天历史
function loadChatHistory(tabId) {
    return new Promise(resolve => {
        chrome.storage.local.get(['pageMessages_' + tabId], result => {
            resolve(result['pageMessages_' + tabId] || []);
        });
    });
}

// 追加消息
async function appendMessage(tabId, msg) {
    let list = await loadChatHistory(tabId);
    list.push(msg);
    
    // 裁剪过长历史
    const MAX_MESSAGES_PER_TAB = 50;
    if (list.length > MAX_MESSAGES_PER_TAB) {
        const system = list.filter(m => m.role === 'system' || m.type === 'summary');
        const others = list.filter(m => m.role !== 'system' && m.type !== 'summary');
        list = [...system, ...others.slice(-MAX_MESSAGES_PER_TAB + system.length)];
    }
    
    saveChatHistory(tabId, list);
    return list;
}

// custom settings
const defaultSettings = {
    ollamaUrl: 'http://192.168.5.99:11434/api/generate',
    ollamaModel: 'qwen2.5:7b',
    theme: 'light',
    language: 'en',
    defaultAI: 'openai',
    useProxy: false,
    useStreaming: true,
    loadLastChat: true,
    systemPrompt: 'Act as an expert in [user topic]. Provide a detailed, clear, and helpful response to the following request: [user request or question]. Make sure your explanation is easy to understand and includes examples where relevant. You are a helpful assistant.',
    systemPrompts: [
        {
            id: 'default',
            name: 'Default Prompt',
            content: 'Act as an expert in [user topic]. Provide a detailed, clear, and helpful response to the following request: [user request or question]. Make sure your explanation is easy to understand and includes examples where relevant. You are a helpful assistant.',
            isDefault: true,
            isActive: true,
            icon: 'assistant'
        }
    ],
    activePromptId: 'default',
    openaiApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-3.5-turbo',
    openaiCustomModel: '',
};

// 新增：页面内容缓存，最多保存10个标签页的内容
const MAX_PAGE_CACHE = 10;
let pageCache = {};

// 新增：结构化页面内容缓存
let structuredPageCache = {};

// current settings
let currentSettings = { ...defaultSettings };

// load settings
function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings', 'pageCache', 'structuredPageCache'], (result) => {
            if (result.settings) {
                // merge default settings and stored settings
                currentSettings = { ...defaultSettings, ...result.settings };
            }

            // 加载页面缓存
            if (result.pageCache) {
                pageCache = result.pageCache;
            }
            
            // 加载结构化页面缓存
            if (result.structuredPageCache) {
                structuredPageCache = result.structuredPageCache;
            }

            resolve(currentSettings);
        });
    });
}

// save settings
function saveSettings(settings) {
    return new Promise((resolve) => {
        // ensure all required settings exist
        const newSettings = { ...currentSettings, ...settings };

        chrome.storage.local.set({ settings: newSettings }, () => {
            currentSettings = newSettings;
            resolve(currentSettings);
        });
    });
}

// 修改：更新页面缓存函数，增加对tabId的处理
function upsertPageCache(tabId, url, title, content) {
    // 确保tabId存在
    if (!tabId) return;

    // 更新缓存
    pageCache[tabId] = {
        url,
        title,
        content,
        timestamp: Date.now()
    };

    // 如果缓存超过最大限制，删除最旧的条目
    const tabIds = Object.keys(pageCache);
    if (tabIds.length > MAX_PAGE_CACHE) {
        // 按时间戳排序
        const sortedTabIds = tabIds.sort((a, b) =>
            pageCache[a].timestamp - pageCache[b].timestamp
        );

        // 删除最旧的条目
        delete pageCache[sortedTabIds[0]];
    }

    // 保存到storage
    chrome.storage.local.set({ pageCache });

    console.log(`Page cache updated for tab ${tabId}, total cache entries: ${Object.keys(pageCache).length}`);
}

// 新增：将网页内容和摘要保存到聊天历史
function cacheHistory(url, title, pageText, summaryText) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['chatHistory'], (result) => {
            let history = result.chatHistory || [];
            const chatId = Date.now().toString();

            // 添加URL消息
            history.push({
                id: chatId,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant.'
                    },
                    {
                        role: 'user',
                        content: `URL: ${url}\nTitle: ${title}`
                    },
                    {
                        role: 'assistant',
                        content: '我已收到您分享的网页链接。'
                    },
                    {
                        role: 'user',
                        content: '请为我摘要这个网页的内容。'
                    },
                    {
                        role: 'assistant',
                        content: summaryText
                    }
                ],
                timestamp: Date.now()
            });

            // 保存历史
            chrome.storage.local.set({ chatHistory: history }, () => {
                resolve();
            });
        });
    });
}

// 修改：使用OpenAI API生成摘要，支持标签页ID和传入的设置
async function summarizeWithOpenAI(tabId, url, title, content, settings) {
    // 如果没有传入设置，则从存储中获取
    if (!settings) {
        const result = await new Promise(resolve => {
            chrome.storage.local.get(['settings'], resolve);
        });
        settings = result.settings || defaultSettings;
    }

    const apiKey = settings.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API Key is not configured');

    const messageId = Date.now().toString();

    // 截断内容，防止token过多
    const MAX_CONTENT_LENGTH = 10000;
    const truncatedContent = content.length > MAX_CONTENT_LENGTH
        ? content.substring(0, MAX_CONTENT_LENGTH) + '...(content truncated)'
        : content;

    try {
        // 通知侧边栏开始摘要
        chrome.runtime.sendMessage({
            action: 'summaryStream',
            messageId,
            done: false,
            content: '正在生成摘要...'
        });

        // 使用批判性思维提示词作为系统消息
        const systemPrompt = `第一步，你是一位阅读教练，以《如何阅读一本书》的方法论为指导。请帮我分析以下文本内容：

1. 首先进行结构分析：找出文章的主要部分，确定作者的核心论点和支持论点。
2. 解释关键概念和术语，确保我理解作者使用的专业词汇。
3. 分析作者的推理过程：论证逻辑是否健全，证据是否充分。
4. 提供批判性思考视角：指出文章的优点和可能的不足之处。
5. 总结文章的核心价值和适用场景

记住，目标不是简单总结文章内容，而是帮助我更深入地理解和评价文章。


第二步，你是一位批判性思维教练，以《学会提问》的方法论为指导。请帮我分析以下文本内容：

1. 识别文本中的主要论点和结论。
2. 找出关键假设和隐含前提。
3. 评估论据的质量和相关性。
4. 指出潜在的逻辑谬误或推理错误。
5. 提供替代性解释或视角。
6. 评估文本中可能的偏见、利益冲突或情感诉求。

请以苏格拉底式的提问方式，引导我思考文本的真实性、准确性和完整性。

输出格式：

**内容总结**
{{列表形式输出总结}}
**批判性分析**
{{详尽又犀利的批判性分析}}
**深入思考**
{{苏格拉底的提问}}
`;

        // 准备请求
        const baseUrl = settings.openaiBaseUrl || 'https://api.openai.com/v1';
        const model = settings.openaiCustomModel || settings.openaiModel || 'gpt-3.5-turbo';

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: `请为以下网页内容生成一个全面的分析：\n\n标题：${title}\nURL：${url}\n\n内容：${truncatedContent}`
                    }
                ],
                stream: true
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
        }

        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                // 发送完成消息
                chrome.runtime.sendMessage({
                    action: 'summaryStream',
                    messageId,
                    done: true,
                    content: fullResponse
                });

                break;
            }

            // 解码数据块
            const chunk = decoder.decode(value, { stream: true });

            if (chunk) {
                try {
                    // 处理 SSE 格式的数据块
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            // 检查是否为 [DONE] 标记
                            if (data === '[DONE]') continue;

                            // 解析 JSON 数据
                            try {
                                // Attempt to sanitize the JSON data before parsing
                                const sanitizedData = data.trim();
                                const json = JSON.parse(sanitizedData);
                                const content = json.choices?.[0]?.delta?.content || '';

                                if (content) {
                                    fullResponse += content;

                                    // 发送更新消息
                                    chrome.runtime.sendMessage({
                                        action: 'summaryStream',
                                        messageId,
                                        done: false,
                                        content: content
                                    });
                                }
                            } catch (e) {
                                console.error('Failed to parse JSON from stream:', e);
                                console.debug('Problematic JSON data:', data);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error processing chunk:', e);
                }
            }
        }

        // 摘要完成后，保存到页面缓存
        pageCache[tabId] = {
            ...pageCache[tabId],
            summary: fullResponse,
            summaryTime: Date.now()
        };
        chrome.storage.local.set({ pageCache });

        return fullResponse;
    } catch (error) {
        console.error('Summarization error:', error);

        // 发送错误消息
        chrome.runtime.sendMessage({
            action: 'summaryError',
            error: error.message
        });

        throw error;
    }
}

// initialize settings
loadSettings();

// listen for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    console.log(`Command received: ${command}`);
    if (command === "_execute_action") {
        // try to open side panel without checking if it's already open
        chrome.sidePanel.open().catch((error) => {
            console.error("Error opening side panel:", error);
        });
    }
});

// 在background.js中添加监听器，当storage变化时更新currentSettings
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.settings) {
        currentSettings = changes.settings.newValue;
        console.log('Settings updated in background:', currentSettings);
    }
});


// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 处理聊天历史相关请求
    if (request.action === 'getChatHistory') {
        loadChatHistory(request.tabId).then(list => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'appendChatMessage') {
        appendMessage(request.tabId, request.message).then(list => sendResponse({ success: true, list }));
        return true;
    }
    else if (request.action === 'getPageContext') {
        const tabId = request.tabId;
        if (!tabId) {
            sendResponse({ success: false, error: 'No tabId provided' });
            return true;
        }
        
        chrome.storage.local.get(['pageCache'], (result) => {
            const pageCache = result.pageCache || {};
            const tabInfo = pageCache[tabId];
            
            if (!tabInfo) {
                sendResponse({ success: false, error: 'No page cache found for this tab' });
                return;
            }
            
            sendResponse({
                success: true,
                title: tabInfo.title || '',
                url: tabInfo.url || '',
                content: tabInfo.content || '',
                summary: tabInfo.summary || ''
            });
        });
        return true;
    }
    // 处理结构化页面内容消息
    else if (request.action === 'pageStructured') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            console.log('收到结构化页面内容:', request.url, request.structuredData);
            
            // 更新结构化页面缓存
            structuredPageCache[tabId] = {
                url: request.url,
                structuredData: request.structuredData,
                timestamp: request.timestamp || Date.now()
            };
            
            // 保存到storage
            chrome.storage.local.set({ structuredPageCache });
            
            // 发送响应
            if (sendResponse) {
                sendResponse({ success: true });
            }
        }
    }
    // 处理页面内容消息
    else if (request.action === 'pageContent') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            // 确保有页面内容
            if (request.content) {
                // 更新缓存
                upsertPageCache(tabId, request.url, request.title, request.content);
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'No content provided' });
            }
        } else {
            sendResponse({ success: false, error: 'No tab ID available' });
        }
        return true; // 保持消息通道打开
    }
    // 处理页面导航变化消息
    else if (request.action === 'pageNavigated') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId) {
            console.log(`Page navigated in tab ${tabId} from ${request.previousUrl} to ${request.newUrl}`);

            // 转发消息给侧边栏
            chrome.runtime.sendMessage({
                action: 'pageNavigated',
                tabId: tabId,
                previousUrl: request.previousUrl,
                newUrl: request.newUrl,
                newTitle: request.newTitle,
                timestamp: request.timestamp
            });

            // 发送成功响应
            sendResponse({ success: true });
        }
    }
    // 处理摘要请求
    else if (request.action === 'summarizePage') {
        // 使用请求中的tabId或尝试获取当前活动标签页
        let targetTabId = request.tabId;

        // 如果没有提供特定的tabId，则尝试获取当前标签页
        if (!targetTabId) {
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
                if (tabs.length === 0) {
                    sendResponse({ success: false, error: 'No active tab found' });
                    return;
                }

                const currentTab = tabs[0];
                targetTabId = currentTab.id;

                // 处理摘要请求
                await processSummarizeRequest(targetTabId, sendResponse);
            });
        } else {
            // 使用提供的tabId处理摘要请求
            processSummarizeRequest(targetTabId, sendResponse);
        }

        return true; // 保持消息通道打开
    }
    // 处理获取设置请求
    else if (request.action === 'getSettings') {
        // 加载并返回最新设置
        loadSettings().then(settings => {
            sendResponse(settings);
        });
        return true;
    }
    // 处理更新设置请求
    else if (request.action === 'updateSettings') {
        // 检查是否是重置设置请求
        if (request.settings && request.settings.reset === true) {
            // 重置为默认设置
            currentSettings = { ...defaultSettings };
            chrome.storage.local.set({ settings: currentSettings }, () => {
                sendResponse(currentSettings);
            });
        } else {
            // 正常更新设置
            saveSettings(request.settings)
                .then(() => {
                    sendResponse(currentSettings);
                })
                .catch(error => {
                    sendResponse({ error: error.message });
                });
        }

        // 返回 true 表示响应将异步发送
        return true;
    }
    // 处理打开设置页面请求
    else if (request.action === 'openSettings') {
        // 打开选项页面
        chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
        return true;
    }
    // 处理发送消息到Ollama
    else if (request.action === 'sendMessageToOllama') {
        // 创建一个唯一的消息ID
        const messageId = Date.now().toString();

        // 发送初始响应
        sendResponse({ messageId });

        // 处理请求
        sendMessageToOllama(request.message, request.history, request.systemPrompt)
            .then(async (response) => {
                if (response.streaming) {
                    // 处理流式响应
                    const { reader, decoder } = response;
                    let fullResponse = '';

                    try {
                        while (true) {
                            const { done, value } = await reader.read();

                            if (done) {
                                // 流结束，发送完整响应
                                chrome.runtime.sendMessage({
                                    action: 'ollamaResponse',
                                    messageId,
                                    done: true,
                                    content: fullResponse
                                });
                                break;
                            }

                            // 解码数据块
                            const chunk = decoder.decode(value, { stream: true });

                            // 处理数据块
                            try {
                                const lines = chunk.split('\n').filter(line => line.trim());

                                for (const line of lines) {
                                    try {
                                        // Sanitize the line before parsing
                                        const sanitizedLine = line.trim();
                                        // Skip empty lines
                                        if (!sanitizedLine) continue;

                                        const data = JSON.parse(sanitizedLine);

                                        if (data.response) {
                                            fullResponse += data.response;

                                            // 发送增量更新
                                            chrome.runtime.sendMessage({
                                                action: 'ollamaResponse',
                                                messageId,
                                                done: false,
                                                content: data.response
                                            });
                                        }
                                    } catch (e) {
                                        console.debug('Error parsing JSON line:', e);
                                        console.debug('Problematic JSON line:', line);
                                    }
                                }
                            } catch (e) {
                                console.error('Error processing chunk:', e);
                            }
                        }
                    } catch (error) {
                        console.error('Error reading stream:', error);
                        chrome.runtime.sendMessage({
                            action: 'ollamaError',
                            messageId,
                            error: error.message
                        });
                    }
                } else {
                    // 非流式响应，直接发送
                    chrome.runtime.sendMessage({
                        action: 'ollamaResponse',
                        messageId,
                        done: true,
                        content: response.fullResponse
                    });
                }
            })
            .catch(error => {
                console.error('Error sending message to Ollama:', error);
                chrome.runtime.sendMessage({
                    action: 'ollamaError',
                    messageId,
                    error: error.message
                });
            });

        return true;
    }
    // 处理其他类型的请求
    // ...其他处理...
    return true; // 保持通道打开
});

// 修改：处理摘要请求的函数
async function processSummarizeRequest(tabId, sendResponse) {
    try {
        // 检查缓存中是否有页面内容
        if (!pageCache[tabId]) {
            console.log(`Tab ${tabId} 没有缓存内容，尝试提取页面内容`);

            // 发送初始成功响应，表示我们正在处理请求
            // 这样用户界面可以立即显示加载状态
            sendResponse({ success: true });

            // 尝试获取页面内容
            chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' }, async (response) => {
                // 如果提取失败，通知前端出错
                if (chrome.runtime.lastError || !response || !response.success) {
                    const error = chrome.runtime.lastError ?
                        chrome.runtime.lastError.message :
                        'Failed to extract page content';

                    console.error(`内容提取失败: ${error}`);
                    chrome.runtime.sendMessage({
                        action: 'summaryError',
                        error: `无法提取页面内容: ${error}`
                    });
                } else {
                    console.log('页面内容提取成功，等待缓存更新');

                    // 等待一小段时间，让缓存更新
                    setTimeout(async () => {
                        // 再次检查缓存
                        if (pageCache[tabId] && pageCache[tabId].content) {
                            // 缓存已更新，继续处理摘要
                            await processSummaryWithSettings(tabId);
                        } else {
                            console.error('提取后仍未找到缓存内容');
                            chrome.runtime.sendMessage({
                                action: 'summaryError',
                                error: '提取内容后未能正确缓存'
                            });
                        }
                    }, 1000); // 给内容提取和缓存一些时间
                }
            });
            return;
        }

        // 获取缓存的页面内容
        const pageInfo = pageCache[tabId];

        // 确保有内容可以摘要
        if (!pageInfo || !pageInfo.content) {
            console.error(`Tab ${tabId} 缓存存在但内容为空`);
            sendResponse({ success: false, error: 'No content available for summarization' });
            return;
        }

        // 发送成功响应，表示开始处理摘要
        sendResponse({ success: true });

        // 处理摘要
        await processSummaryWithSettings(tabId);
    } catch (error) {
        console.error('Error processing summarize request:', error);
        chrome.runtime.sendMessage({
            action: 'summaryError',
            error: error.message || 'Unknown error during summarization'
        });
    }
}

// 新增：使用设置处理摘要的函数
async function processSummaryWithSettings(tabId) {
    try {
        // 获取缓存的页面内容
        const pageInfo = pageCache[tabId];
        if (!pageInfo || !pageInfo.content) {
            throw new Error('No content available for summarization');
        }

        // 从存储中直接获取最新设置
        const result = await new Promise(resolve => {
            chrome.storage.local.get(['settings'], resolve);
        });

        const settings = result.settings || defaultSettings;
        console.log("当前AI设置(直接从存储获取):", {
            defaultAI: settings.defaultAI,
            hasApiKey: !!settings.openaiApiKey,
            openaiModel: settings.openaiModel
        });

        // 检查OpenAI设置
        if (settings.defaultAI === 'openai') {
            if (!settings.openaiApiKey) {
                // 无API密钥时的错误处理
                chrome.runtime.sendMessage({
                    action: 'summaryError',
                    error: 'OpenAI API key is not configured'
                });
                return;
            }

            try {
                // 使用OpenAI生成摘要，传入最新的设置
                await summarizeWithOpenAI(tabId, pageInfo.url, pageInfo.title, pageInfo.content, settings);
            } catch (error) {
                console.error('Error summarizing with OpenAI:', error);
                chrome.runtime.sendMessage({
                    action: 'summaryError',
                    error: error.message || 'Error generating summary with OpenAI'
                });
            }
        } else {
            // 其他AI服务暂不支持
            chrome.runtime.sendMessage({
                action: 'summaryError',
                error: 'Only OpenAI is supported for summarization'
            });
        }
    } catch (error) {
        console.error('Error in processSummaryWithSettings:', error);
        chrome.runtime.sendMessage({
            action: 'summaryError',
            error: error.message || 'Unknown error during summarization'
        });
    }
}

// 新增：验证OpenAI设置是否有效
function validateOpenAISettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings'], (result) => {
            const settings = result.settings || {};
            const isValid = settings.openaiApiKey &&
                settings.defaultAI === 'openai';

            console.log("OpenAI设置验证:", {
                isValid,
                defaultAI: settings.defaultAI,
                hasApiKey: !!settings.openaiApiKey
            });

            resolve(isValid);
        });
    });
}

// 恢复: Send message to Ollama with streaming support
async function sendMessageToOllama(message, history, systemPrompt) {
    try {
        // Use settings for Ollama URL and model
        let ollamaUrl = currentSettings.ollamaUrl;
        const ollamaModel = currentSettings.ollamaModel;
        const useProxy = currentSettings.useProxy;
        const useStreaming = currentSettings.useStreaming !== false; // 默认启用

        // if proxy is enabled, use a CORS proxy
        if (useProxy) {
            ollamaUrl = `https://cors-anywhere.herokuapp.com/${ollamaUrl}`;
        }

        console.log(`Sending request to ${ollamaUrl} with model ${ollamaModel}`);

        // build the prompt text, including history messages and system prompt
        let prompt = "";

        // add the system prompt (if any)
        if (systemPrompt) {
            prompt += `System: ${systemPrompt}\n`;
        }

        // add the history messages (if any)
        if (history && history.length > 0) {
            for (const msg of history) {
                if (msg.role === 'user') {
                    prompt += `User: ${msg.content}\n`;
                } else if (msg.role === 'assistant') {
                    prompt += `Assistant: ${msg.content}\n`;
                }
            }
        }

        // add the current message
        prompt += `User: ${message}\nAssistant:`;

        console.log("Formatted prompt:", prompt);

        // use fetch API to send the request
        const response = await fetch(ollamaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: prompt,
                stream: useStreaming,
                options: {
                    num_ctx: 2048,  // set the context window size
                    include_context: false  // don't include context data, to reduce response size
                }
            })
        });

        if (!response.ok) {
            console.error(`Ollama API error: ${response.status}`);
            const errorText = await response.text();
            console.error(`Error details: ${errorText}`);
            throw new Error(`Ollama API error: ${response.status}`);
        }

        // if not streaming, return the full response
        if (!useStreaming) {
            const data = await response.json();
            console.log("Ollama response:", data);

            return {
                streaming: false,
                reader: null,
                decoder: null,
                fullResponse: data.response || "No response from Ollama",
                model: data.model || ollamaModel
            };
        }

        // read the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        // return the objects needed for streaming response
        return {
            streaming: true,
            reader,
            decoder,
            fullResponse,
            model: ollamaModel
        };
    } catch (error) {
        console.error('Error sending message to Ollama:', error);
        throw error;
    }
}