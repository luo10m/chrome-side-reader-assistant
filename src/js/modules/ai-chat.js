// Import the API service and markdown renderer
import { getSettings, getActiveSystemPrompt } from '../config/settings.js';
import { sendMessageToOpenAI } from '../services/openai-service.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';
import { getRichMediaRenderer } from '../renderers/twitter-renderer.js';
import { t } from '../utils/i18n.js';
import { safeSendMessage } from '../utils/message-client.js';
import { MAX_HISTORY_IN_CONTEXT } from '../constants.js';
import { ensureMessageList } from '../shared/runtime-guards.mjs';
import { DEFAULT_OPENAI_MODEL } from '../shared/openai-defaults.mjs';
import {
    buildChatRequestMessages,
    buildSelectionPreview,
    getRenderableConversationMessages
} from '../shared/chat-context.mjs';

// Load AI Chat
export function loadAIChat(container) {
    // Chat history
    let chatHistory = [];

    // 添加当前标签页跟踪
    let currentTabId = null;
    let isGenerating = false; // 标记 AI 是否正在生成回复
    let isSummarizing = false; // 标记是否正在生成摘要
    let currentSummaryMessageId = null; // 当前摘要消息的ID
    let summaryContentElement = null; // 摘要内容元素
    let streamingMessageElement = null; // 用于流式响应的消息元素
    let currentSelectionText = '';

    // Create chat UI with redesigned layout
    container.innerHTML = `
        <div class="chat-container">
            <div id="page-info" class="page-info-container" style="display: none;">
                <div class="page-info-content">
                    <div id="page-title" class="page-title"></div>
                    <div id="page-url" class="page-url"></div>
                </div>
                <button id="refresh-page-content" class="primary-button" data-i18n="chat.summarize">开始摘要</button>
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
                <div id="selection-chip" class="selection-chip" hidden>
                    <span class="selection-chip-icon" aria-hidden="true">↳</span>
                    <span id="selection-chip-text" class="selection-chip-text"></span>
                    <button id="clear-selection-chip" class="selection-chip-clear" type="button" aria-label="Clear selected text">×</button>
                </div>
                <div class="chat-input-container">
                    <textarea id="chat-input" data-i18n-placeholder="chat.placeholder" placeholder="Type your message..." rows="1" style="height: auto;"></textarea>
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
    const selectionChip = document.getElementById('selection-chip');
    const selectionChipText = document.getElementById('selection-chip-text');
    const clearSelectionChipButton = document.getElementById('clear-selection-chip');

    // 新增：摘要相关元素
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

                // 更新当前标签页ID
                currentTabId = tabId;

                console.log(`初始化摘要按钮，当前标签页: ${tabId}, URL: ${currentTab.url}`);

                // 显示页面基本信息
                updatePageInfo(currentTab.title, currentTab.url);
                pageInfoContainer.style.display = 'flex';
                
                // 始终启用摘要按钮，让用户可以尝试提取内容
                refreshPageContentButton.disabled = false;

                chrome.storage.local.get(['pageCache'], (result) => {
                    const pageCache = result.pageCache || {};
                    const tabInfo = pageCache[tabId];

                    console.log('页面缓存信息:', tabInfo);

                    // 无论是否有缓存，都显示页面信息并启用按钮
                    if (tabInfo && tabInfo.url === currentTab.url) {
                        console.log('找到页面缓存，将使用缓存内容');
                    } else {
                        console.log('未找到页面缓存，将尝试提取内容');
                    }
                });
            } else {
                // 没有活动标签页，禁用摘要按钮
                refreshPageContentButton.disabled = true;
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
        // 调用开始摘要函数
        startSummarize();
    }

    function openSettings() {
        document.getElementById('settings-btn')?.click();
    }
    
    // 移除原始硬编码的 renderTwitterContent 逻辑，统一委托给 renderer registry 模式处理

    // 新增：开始摘要 - 更新以支持页面级别独立聊天并检查OpenAI设置
    function startSummarize() {
        if (isSummarizing || !currentTabId) return;

        // 设置状态
        isSummarizing = true;
        refreshPageContentButton.disabled = true;
        refreshPageContentButton.textContent = t('chat.summarizing', '正在摘要...');

        // 删除欢迎消息（如果存在）
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // 删除现有的摘要消息（如果存在）
        const existingSummary = document.querySelector('.summary-message');
        if (existingSummary) {
            existingSummary.remove();
        }

        // 创建摘要消息元素
        const messageElement = document.createElement('div');
        messageElement.className = 'message assistant summary-message';

        // 创建内容元素
        summaryContentElement = document.createElement('div');
        summaryContentElement.className = 'message-content';
        summaryContentElement.innerHTML = '<div class="loading-indicator">生成中...</div>';
        messageElement.appendChild(summaryContentElement);

        // 添加到消息列表
        chatMessages.appendChild(messageElement);

        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // 检查是否有Twitter富媒体内容
        chrome.storage.local.get(['pageCache'], (result) => {
            const pageCache = result.pageCache || {};
            const tabInfo = pageCache[currentTabId];
            
            // 如果是Twitter页面且有富媒体内容，先渲染富媒体内容
            if (tabInfo && tabInfo.isTwitter && tabInfo.richData) {
                console.log('检测到Twitter富媒体内容，渲染中...');
                
                // 创建富媒体容器
                const twitterContentContainer = document.createElement('div');
                twitterContentContainer.className = 'twitter-content-container';
                
                // 渲染特定网站富媒体内容
                const richContent = getRichMediaRenderer(tabInfo);
                if (richContent) {
                    twitterContentContainer.appendChild(richContent);
                    
                    // 添加分隔线
                    const divider = document.createElement('div');
                    divider.className = 'content-divider';
                    twitterContentContainer.appendChild(divider);
                    
                    // 清除加载指示器，添加富媒体内容
                    summaryContentElement.innerHTML = '';
                    summaryContentElement.appendChild(twitterContentContainer);
                    
                    // 添加摘要加载指示器
                    const summaryLoadingIndicator = document.createElement('div');
                    summaryLoadingIndicator.className = 'loading-indicator';
                    summaryLoadingIndicator.textContent = '生成摘要中...';
                    summaryContentElement.appendChild(summaryLoadingIndicator);
                }
            }
            
            // 发送摘要请求，包含当前标签页ID
            safeSendMessage({
                action: 'summarizePage',
                tabId: currentTabId
            }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    const error = chrome.runtime.lastError ?
                        chrome.runtime.lastError.message :
                        (response && response.error ? response.error : '未知错误');

                    // 显示错误
                    // 如果有Twitter内容，保留富媒体内容，只替换加载指示器
                    const loadingIndicator = summaryContentElement.querySelector('.loading-indicator');
                    if (loadingIndicator) {
                        loadingIndicator.innerHTML = `<div class="error-message">摘要生成失败: ${error}</div>`;
                    } else {
                        summaryContentElement.innerHTML = `<div class="error-message">摘要生成失败: ${error}</div>`;
                    }

                    // 重置状态
                    isSummarizing = false;
                    refreshPageContentButton.disabled = false;
                    refreshPageContentButton.textContent = t('chat.summarize', '摘要');
                }
            });
        });
    }

    // 修改：处理摘要流，支持页面级别独立聊天
    let fullSummaryContent = ''; // 累积完整的摘要内容

    function handleSummaryStream(data) {
        if (!summaryContentElement) return;

        if (currentSummaryMessageId === null) {
            currentSummaryMessageId = data.messageId;
            
            // 检查是否有Twitter富媒体内容
            const twitterContainer = summaryContentElement.querySelector('.twitter-content-container');
            const loadingIndicator = summaryContentElement.querySelector('.loading-indicator');
            
            // 如果有Twitter富媒体内容，只清除加载指示器
            if (twitterContainer && loadingIndicator) {
                loadingIndicator.remove();
            } else {
                // 否则清除所有内容
                summaryContentElement.innerHTML = '';
            }
            
            fullSummaryContent = ''; // 重置累积内容
        }

        if (data.messageId !== currentSummaryMessageId) return;

        if (data.done) {
            // 摘要完成
            isSummarizing = false;
            refreshPageContentButton.disabled = false;
            refreshPageContentButton.textContent = t('chat.summarize', '摘要');
            currentSummaryMessageId = null;

            // 移除"正在生成摘要...#网页内容摘要"
            const summaryText = fullSummaryContent.replace('正在生成摘要...#', '');
            
            // 检查是否有Twitter富媒体内容
            const twitterContainer = summaryContentElement.querySelector('.twitter-content-container');
            
            if (twitterContainer) {
                // 如果有Twitter富媒体内容，添加摘要到富媒体内容之后
                const summaryElement = document.createElement('div');
                summaryElement.className = 'summary-text';
                summaryElement.innerHTML = renderMarkdown(summaryText);
                summaryContentElement.appendChild(summaryElement);
            } else {
                // 如果没有Twitter富媒体内容，直接渲染摘要
                summaryContentElement.innerHTML = renderMarkdown(summaryText);
            }

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

            // 添加或更新摘要消息到聊天历史
            if (currentTabId) {
                safeSendMessage({
                    action: 'upsertSummaryMessage',
                    tabId: currentTabId,
                    summaryMessage: {
                        role: 'assistant',
                        content: summaryText,
                        type: 'summary',
                        ts: Date.now()
                    }
                }).then((response) => {
                    chatHistory = ensureMessageList(response?.list).filter((message) => message.role !== 'system');
                });
            }
        } else {
            // 累积内容，然后一次性渲染
            fullSummaryContent += data.content;

            // 移除可能的提示文本
            const cleanContent = fullSummaryContent.replace("网页内容摘要 # ", '');
            
            // 检查是否有Twitter富媒体内容
            const twitterContainer = summaryContentElement.querySelector('.twitter-content-container');
            
            if (twitterContainer) {
                // 如果有Twitter富媒体内容，检查是否已有摘要元素
                let summaryElement = summaryContentElement.querySelector('.summary-text');
                
                if (!summaryElement) {
                    // 如果没有摘要元素，创建一个
                    summaryElement = document.createElement('div');
                    summaryElement.className = 'summary-text';
                    summaryContentElement.appendChild(summaryElement);
                }
                
                // 更新摘要内容
                summaryElement.innerHTML = renderMarkdown(cleanContent);
            } else {
                // 如果没有Twitter富媒体内容，直接渲染摘要
                summaryContentElement.innerHTML = renderMarkdown(cleanContent);
            }

            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // 处理摘要错误
    function handleSummaryError(data) {
        const refreshPageContentButton = document.getElementById('refresh-page-content');

        if (summaryContentElement) {
            // 显示错误
            summaryContentElement.innerHTML = `<div class="error-message">摘要生成失败: ${data.error}</div>`;
        }

        // 重置状态
        isSummarizing = false;
        if (refreshPageContentButton) {
            refreshPageContentButton.disabled = false;
            refreshPageContentButton.classList.remove('loading');
            refreshPageContentButton.textContent = t('chat.summarize', '开始摘要');
        }
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

    function setSelectionText(selectionText) {
        currentSelectionText = typeof selectionText === 'string' ? selectionText.trim() : '';
        const preview = buildSelectionPreview(currentSelectionText);

        if (!preview) {
            selectionChip.hidden = true;
            selectionChipText.textContent = '';
            return;
        }

        selectionChip.hidden = false;
        selectionChipText.textContent = preview;
    }

    function clearSelectionText() {
        setSelectionText('');
    }

    async function refreshSelectedPageText() {
        if (!currentTabId) {
            clearSelectionText();
            return '';
        }

        const response = await safeSendMessage({
            action: 'getSelectedPageText',
            tabId: currentTabId
        });

        const nextSelection = response?.success ? response.text || '' : '';
        setSelectionText(nextSelection);
        return nextSelection;
    }

    function renderHistoryList(messages) {
        historyList.innerHTML = '';
        const renderableMessages = getRenderableConversationMessages(messages);

        if (renderableMessages.length === 0) {
            historyList.innerHTML = `<div class="no-history">${t('chat.noHistory', 'No history yet')}</div>`;
            return;
        }

        renderableMessages.forEach((message) => {
            const item = document.createElement('div');
            item.className = 'history-item';

            const role = document.createElement('div');
            role.className = 'history-item-role';
            role.textContent = message.type === 'summary'
                ? '摘要'
                : (message.role === 'user' ? '你' : '助手');

            const content = document.createElement('div');
            content.className = 'history-item-content';
            content.textContent = buildSelectionPreview(message.content || '', 80);

            item.appendChild(role);
            item.appendChild(content);
            historyList.appendChild(item);
        });
    }

    async function openHistoryPopup() {
        if (!currentTabId) return;

        const historyResponse = await safeSendMessage({
            action: 'getChatHistory',
            tabId: currentTabId
        });
        const messages = ensureMessageList(historyResponse?.list);
        renderHistoryList(messages);
        historyPopup.classList.add('show');
    }

    function closeHistoryPopup() {
        historyPopup.classList.remove('show');
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
        }

        // 为助手消息添加模型标识
        if (role === 'assistant') {
            // 获取当前使用的模型
            getSettings().then(settings => {
                const modelName = settings.openaiModel || DEFAULT_OPENAI_MODEL;

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

    // 修改发送消息函数，实现MVT-0基础对话功能
    async function handleSend() {
        if (!chatInput.value.trim() || isGenerating) {
            return;
        }
        
        // 禁用发送按钮和输入
        isGenerating = true;
        sendButton.disabled = true;
        
        // 获取输入内容并清空输入框
        const userMessage = chatInput.value.trim();
        chatInput.value = '';
        adjustTextareaHeight();
        
        try {
            // 获取当前标签页ID
            const [{ id: tabId }] = await chrome.tabs.query({ active: true, currentWindow: true });
            currentTabId = tabId;
            const selectionText = await refreshSelectedPageText();
            
            // 1. 写入user消息到历史
            await safeSendMessage({
                action: 'appendChatMessage',
                tabId,
                message: {
                    id: Date.now(),
                    role: 'user',
                    content: userMessage,
                    ts: Date.now()
                }
            });
            
            // 添加用户消息到UI
            addMessageToUI('user', userMessage);
            
            // 2. 拉取完整历史
            const historyResponse = await safeSendMessage({
                action: 'getChatHistory',
                tabId
            });
            const list = ensureMessageList(historyResponse?.list);
            
            // 3. 取得页面摘要
            const ctxResponse = await safeSendMessage({
                action: 'getPageContext',
                tabId
            });
            const ctx = ctxResponse && ctxResponse.success !== false ? ctxResponse : null;
            const compactMemoryResponse = await safeSendMessage({
                action: 'getCompactMemory',
                tabId
            });
            const compactMemory = compactMemoryResponse?.success ? compactMemoryResponse.compactMemory || '' : '';
            const historyWithoutCurrentTurn = [...list];
            const latestMessage = historyWithoutCurrentTurn[historyWithoutCurrentTurn.length - 1];
            if (latestMessage?.role === 'user' && latestMessage?.content === userMessage) {
                historyWithoutCurrentTurn.pop();
            }
            
            // 获取当前活动的系统提示词
            const systemPrompt = await getActiveSystemPrompt();
            
            // 获取设置
            const settings = await getSettings();
            
            // 4. 组装发送给模型的messages
            const messages = buildChatRequestMessages({
                systemPrompt,
                pageSummary: ctx?.summary || '',
                compactMemory,
                history: historyWithoutCurrentTurn,
                userMessage,
                selectionText,
                maxHistoryInContext: MAX_HISTORY_IN_CONTEXT
            });
            
            // 创建流式显示的消息元素
            streamingMessageElement = document.createElement('div');
            streamingMessageElement.className = 'message assistant';
            const contentElement = document.createElement('div');
            contentElement.className = 'message-content';
            streamingMessageElement.appendChild(contentElement);
            chatMessages.appendChild(streamingMessageElement);
            
            // 显示加载指示器
            contentElement.innerHTML = '<div class="typing-indicator">思考中<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>';
            
            // 滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // 5. 调用服务
            let response;
            let fullText = '';
            
            // 检查是否有API密钥
            if (!settings.openaiApiKey) {
                contentElement.innerHTML = '请在设置中配置OpenAI API密钥';
                setTimeout(() => {
                    openSettings();
                }, 1000);
                return;
            }
            
            // 使用OpenAI
            response = await sendMessageToOpenAI(userMessage, messages, null);
            
            // 处理OpenAI的流式响应
            if (response.streaming) {
                await handleStreamingResponse(response.reader, response.decoder, updateStreamingMessage, tabId);
                return; // 流式响应会自行处理UI更新
            }
            
            fullText = response.fullResponse || '';
            contentElement.innerHTML = renderMarkdown(fullText);

            if (fullText) {
                await safeSendMessage({
                    action: 'appendChatMessage',
                    tabId,
                    message: {
                        id: Date.now(),
                        role: 'assistant',
                        content: fullText,
                        ts: Date.now()
                    }
                });
                await safeSendMessage({
                    action: 'updateCompactMemory',
                    tabId
                });
            }
            clearSelectionText();
        } catch (error) {
            console.error('发送消息错误:', error);
            
            // 显示错误消息
            if (streamingMessageElement) {
                const contentElement = streamingMessageElement.querySelector('.message-content');
                if (contentElement) {
                    contentElement.innerHTML = `<div class="error-message">错误: ${error.message}</div>`;
                }
            }
        } finally {
            // 重置状态
            isGenerating = false;
            sendButton.disabled = false;
            streamingMessageElement = null;
        }
    }

    // 处理流式响应
    async function handleStreamingResponse(reader, decoder, callback, tabId) {
        let fullText = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    const message = line.replace(/^data: /, '').trim();
                    if (message === '[DONE]') {
                        break;
                    }
                    
                    try {
                        const parsed = JSON.parse(message);
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) {
                            fullText += content;
                            callback(content, fullText, false);
                        }
                    } catch (e) {
                        console.error('Error parsing message:', e, 'Raw message:', message);
                    }
                }
            }
            
            // 完成处理
            callback('', fullText, true);
            
            if (fullText) {
                const appendResponse = await safeSendMessage({
                    action: 'appendChatMessage',
                    tabId,
                    message: {
                        id: Date.now(),
                        role: 'assistant',
                        content: fullText,
                        ts: Date.now()
                    }
                });
                chatHistory = ensureMessageList(appendResponse?.list).filter((message) => message.role !== 'system');
                await safeSendMessage({
                    action: 'updateCompactMemory',
                    tabId
                });
            }
            clearSelectionText();
             
        } catch (error) {
            console.error('Error reading stream:', error);
            const errorElement = streamingMessageElement?.querySelector('.message-content');
            if (errorElement) {
                errorElement.innerHTML = `<div class="error-message">流式响应错误: ${error.message}</div>`;
            }
        } finally {
            isGenerating = false;
            sendButton.disabled = false;
        }
    }
    
    // 更新流式消息
    function updateStreamingMessage(chunk, fullText, done = false) {
        if (!streamingMessageElement) return;

        const contentElement = streamingMessageElement.querySelector('.message-content');
        if (!contentElement) return;

        if (done) {
            // 完成响应，添加复制按钮
            contentElement.innerHTML = renderMarkdown(fullText || '');

            // 添加操作按钮
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="action-copy-button" title="${t('chat.copy')}">
                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                </button>
            `;
            streamingMessageElement.appendChild(actionsElement);

            // 添加复制功能
            const copyButton = actionsElement.querySelector('.action-copy-button');
            copyButton.addEventListener('click', () => {
                copyToClipboard(fullText);
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
        } else {
            // 更新流式内容
            if (contentElement.querySelector('.loading-indicator')) {
                contentElement.innerHTML = '';
            }
            
            // 包装内容以确保正确的换行
            const wrappedHtml = `<div class="streaming-content" style="white-space: normal; word-break: normal; word-wrap: normal; overflow-wrap: break-word;">${renderMarkdown(fullText)}</div>`;
            contentElement.innerHTML = wrappedHtml;
        }

        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 修复：加载当前标签页的聊天历史 - 正确处理复杂的消息对象
    async function loadChatHistory(tabId, options = {}) {
        const { force = false } = options;
        // 显示加载状态
        const loadingElement = document.createElement('div');
        loadingElement.className = 'chat-loading';
        loadingElement.innerHTML = '<div class="spinner"></div><p>正在加载对话...</p>';
        chatMessages.innerHTML = '';
        chatMessages.appendChild(loadingElement);

        console.log('加载标签页的聊天历史:', tabId);

        const [settings, response] = await Promise.all([
            getSettings(),
            safeSendMessage({
                action: 'getChatHistory',
                tabId
            })
        ]);

        // 清空当前显示的消息
        chatMessages.innerHTML = '';

        const messages = ensureMessageList(response?.list);
        console.log('获取到消息历史:', messages);
        chatHistory = messages.filter(msg => msg.role !== 'system');
        renderHistoryList(messages);

        if (!force && settings.loadLastChat === false) {
            addWelcomeMessage();
            return;
        }

        // 如果没有历史消息，显示默认欢迎消息
        if (messages.length === 0) {
            addWelcomeMessage();
            return;
        }

        messages.forEach(msg => {
            if (msg.role !== 'system') {
                addMessageToUI(msg.role, msg.content, msg.type);
            }
        });
    }

    // 新增：初始化标签页关联
    async function initCurrentTab() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
                currentTabId = tabs[0].id;
                console.log('当前标签页ID:', currentTabId);
                loadChatHistory(currentTabId);
                refreshSelectedPageText();
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
        } else if (message.action === 'pageNavigated') {
            // 检查是否是当前标签页
            if (message.tabId === currentTabId) {
                // 防抖/护垫：如果正在生成摘要，或者后台明确表示没有新内容，拒绝打断当前对话状态
                if (isSummarizing || message.hasNewContent === false) {
                    console.log('Ignore pageNavigated event to protect UI state.');
                    return;
                }

                console.log('Current page navigated:', message.newUrl);

                setTimeout(() => {
                    // 更新摘要按钮状态和页面信息
                    initSummaryButton();

                    // 重新加载该标签页的聊天历史，后台已清理旧帖子会话
                    loadChatHistory(currentTabId);
                    clearSelectionText();
                    closeHistoryPopup();
                }, 100);
            }
        }
    });

    // 新增：绑定摘要按钮事件
    refreshPageContentButton.addEventListener('click', refreshPageContent);

    // 新增：绑定发送按钮事件
    sendButton.addEventListener('click', handleSend);
    historyButton.addEventListener('click', openHistoryPopup);
    closeHistoryButton.addEventListener('click', closeHistoryPopup);
    clearSelectionChipButton.addEventListener('click', clearSelectionText);
    chatInput.addEventListener('focus', () => {
        refreshSelectedPageText();
    });
    window.addEventListener('focus', () => {
        refreshSelectedPageText();
    });

    // 新增：绑定输入框回车事件
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // 新增：初始化摘要按钮
    initSummaryButton();

    // 新增：标签页切换时更新摘要按钮状态
    chrome.tabs.onActivated.addListener((activeInfo) => {
        currentTabId = activeInfo.tabId;
        console.log('标签页切换至:', currentTabId);
        loadChatHistory(currentTabId);
        refreshSelectedPageText();

        // 更新摘要按钮状态
        setTimeout(initSummaryButton, 300);
    });

    // 新增：标签页更新时更新摘要按钮状态和聊天历史
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete' && tabId === currentTabId) {
            setTimeout(() => {
                initSummaryButton();
                loadChatHistory(currentTabId);
                refreshSelectedPageText();
            }, 300);
        }
    });

    // 新增：绑定新对话按钮事件 - 清空当前标签页历史
    newChatButton.addEventListener('click', async () => {
        if (!currentTabId) return;

        // 确认是否清空当前对话
        if (confirm(t('chat.confirmNewChat', '确定要开始新对话吗？这将清空当前页面的所有消息。'))) {
            // 清空聊天历史
            chatHistory = [];
            await safeSendMessage({
                action: 'clearChatHistory',
                tabId: currentTabId
            });
            clearSelectionText();
            closeHistoryPopup();

            // 清空UI
            chatMessages.innerHTML = '';
            addWelcomeMessage();
            renderHistoryList([]);
        }
    });

    // 初始化
    addWelcomeMessage();
    initCurrentTab(); // 替换 initSummaryButton() 为主要初始化函数
    adjustTextareaHeight();
}
