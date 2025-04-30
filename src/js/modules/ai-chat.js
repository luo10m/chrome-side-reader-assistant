// Import the API service and markdown renderer
import { sendMessageToOllama, getSettings } from '../services/ollama-service.js';
import { sendMessageToOpenAI, parseOpenAIStreamingResponse } from '../services/openai-service.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';
import { t } from '../utils/i18n.js';

// Load AI Chat
export function loadAIChat(container) {
    // Chat history
    let chatHistory = [];
    
    // Current chat ID
    let currentChatId = null;
    
    // 添加当前标签页跟踪
    let currentTabId = null;
    
    // 在文件顶部添加变量
    let isGenerating = false; // 标记 AI 是否正在生成回复
    let isSummarizing = false; // 标记是否正在生成摘要
    let currentSummaryMessageId = null; // 当前摘要消息的ID
    let summaryContentElement = null; // 摘要内容元素
    let streamingMessageElement = null; // 用于流式响应的消息元素
    
    // Create chat UI with redesigned layout
    container.innerHTML = `
        <div class="chat-container">
            <div class="chat-header">
                <h2 data-i18n="chat.header">AI Chat</h2>
                <div class="chat-header-actions">
                    <button id="summarize-btn" class="primary-button" data-i18n="chat.summarize">开始摘要</button>
                </div>
            </div>
            <div id="page-info" class="page-info-container" style="display: none;">
                <div class="page-info-content">
                    <div id="page-title" class="page-title"></div>
                    <div id="page-url" class="page-url"></div>
                </div>
                <button id="refresh-page-content" class="secondary-button" data-i18n="chat.refreshContent">刷新内容</button>
            </div>
            <div class="chat-messages" id="chat-messages">
                <!-- Welcome message will be added here -->
            </div>
            <div class="chat-input-wrapper">
                    <div class="chat-actions">
                        <button id="new-chat-button" class="action-button" data-i18n-title="chat.newChat" title="New Chat">
                            <img src="assets/svg/new-chat.svg" alt="New Chat" class="button-icon">
                        </button>
                        <button id="history-button" class="action-button" data-i18n-title="chat.history" title="Chat History">
                            <img src="assets/svg/history.svg" alt="History" class="button-icon">
                        </button>
                    </div>
                <div class="chat-input-container">
                    <textarea id="chat-input" data-i18n-placeholder="chat.placeholder" placeholder="Type your message..." rows="1"></textarea>
                    <div class="chat-actions">
                        <button id="send-button" data-i18n-title="chat.send" title="Send">
                            <img src="assets/svg/send.svg" alt="Send" class="button-icon">
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- 历史记录弹出窗口 -->
        <div id="history-popup" class="history-popup">
            <div class="history-popup-header">
                <h3 data-i18n="chat.historyTitle">Chat History</h3>
                <button id="close-history" class="icon-button">
                    <span>×</span>
                </button>
            </div>
            <div class="history-popup-content">
                <div id="history-list" class="history-list">
                    <!-- 历史记录将在这里显示 -->
                </div>
            </div>
        </div>
    `;
    
    // Get DOM elements
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const newChatButton = document.getElementById('new-chat-button');
    const historyButton = document.getElementById('history-button');
    const historyPopup = document.getElementById('history-popup');
    const closeHistoryButton = document.getElementById('close-history');
    const historyList = document.getElementById('history-list');
    
    // 新增：摘要相关元素
    const summarizeButton = document.getElementById('summarize-btn');
    const pageInfoContainer = document.getElementById('page-info');
    const pageTitleElement = document.getElementById('page-title');
    const pageUrlElement = document.getElementById('page-url');
    const refreshPageContentButton = document.getElementById('refresh-page-content');
    
    // 新增：初始化摘要按钮
    function initSummaryButton() {
        // 查询当前活动标签页，获取页面信息
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const currentTab = tabs[0];
                const tabId = currentTab.id;
                
                // 显示当前页面信息
                updatePageInfo(currentTab.title, currentTab.url);
                
                // 检查是否有页面缓存
                chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
                    chrome.storage.local.get(['pageCache'], (result) => {
                        const pageCache = result.pageCache || {};
                        const tabInfo = pageCache[tabId];
                        
                        if (tabInfo && tabInfo.url === currentTab.url) {
                            // 有缓存且URL匹配，启用摘要按钮
                            summarizeButton.disabled = false;
                            pageInfoContainer.style.display = 'flex';
                            pageTitleElement.textContent = tabInfo.title || '未知标题';
                            pageUrlElement.textContent = tabInfo.url;
                        } else {
                            // 无缓存或URL不匹配，禁用摘要按钮
                            summarizeButton.disabled = true;
                            pageInfoContainer.style.display = 'none';
                        }
                    });
                });
            } else {
                // 没有活动标签页，禁用摘要按钮
                summarizeButton.disabled = true;
                pageInfoContainer.style.display = 'none';
            }
        });
    }
    
    // 新增：更新页面信息显示
    function updatePageInfo(title, url) {
        if (title && url) {
            pageInfoContainer.style.display = 'flex';
            pageTitleElement.textContent = title;
            pageUrlElement.textContent = url;
        } else {
            pageInfoContainer.style.display = 'none';
        }
    }
    
    // 新增：刷新页面内容
    function refreshPageContent() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const tabId = tabs[0].id;
                
                // 向内容脚本发送消息，请求重新抓取内容
                chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending message to content script:', chrome.runtime.lastError);
                        // 尝试重新注入内容脚本
                        chrome.tabs.executeScript(tabId, { file: 'src/js/content-script.js' }, () => {
                            if (chrome.runtime.lastError) {
                                console.error('Failed to inject content script:', chrome.runtime.lastError);
                            } else {
                                // 脚本注入成功后，再次尝试发送消息
                                setTimeout(() => {
                                    chrome.tabs.sendMessage(tabId, { action: 'extractPageContent' });
                                }, 500);
                            }
                        });
                    } else if (response && response.success) {
                        // 内容已刷新，更新UI
                        updatePageInfo(tabs[0].title, tabs[0].url);
                        summarizeButton.disabled = false;
                    }
                });
            }
        });
    }
    
    // 新增：开始摘要 - 更新以支持页面级别独立聊天
    function startSummarize() {
        if (isSummarizing || !currentTabId) return;
        
        // 设置状态
        isSummarizing = true;
        summarizeButton.disabled = true;
        summarizeButton.textContent = t('chat.summarizing', '正在摘要...');
        
        // 删除欢迎消息（如果存在）
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        // 创建摘要消息元素
        const messageElement = document.createElement('div');
        messageElement.className = 'message assistant summary-message';
        
        // 创建标题元素，显示当前页面信息
        const titleElement = document.createElement('div');
        titleElement.className = 'summary-title';
        titleElement.textContent = `摘要: ${pageTitleElement.textContent}`;
        messageElement.appendChild(titleElement);
        
        // 创建内容元素
        summaryContentElement = document.createElement('div');
        summaryContentElement.className = 'message-content';
        summaryContentElement.innerHTML = '<div class="loading-indicator">正在生成摘要...</div>';
        messageElement.appendChild(summaryContentElement);
        
        // 添加到消息列表
        chatMessages.appendChild(messageElement);
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 发送摘要请求，包含当前标签页ID
        chrome.runtime.sendMessage({ 
            action: 'summarizePage',
            tabId: currentTabId 
        }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                const error = chrome.runtime.lastError ? 
                    chrome.runtime.lastError.message : 
                    (response && response.error ? response.error : '未知错误');
                
                // 显示错误
                summaryContentElement.innerHTML = `<div class="error-message">摘要生成失败: ${error}</div>`;
                
                // 重置状态
                isSummarizing = false;
                summarizeButton.disabled = false;
                summarizeButton.textContent = t('chat.summarize', '开始摘要');
            }
        });
    }
    
    // 修改：处理摘要流，支持页面级别独立聊天
    let fullSummaryContent = ''; // 累积完整的摘要内容
    
    function handleSummaryStream(data) {
        if (!summaryContentElement) return;
        
        if (currentSummaryMessageId === null) {
            currentSummaryMessageId = data.messageId;
            summaryContentElement.innerHTML = ''; // 清除加载指示器
            fullSummaryContent = ''; // 重置累积内容
        }
        
        if (data.messageId !== currentSummaryMessageId) return;
        
        if (data.done) {
            // 摘要完成
            isSummarizing = false;
            summarizeButton.disabled = false;
            summarizeButton.textContent = t('chat.summarize', '开始摘要');
            currentSummaryMessageId = null;
            
            // 添加操作按钮
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                </button>
            `;
            summaryContentElement.parentElement.appendChild(actionsElement);
            
            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(summaryContentElement.textContent);
            });
            
            // 添加摘要消息到聊天历史
            if (currentTabId) {
                // 读取现有消息
                chrome.storage.local.get(['pageMessages_' + currentTabId], (result) => {
                    let messages = result['pageMessages_' + currentTabId] || [];
                    
                    // 查找现有摘要消息
                    const summaryIndex = messages.findIndex(m => m.role === 'assistant' && m.type === 'summary');
                    
                    if (summaryIndex >= 0) {
                        // 更新现有摘要
                        messages[summaryIndex].content = fullSummaryContent;
                    } else {
                        // 添加新摘要（在系统消息之后，如果有的话）
                        const systemIndex = messages.findIndex(m => m.role === 'system');
                        
                        // 创建摘要消息对象
                        const summaryMessage = { 
                            role: 'assistant', 
                            content: fullSummaryContent, 
                            type: 'summary' 
                        };
                        
                        if (systemIndex >= 0) {
                            // 插入系统消息之后
                            messages.splice(systemIndex + 1, 0, summaryMessage);
                        } else if (messages.length > 0) {
                            // 插入到开头
                            messages.unshift(summaryMessage);
                        } else {
                            // 空消息列表，添加系统消息和摘要
                            messages = [
                                { role: 'system', content: 'You are a helpful assistant.' },
                                summaryMessage
                            ];
                        }
                    }
                    
                    // 保存更新后的消息列表
                    chrome.storage.local.set({
                        ['pageMessages_' + currentTabId]: messages
                    }, () => {
                        console.log('摘要已保存到标签页:', currentTabId);
                    });
                });
            }
        } else {
            // 累积内容，然后一次性渲染
            fullSummaryContent += data.content;
            
            // 直接渲染完整内容
            summaryContentElement.innerHTML = renderMarkdown(fullSummaryContent);
            
            // 高亮代码块
            if (typeof hljs !== 'undefined') {
                try {
                    summaryContentElement.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                } catch (e) {
                    console.debug('Error during code highlighting:', e);
                }
            }
            
            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }
    
    // 处理摘要错误
    function handleSummaryError(data) {
        if (!summaryContentElement) return;
        
        // 显示错误
        summaryContentElement.innerHTML = `<div class="error-message">摘要生成失败: ${data.error}</div>`;
        
        // 重置状态
        isSummarizing = false;
        summarizeButton.disabled = false;
        summarizeButton.textContent = t('chat.summarize', '开始摘要');
        currentSummaryMessageId = null;
    }
    
    // 新增：复制到剪贴板函数
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            // 可以添加一个提示，表示复制成功
            console.log('Text copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }
    
    // 新增：自动调整文本区域高度
    function adjustTextareaHeight() {
        if (!chatInput) return;
        
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        
        // 添加输入事件监听器，实时调整高度
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
        });
    }
    
    // 新增：添加消息到UI
    function addMessageToUI(role, content, type = null) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
        // 如果是摘要类型消息，添加额外的类名
        if (type === 'summary') {
            messageElement.classList.add('summary-message');
            
            // 添加摘要标题
            const titleElement = document.createElement('div');
            titleElement.className = 'summary-title';
            
            // 尝试获取当前页面标题，如果没有就使用通用标题
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    titleElement.textContent = `摘要: ${tabs[0].title}`;
                } else {
                    titleElement.textContent = `页面摘要`;
                }
            });
            
            messageElement.appendChild(titleElement);
        }
        
        // 为助手消息添加模型标识
        if (role === 'assistant') {
            // 获取当前使用的模型
            getSettings().then(settings => {
                const modelName = settings.defaultAI === 'openai' 
                    ? (settings.openaiModel || 'gpt-3.5-turbo')
                    : (settings.ollamaModel || 'llama2');
                
                // 设置模型属性用于CSS显示
                messageElement.setAttribute('data-model', modelName);
                
                // 添加模型图标和名称
                const modelIndicator = document.createElement('div');
                modelIndicator.className = 'model-indicator';
                modelIndicator.innerHTML = `
                    <span class="model-icon">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    ${modelName}
                `;
                messageElement.insertBefore(modelIndicator, messageElement.firstChild);
            });
        }
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // 对于用户消息，使用textContent而不是innerHTML
        if (role === 'user') {
            contentElement.textContent = content; // 使用textContent确保HTML标签被显示为文本
        } else {
            // 对于助手消息，继续使用Markdown渲染
            contentElement.innerHTML = renderMarkdown(content);
            
            // 手动初始化代码高亮，使用 try-catch 捕获可能的错误
            if (typeof hljs !== 'undefined') {
                try {
                    contentElement.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                } catch (e) {
                    console.debug('Error during code highlighting:', e);
                }
            }
        }
        
        messageElement.appendChild(contentElement);
        
        // 为助手消息添加操作按钮
        if (role === 'assistant') {
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-button action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                    ${t('chat.copy')}
                </button>
            `;
            messageElement.appendChild(actionsElement);
            
            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(contentElement.textContent);
            });
        }
        
        chatMessages.appendChild(messageElement);
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return contentElement;
    }
    
    // 新增：发送消息函数
    async function sendMessage() {
        const message = chatInput.value.trim();
        
        if (!message) return;
        
        // 如果 AI 正在生成回复，不允许发送新消息
        if (isGenerating) {
            console.log('AI is still generating a response, please wait');
            return;
        }
        
        // 删除欢迎消息（如果存在）
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        // 清空输入框
        chatInput.value = '';
        
        // 重置输入框高度
        chatInput.style.height = 'auto';
        
        // 添加用户消息到UI
        addMessageToUI('user', message);
        
        // 添加用户消息到聊天历史
        chatHistory.push({
            role: 'user',
            content: message,
            timestamp: Date.now()
        });
        
        // 保存更新后的消息历史
        saveChatHistory(chatHistory);
        
        // 创建助手消息元素
        const assistantMessageElement = document.createElement('div');
        assistantMessageElement.className = 'message assistant';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // 添加加载指示器
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<div></div><div></div><div></div>';
        
        contentElement.appendChild(loadingIndicator);
        assistantMessageElement.appendChild(contentElement);
        
        chatMessages.appendChild(assistantMessageElement);
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 设置流式消息元素
        streamingMessageElement = contentElement;
        
        // 设置生成状态
        isGenerating = true;
        
        try {
            // 获取设置
            const settings = await getSettings();
            
            // 准备发送给API的聊天历史 - 只保留必要字段，移除自定义属性
            const apiChatHistory = chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            
            console.log('准备发送给API的消息历史:', apiChatHistory);
            
            // 根据默认AI提供商选择API
            if (settings.defaultAI === 'openai') {
                // 使用OpenAI API，传递过滤后的历史记录
                const response = await sendMessageToOpenAI(message, apiChatHistory, settings.systemPrompt);
                
                // 移除加载指示器
                loadingIndicator.remove();
                
                // 处理流式响应
                if (response.streaming) {
                    // 初始化响应内容
                    let fullText = '';
                    
                    // 读取流
                    const reader = response.reader;
                    const decoder = response.decoder;
                    
                    // 处理流式响应
                    let done = false;
                    while (!done) {
                        const { value, done: readerDone } = await reader.read();
                        done = readerDone;
                        
                        if (done) break;
                        
                        // 解码数据块
                        const chunk = decoder.decode(value, { stream: true });
                        
                        // 处理数据块
                        const lines = chunk.split('\n');
                        for (const line of lines) {
                            if (line.trim() === '') continue;
                            
                            // 解析OpenAI流式响应
                            const content = parseOpenAIStreamingResponse(line);
                            if (content) {
                                fullText += content;
                                
                                // 修复：使用包装容器解决流式内容分词换行问题
                                const wrappedHtml = `<div class="streaming-content" style="white-space: normal; word-break: normal; word-wrap: normal; overflow-wrap: break-word;">${renderMarkdown(fullText)}</div>`;
                                contentElement.innerHTML = wrappedHtml;
                                
                                // 滚动到底部
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                        }
                    }
                    
                    // 添加助手消息到聊天历史
                    chatHistory.push({
                        role: 'assistant',
                        content: fullText,
                        timestamp: Date.now()
                    });
                    
                    // 保存更新后的消息历史
                    saveChatHistory(chatHistory);
                } else {
                    // 处理非流式响应
                    contentElement.innerHTML = renderMarkdown(response.fullResponse);
                    
                    // 添加助手消息到聊天历史
                    chatHistory.push({
                        role: 'assistant',
                        content: response.fullResponse,
                        timestamp: Date.now()
                    });
                    
                    // 保存更新后的消息历史
                    saveChatHistory(chatHistory);
                }
            } else {
                // 使用Ollama API，传递过滤后的历史记录
                const response = await sendMessageToOllama(message, apiChatHistory);
                
                // 移除加载指示器
                loadingIndicator.remove();
                
                // 更新内容 - 修复：从response.content中获取内容
                const content = response.content || response;
                contentElement.innerHTML = renderMarkdown(content);
                
                // 添加助手消息到聊天历史
                chatHistory.push({
                    role: 'assistant',
                    content: content,
                    timestamp: Date.now()
                });
                
                // 保存更新后的消息历史
                saveChatHistory(chatHistory);
            }
            
            // 添加复制按钮
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-button action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                    ${t('chat.copy')}
                </button>
            `;
            assistantMessageElement.appendChild(actionsElement);
            
            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(contentElement.textContent);
            });
            
            // 应用代码高亮
            if (typeof hljs !== 'undefined') {
                try {
                    contentElement.querySelectorAll('pre code').forEach((block) => {
                        hljs.highlightElement(block);
                    });
                } catch (e) {
                    console.debug('Error during code highlighting:', e);
                }
            }
        } catch (error) {
            console.error('Error sending message:', error);
            
            // 显示错误消息
            contentElement.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
        } finally {
            // 重置生成状态
            isGenerating = false;
            streamingMessageElement = null;
        }
    }
    
    // 修复：加载当前标签页的聊天历史 - 正确处理复杂的消息对象
    function loadChatHistory(tabId) {
        // 显示加载状态
        const loadingElement = document.createElement('div');
        loadingElement.className = 'chat-loading';
        loadingElement.innerHTML = '<div class="spinner"></div><p>正在加载对话...</p>';
        chatMessages.innerHTML = '';
        chatMessages.appendChild(loadingElement);
        
        console.log('加载标签页的聊天历史:', tabId);
        
        // 从存储中获取该标签页的消息历史
        chrome.storage.local.get(['pageMessages_' + tabId], (result) => {
            // 清空当前显示的消息
            chatMessages.innerHTML = '';
            
            const messages = result['pageMessages_' + tabId] || [];
            console.log('获取到消息历史:', messages);
            
            // 更新本地聊天历史 - 保留所有消息包括摘要
            chatHistory = messages.filter(msg => msg.role !== 'system');
            
            // 如果没有历史消息，显示默认欢迎消息
            if (messages.length === 0) {
                addWelcomeMessage();
                return;
            }
            
            // 渲染历史消息，传递type参数以正确显示摘要
            messages.forEach(msg => {
                if (msg.role !== 'system') {
                    addMessageToUI(msg.role, msg.content, msg.type);
                }
            });
        });
    }
    
    // 新增：保存聊天记录到当前标签页
    function saveChatHistory(messages) {
        if (!currentTabId) return;
        
        // 检查是否有系统消息
        const hasSystemMessage = messages.some(msg => msg.role === 'system');
        
        // 如果没有系统消息，添加一个默认的
        const messagesWithSystem = hasSystemMessage ? messages : [
            { role: 'system', content: 'You are a helpful assistant.' },
            ...messages
        ];
        
        // 保存到特定标签页的消息历史
        chrome.storage.local.set({
            ['pageMessages_' + currentTabId]: messagesWithSystem
        }, () => {
            console.log('聊天记录已保存到标签页:', currentTabId);
        });
    }
    
    // 新增：初始化标签页关联
    function initCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                currentTabId = tabs[0].id;
                console.log('当前标签页ID:', currentTabId);
                loadChatHistory(currentTabId);
            }
        });
    }

    // Add welcome message
    function addWelcomeMessage() {
        const welcomeElement = document.createElement('div');
        welcomeElement.className = 'message assistant welcome-message';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        contentElement.innerHTML = renderMarkdown(t('chat.welcomeMessage', 'Hi, How can I help you today?'));
        
        welcomeElement.appendChild(contentElement);
        chatMessages.appendChild(welcomeElement);
    }
    
    // 新增：监听来自后台的消息
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'summaryStream') {
            handleSummaryStream(message);
        } else if (message.action === 'summaryError') {
            handleSummaryError(message);
        }
    });
    
    // 新增：绑定摘要按钮事件
    summarizeButton.addEventListener('click', startSummarize);
    
    // 新增：绑定刷新内容按钮事件
    refreshPageContentButton.addEventListener('click', refreshPageContent);
    
    // 新增：绑定发送按钮事件
    sendButton.addEventListener('click', sendMessage);
    
    // 新增：绑定输入框回车事件
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // 新增：初始化摘要按钮
    initSummaryButton();
    
    // 新增：标签页切换时更新摘要按钮状态
    chrome.tabs.onActivated.addListener((activeInfo) => {
        currentTabId = activeInfo.tabId;
        console.log('标签页切换至:', currentTabId);
        loadChatHistory(currentTabId);
        
        // 更新摘要按钮状态
        setTimeout(initSummaryButton, 300);
    });
    
    // 新增：标签页更新时更新摘要按钮状态和聊天历史
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && tabId === currentTabId) {
            setTimeout(() => {
                initSummaryButton();
                loadChatHistory(currentTabId);
            }, 300);
        }
    });
    
    // 新增：绑定新对话按钮事件 - 清空当前标签页历史
    newChatButton.addEventListener('click', () => {
        if (!currentTabId) return;
        
        // 确认是否清空当前对话
        if (confirm(t('chat.confirmNewChat', '确定要开始新对话吗？这将清空当前页面的所有消息。'))) {
            // 清空聊天历史
            chatHistory = [];
            saveChatHistory(chatHistory);
            
            // 清空UI
            chatMessages.innerHTML = '';
            addWelcomeMessage();
        }
    });
    
    // 初始化
    addWelcomeMessage();
    initCurrentTab(); // 替换 initSummaryButton() 为主要初始化函数
    adjustTextareaHeight();
}