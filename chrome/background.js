// Set panel behavior to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// custom settings
const defaultSettings = {
    ollamaUrl: 'http://192.168.5.99:11434/api/generate',
    ollamaModel: 'qwen2.5:7b',
    theme: 'light',
    language: 'en',
    defaultAI: 'ollama',
    useProxy: false,
    useStreaming: true,
    loadLastChat: true,
    systemPrompt: 'Act as an expert in [user topic]. Provide a detailed, clear, and helpful response to the following request: [user request or question]. Make sure your explanation is easy to understand and includes examples where relevant. You are a helpful assistant.',
    openaiApiKey: '',   
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-3.5-turbo',
    openaiCustomModel: '',
};

// 新增：页面内容缓存，最多保存10个标签页的内容
const MAX_PAGE_CACHE = 10;
let pageCache = {};

// current settings
let currentSettings = { ...defaultSettings };

// load settings
function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings', 'pageCache'], (result) => {
            if (result.settings) {
                // merge default settings and stored settings
                currentSettings = { ...defaultSettings, ...result.settings };
            }
            
            // 加载页面缓存
            if (result.pageCache) {
                pageCache = result.pageCache;
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

// 修改：使用OpenAI API生成摘要，支持标签页ID
async function summarizeWithOpenAI(tabId, url, title, content) {
    const apiKey = currentSettings.openaiApiKey;
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
        
        // 准备请求
        const baseUrl = currentSettings.openaiBaseUrl || 'https://api.openai.com/v1';
        const model = currentSettings.openaiCustomModel || currentSettings.openaiModel || 'gpt-3.5-turbo';
        
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
                        content: '你是一个专业的网页内容摘要助手。请为用户提供清晰、简洁、结构化的网页内容摘要。摘要应包含网页的主要观点、关键信息和结论。请使用markdown格式，以便于阅读。'
                    },
                    {
                        role: 'user',
                        content: `请为以下网页内容生成一个全面的摘要：\n\n标题：${title}\nURL：${url}\n\n内容：${truncatedContent}`
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
                                const json = JSON.parse(data);
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

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 处理页面内容消息
    if (request.action === 'pageContent') {
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
    // ...其他处理...
    return true; // 保持通道打开
});

// 新增：处理摘要请求的函数
async function processSummarizeRequest(tabId, sendResponse) {
    try {
        // 检查缓存中是否有页面内容
        if (!pageCache[tabId]) {
            // 尝试获取页面内容
            chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    sendResponse({ 
                        success: false, 
                        error: chrome.runtime.lastError ? 
                            chrome.runtime.lastError.message : 
                            'Failed to extract page content' 
                    });
                } else {
                    // 内容已保存到缓存，可以继续处理
                    sendResponse({ success: true });
                }
            });
            return;
        }
        
        // 获取缓存的页面内容
        const pageInfo = pageCache[tabId];
        
        // 确保有内容可以摘要
        if (!pageInfo || !pageInfo.content) {
            sendResponse({ success: false, error: 'No content available for summarization' });
            return;
        }
        
        // 发送成功响应，表示开始处理摘要
        sendResponse({ success: true });
        
        // 使用 OpenAI API 生成摘要
        const settings = await loadSettings();
        if (settings.defaultAI === 'openai' && settings.openaiApiKey) {
            await summarizeWithOpenAI(tabId, pageInfo.url, pageInfo.title, pageInfo.content);
        } else {
            // 其他 AI 服务的处理...或者报错
            chrome.runtime.sendMessage({
                action: 'summaryError',
                error: settings.defaultAI === 'openai' ? 
                    'OpenAI API key is not configured' : 
                    'Only OpenAI is supported for summarization'
            });
        }
    } catch (error) {
        console.error('Error processing summarize request:', error);
        // 错误已经在其他地方处理
    }
}

// ...其他代码...