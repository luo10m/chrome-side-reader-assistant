// Import the API service and markdown renderer
import { sendMessageToOllama, getSettings } from '../services/ollama-service.js';
import { sendMessageToOpenAI } from '../services/openai-service.js';
import { renderMarkdown } from '../utils/markdown-renderer.js';
import { t } from '../utils/i18n.js';

// Load AI Chat
export function loadAIChat(container) {
    // Chat history
    let chatHistory = [];
    
    // Current chat ID
    let currentChatId = null;
    
    // 在文件顶部添加变量
    let isGenerating = false; // 标记 AI 是否正在生成回复
    
    // Create chat UI with redesigned layout
    container.innerHTML = `
        <div class="chat-container">
            <div class="chat-header">
                <h2 data-i18n="chat.header">AI Chat</h2>
            </div>
            <div class="chat-messages" id="chat-messages">
                <!-- Welcome message will be added here -->
            </div>
            <div class="chat-input-wrapper">
                <div class="chat-input-container">
                    <textarea id="chat-input" data-i18n-placeholder="chat.placeholder" placeholder="Type your message..." rows="1"></textarea>
                    <div class="chat-actions">
                        <button id="new-chat-button" class="action-button" data-i18n-title="chat.newChat" title="New Chat">
                            <img src="assets/svg/new-chat.svg" alt="New Chat" class="button-icon">
                        </button>
                        <button id="history-button" class="action-button" data-i18n-title="chat.history" title="Chat History">
                            <img src="assets/svg/history.svg" alt="History" class="button-icon">
                        </button>
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
    
    // Function to add message to UI
    function addMessageToUI(role, content) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${role}`;
        
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
                        try {
                            // 确保代码内容被正确转义
                            const originalContent = block.textContent;
                            block.textContent = originalContent;
                            
                            hljs.highlightElement(block);
                        } catch (e) {
                            // 忽略单个代码块的高亮错误
                            console.debug('Error highlighting individual code block:', e);
                        }
                    });
                } catch (e) {
                    // 忽略整体高亮错误
                    console.debug('Error during code highlighting:', e);
                }
            }
        }
        
        messageElement.appendChild(contentElement);
        
        // 为助手消息添加重新生成按钮
        if (role === 'assistant') {
            const actionsElement = document.createElement('div');
            actionsElement.className = 'message-actions';
            actionsElement.innerHTML = `
                <button class="regenerate-button" title="${t('chat.regenerate')}">
                    <img src="assets/svg/refresh.svg" alt="Regenerate" class="button-icon">
                </button>
            `;
            messageElement.appendChild(actionsElement);
            
            // 添加重新生成功能
            const regenerateButton = actionsElement.querySelector('.regenerate-button');
            regenerateButton.addEventListener('click', () => {
                regenerateResponse(messageElement);
            });
        }
        
        chatMessages.appendChild(messageElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        return contentElement;
    }
    
    // Function to send message
    let streamingMessageElement = null;
    let codeBlocks = new Map(); // 用于跟踪代码块
    
    
    // 简化输入事件处理
    
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
        
        // Clear input
        chatInput.value = '';
        
        // Reset input height
        chatInput.style.height = 'auto';
        
        // Add user message to UI
        addMessageToUI('user', message);
        
        // Add user message to chat history
        chatHistory.push({
            role: 'user',
            content: message
        });
        
        // Create streaming message element
        const assistantMessageElement = document.createElement('div');
        assistantMessageElement.className = 'message assistant';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // Add typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        
        contentElement.appendChild(typingIndicator);
        assistantMessageElement.appendChild(contentElement);
        
        chatMessages.appendChild(assistantMessageElement);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Set streaming message element
        streamingMessageElement = contentElement;
        
        // Set generating state
        isGenerating = true;
        updateInputState();
        
        try {
            // Get settings
            const settings = await getSettings();
            
            // Choose API based on default AI provider
            let response;
            
            if (settings.defaultAI === 'openai') {
                // Import OpenAI service
                const { sendMessageToOpenAI, parseOpenAIStreamingResponse } = await import('../services/openai-service.js');
                
                // Use OpenAI API
                response = await sendMessageToOpenAI(message, chatHistory, settings.systemPrompt);
                
                // Handle streaming response
                if (response.streaming) {
                    let fullResponse = '';
                    let buffer = ''; // 用于存储可能被截断的数据
                    
                    // 处理流式响应
                    while (true) {
                        try {
                            const { done, value } = await response.reader.read();
                            
                            if (done) {
                                break;
                            }
                            
                            // 解码响应
                            const chunk = response.decoder.decode(value, { stream: true });
                            buffer += chunk;
                            
                            // 查找完整的数据行
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || ''; // 保留最后一行（可能不完整）
                            
                            for (const line of lines) {
                                if (line.trim().startsWith('data:')) {
                                    const content = parseOpenAIStreamingResponse(line);
                                    
                                    if (content && typeof content === 'string') {
                                        fullResponse += content;
                                        streamingMessageElement.innerHTML = renderMarkdown(fullResponse);
                                        
                                        // 应用代码高亮
                                        if (typeof hljs !== 'undefined') {
                                            try {
                                                streamingMessageElement.querySelectorAll('pre code').forEach((block) => {
                                                    try {
                                                        hljs.highlightElement(block);
                                                    } catch (e) {
                                                        console.debug('Error highlighting code block:', e);
                                                    }
                                                });
                                            } catch (e) {
                                                console.debug('Error during code highlighting:', e);
                                            }
                                        }
                                        
                                        // 自动滚动到底部
                                        scrollToBottom();
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Error reading stream:', error);
                            break;
                        }
                    }
                    
                    // 处理buffer中可能剩余的数据
                    if (buffer.trim() && buffer.trim().startsWith('data:')) {
                        const content = parseOpenAIStreamingResponse(buffer);
                        
                        if (content && typeof content === 'string') {
                            fullResponse += content;
                            streamingMessageElement.innerHTML = renderMarkdown(fullResponse);
                            
                            // 应用代码高亮
                            if (typeof hljs !== 'undefined') {
                                try {
                                    streamingMessageElement.querySelectorAll('pre code').forEach((block) => {
                                        try {
                                            hljs.highlightElement(block);
                                        } catch (e) {
                                            console.debug('Error highlighting code block:', e);
                                        }
                                    });
                                } catch (e) {
                                    console.debug('Error during code highlighting:', e);
                                }
                            }
                            
                            // 自动滚动到底部
                            scrollToBottom();
                        }
                    }
                    
                    // 如果没有收到任何内容，显示错误消息
                    if (!fullResponse) {
                        console.error('No content received from OpenAI streaming response');
                        streamingMessageElement.innerHTML = '<div class="error-message">Error: No content received from OpenAI</div>';
                    } else {
                        // 将完整的响应添加到聊天历史
                        chatHistory.push({
                            role: 'assistant',
                            content: fullResponse
                        });
                        
                        // 保存聊天历史
                        await saveCurrentChat();
                    }
                } else {
                    // Handle non-streaming response
                    // 直接更新 streamingMessageElement
                    if (streamingMessageElement) {
                        // 移除打字指示器
                        const typingIndicator = streamingMessageElement.querySelector('.typing-indicator');
                        if (typingIndicator) {
                            typingIndicator.remove();
                        }
                        
                        // 更新内容
                        streamingMessageElement.innerHTML = renderMarkdown(response.fullResponse);
                        
                        // 应用代码高亮
                        if (typeof hljs !== 'undefined') {
                            try {
                                streamingMessageElement.querySelectorAll('pre code').forEach((block) => {
                                    try {
                                        hljs.highlightElement(block);
                                    } catch (e) {
                                        console.debug('Error highlighting code block:', e);
                                    }
                                });
                            } catch (e) {
                                console.debug('Error during code highlighting:', e);
                            }
                        }
                        
                        // 滚动到底部
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                    
                    // Add to chat history
                    chatHistory.push({
                        role: 'assistant',
                        content: response.fullResponse
                    });
                    
                
                }
                    // Save chat history
                await saveCurrentChat();
                
                // Reset generating state
                isGenerating = false;
                updateInputState();
            } else {
                // Default to Ollama API
                response = await sendMessageToOllama(message, chatHistory, (chunk, fullText) => {
                    // Remove typing indicator
                    const typingIndicator = streamingMessageElement.querySelector('.typing-indicator');
                    if (typingIndicator) {
                        typingIndicator.remove();
                    }
                    
                    // Update content
                    streamingMessageElement.innerHTML = renderMarkdown(fullText);
                    
                    // Apply code highlighting
                    if (typeof hljs !== 'undefined') {
                        try {
                            streamingMessageElement.querySelectorAll('pre code').forEach((block) => {
                                try {
                                    hljs.highlightElement(block);
                                } catch (e) {
                                    console.debug('Error highlighting code block:', e);
                                }
                            });
                        } catch (e) {
                            console.debug('Error during code highlighting:', e);
                        }
                    }
                    
                    // Scroll to bottom
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                });
                
                // Add assistant message to chat history
                chatHistory.push({
                    role: 'assistant',
                    content: response.content
                });
                
                // Save chat history
                await saveCurrentChat();
                
                // Reset generating state
                isGenerating = false;
                updateInputState();
            }
            
            // Reset streaming message element
            streamingMessageElement = null;
        } catch (error) {
            console.error('Error sending message:', error);
            
            // Show error message
            if (streamingMessageElement) {
                streamingMessageElement.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
            }
            
            // Reset generating state
            isGenerating = false;
            updateInputState();
            
            // Reset streaming message element
            streamingMessageElement = null;
        }
    }
    
    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });
    
    // Create new chat
    async function createNewChat() {
        // Clear chat history
        chatHistory = [];
        
        // Generate new chat ID
        currentChatId = Date.now().toString();
        
        // Clear chat messages
        chatMessages.innerHTML = '';
        
        // Add welcome message
        addWelcomeMessage();
        
        // Save current chat ID
        await chrome.storage.local.set({ lastActiveChatId: currentChatId });
        
        // Close history popup if open
        historyPopup.classList.remove('show');
    }
    
    // Load chat
    async function loadChat(chatId) {
        try {
            // Get chat from storage
            const result = await chrome.storage.local.get(['chatHistory_' + chatId]);
            const chat = result['chatHistory_' + chatId];
            
            if (chat) {
                // Set current chat ID
                currentChatId = chatId;
                
                // Set chat history
                chatHistory = chat.messages || [];
                
                // Clear chat messages
                chatMessages.innerHTML = '';
                
                // Add messages to UI
                chatHistory.forEach(message => {
                    addMessageToUI(message.role, message.content);
                });
                
                // Save current chat ID
                chrome.storage.local.set({ lastActiveChatId: currentChatId });
                
                // Close history popup
                historyPopup.classList.remove('show');
            }
        } catch (error) {
            console.error('Error loading chat:', error);
        }
    }
    
    // Save current chat
    async function saveCurrentChat() {
        if (!currentChatId || chatHistory.length === 0) {
            return;
        }
        
        try {
            // Get chat title (first user message or default)
            let title = 'Untitled Chat';
            const firstUserMessage = chatHistory.find(msg => msg.role === 'user');
            if (firstUserMessage) {
                title = firstUserMessage.content.substring(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '');
            }
            
            // Create chat object
            const chat = {
                id: currentChatId,
                title: title,
                messages: chatHistory,
                lastEditTime: Date.now()
            };
            
            // Save chat to storage
            await chrome.storage.local.set({ ['chatHistory_' + currentChatId]: chat });
            
            // Get chat history list
            const result = await chrome.storage.local.get(['chatHistoryList']);
            let chatHistoryList = result.chatHistoryList || [];
            
            // Check if chat already exists in list
            const existingChatIndex = chatHistoryList.findIndex(c => c.id === currentChatId);
            if (existingChatIndex !== -1) {
                // Update existing chat
                chatHistoryList[existingChatIndex] = {
                    id: chat.id,
                    title: chat.title,
                    lastEditTime: chat.lastEditTime
                };
            } else {
                // Add new chat to list
                chatHistoryList.push({
                    id: chat.id,
                    title: chat.title,
                    lastEditTime: chat.lastEditTime
                });
            }
            
            // Save chat history list
            await chrome.storage.local.set({ chatHistoryList });
        } catch (error) {
            console.error('Error saving chat:', error);
        }
    }
    
    // Load chat history list
    async function loadChatHistoryList() {
        try {
            // Get chat history list
            const result = await chrome.storage.local.get(['chatHistoryList']);
            const chatHistoryList = result.chatHistoryList || [];
            
            // Sort by last edit time (newest first)
            chatHistoryList.sort((a, b) => b.lastEditTime - a.lastEditTime);
            
            // Clear history list
            historyList.innerHTML = '';
            
            if (chatHistoryList.length === 0) {
                // Show no history message
                const noHistoryElement = document.createElement('div');
                noHistoryElement.className = 'no-history';
                noHistoryElement.textContent = t('chat.noHistory');
                historyList.appendChild(noHistoryElement);
                return;
            }
            
            // Add chats to list
            chatHistoryList.forEach(chat => {
                const chatElement = document.createElement('div');
                chatElement.className = 'history-item';
                if (chat.id === currentChatId) {
                    chatElement.classList.add('active');
                }
                
                const titleElement = document.createElement('div');
                titleElement.className = 'history-title';
                titleElement.textContent = chat.title || t('chat.untitled');
                
                const deleteButton = document.createElement('button');
                deleteButton.className = 'history-delete-button';
                deleteButton.innerHTML = '×';
                deleteButton.title = t('chat.delete');
                
                chatElement.appendChild(titleElement);
                chatElement.appendChild(deleteButton);
                
                // Click event to load chat
                chatElement.addEventListener('click', (e) => {
                    if (e.target !== deleteButton) {
                        loadChat(chat.id);
                    }
                });
                
                // Delete button click event
                deleteButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    
                    try {
                        // Remove chat from storage
                        await chrome.storage.local.remove(['chatHistory_' + chat.id]);
                        
                        // Remove chat from list
                        const result = await chrome.storage.local.get(['chatHistoryList']);
                        let chatHistoryList = result.chatHistoryList || [];
                        chatHistoryList = chatHistoryList.filter(c => c.id !== chat.id);
                        await chrome.storage.local.set({ chatHistoryList });
                        
                        // If current chat is deleted, create new chat
                        if (chat.id === currentChatId) {
                            createNewChat();
                        }
                        
                        // Reload history list
                        loadChatHistoryList();
                    } catch (error) {
                        console.error('Error deleting chat:', error);
                    }
                });
                
                historyList.appendChild(chatElement);
            });
        } catch (error) {
            console.error('Error loading chat history list:', error);
        }
    }
    
    // Send button click event
    sendButton.addEventListener('click', sendMessage);
    
    // Input enter key event
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Event listeners for chat history
    newChatButton.addEventListener('click', createNewChat);
    
    historyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        loadChatHistoryList();
        historyPopup.classList.add('show');
    });
    
    closeHistoryButton.addEventListener('click', () => {
        historyPopup.classList.remove('show');
    });
    
    // Initialization: Load recent chat or create new chat
    async function initChat() {
        console.log('Initializing chat...');
        
        // 获取设置和聊天历史
        const result = await chrome.storage.local.get(['settings', 'chatHistoryList', 'lastActiveChatId']);
        const settings = result.settings || {};
        const chatHistoryList = result.chatHistoryList || [];
        const lastActiveChatId = result.lastActiveChatId;
        
        // 检查是否应该加载上次对话
        const shouldLoadLastChat = settings.loadLastChat !== false;
        
        console.log(`Found ${chatHistoryList.length} chats, last active: ${lastActiveChatId}, should load last chat: ${shouldLoadLastChat}`);
        
        if (chatHistoryList.length > 0 && shouldLoadLastChat) {
            if (lastActiveChatId) {
                // 检查lastActiveChatId是否存在于chatHistoryList中
                const chatExists = chatHistoryList.some(chat => chat.id === lastActiveChatId);
                
                if (chatExists) {
                    // 加载最后活动的聊天
                    console.log(`Loading last active chat: ${lastActiveChatId}`);
                    loadChat(lastActiveChatId);
                    return;
                }
            }
            
            // 如果没有lastActiveChatId或它不存在，按最后编辑时间排序加载最新的聊天
            chatHistoryList.sort((a, b) => b.lastEditTime - a.lastEditTime);
            console.log(`Loading most recent chat: ${chatHistoryList[0].id}`);
            loadChat(chatHistoryList[0].id);
        } else {
            // 创建新聊天
            console.log('Creating new chat (no history or loadLastChat is false)');
            createNewChat();
        }
    }
    
    // Initialize chat
    initChat();
    
    // Save current chat before page unload
    window.removeEventListener('beforeunload', saveCurrentChatOnUnload); // 移除可能存在的旧监听器

    // 创建一个命名的函数，以便可以移除
    function saveCurrentChatOnUnload() {
        // 只有当currentChatId存在且聊天历史不为空时才保存
        if (currentChatId && chatHistory.length > 0) {
            console.log(`Saving chat ${currentChatId} before unload`);
            saveCurrentChat();
        } else {
            console.log('Not saving on unload: no current chat or empty history');
        }
    }

    // 添加新的监听器
    window.addEventListener('beforeunload', saveCurrentChatOnUnload);

    // 点击外部区域关闭历史记录弹窗
    document.addEventListener('click', (e) => {
        // 如果历史记录弹窗已显示
        if (historyPopup.classList.contains('show')) {
            // 检查点击是否在历史记录弹窗外部
            // 并且不是点击历史按钮本身（避免点击历史按钮同时触发打开和关闭）
            if (!historyPopup.contains(e.target) && e.target !== historyButton && !historyButton.contains(e.target)) {
                historyPopup.classList.remove('show');
            }
        }
    });

    // 阻止历史记录弹窗内部的点击事件冒泡到文档
    historyPopup.addEventListener('click', (e) => {
        // 不阻止删除按钮的点击事件冒泡，因为它需要触发删除功能
        if (!e.target.classList.contains('history-delete-button')) {
            e.stopPropagation();
        }
    });

    // 添加更新输入状态的函数
    function updateInputState() {
        // 根据 isGenerating 状态禁用或启用输入框和发送按钮
        chatInput.disabled = isGenerating;
        sendButton.disabled = isGenerating;
        
        // 可选：添加视觉提示
        if (isGenerating) {
            chatInput.classList.add('disabled');
            sendButton.classList.add('disabled');
        } else {
            chatInput.classList.remove('disabled');
            sendButton.classList.remove('disabled');
            chatInput.focus();
        }
    }

    // 创建并添加刷新图标SVG
    function createRefreshSvg() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "button-icon");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "16");
        svg.setAttribute("height", "16");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 9h7V2l-2.35 4.35z");
        path.setAttribute("fill", "currentColor");
        
        svg.appendChild(path);
        return svg;
    }

    // 设置 MutationObserver 来监听新消息
    function setupMessageObserver() {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;
        
        const chatMessagesObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        // 严格检查是否为非欢迎消息的助手消息
                        if (node.nodeType === 1 && 
                            node.classList.contains('message') && 
                            node.classList.contains('assistant') && 
                            !node.classList.contains('user') && 
                            !node.classList.contains('welcome-message')) {
                            
                            // 检查是否已经有重新生成按钮
                            if (!node.querySelector('.message-actions')) {
                                // 添加重新生成按钮
                                const actionsElement = document.createElement('div');
                                actionsElement.className = 'message-actions';
                                
                                const regenerateButton = document.createElement('button');
                                regenerateButton.className = 'regenerate-button';
                                regenerateButton.title = t('chat.regenerate');
                                
                                // 添加刷新图标
                                regenerateButton.appendChild(createRefreshSvg());
                                
                                actionsElement.appendChild(regenerateButton);
                                node.appendChild(actionsElement);
                                
                                // 添加重新生成功能
                                regenerateButton.addEventListener('click', () => {
                                    regenerateResponse(node);
                                });
                            }
                        }
                    });
                }
            });
        });
        
        // 开始观察
        chatMessagesObserver.observe(chatMessages, { childList: true });
        
        // 为现有的非欢迎消息的助手消息添加重新生成按钮
        document.querySelectorAll('.message.assistant:not(.user):not(.welcome-message)').forEach(node => {
            if (!node.querySelector('.message-actions')) {
                // 添加重新生成按钮
                const actionsElement = document.createElement('div');
                actionsElement.className = 'message-actions';
                
                const regenerateButton = document.createElement('button');
                regenerateButton.className = 'regenerate-button';
                regenerateButton.title = t('chat.regenerate');
                
                // 添加刷新图标
                regenerateButton.appendChild(createRefreshSvg());
                
                actionsElement.appendChild(regenerateButton);
                node.appendChild(actionsElement);
                
                // 添加重新生成功能
                regenerateButton.addEventListener('click', () => {
                    regenerateResponse(node);
                });
            }
        });
        
        // 移除欢迎消息上的重新生成按钮
        document.querySelectorAll('.message.welcome-message .message-actions').forEach(element => {
            element.remove();
        });
    }

    // 重新生成响应函数
    async function regenerateResponse(assistantMessageElement) {
        // 找到前一条用户消息
        let userMessageElement = assistantMessageElement.previousElementSibling;
        
        if (!userMessageElement || !userMessageElement.classList.contains('user')) {
            console.error('Cannot find the user message to regenerate response');
            return;
        }
        
        // 获取用户消息内容
        const userMessageContent = userMessageElement.querySelector('.message-content').textContent;
        
        // 获取助手消息内容元素
        const messageContent = assistantMessageElement.querySelector('.message-content');
        
        // 显示打字指示器
        messageContent.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
        
        // 隐藏重新生成按钮
        const regenerateButton = assistantMessageElement.querySelector('.regenerate-button');
        if (regenerateButton) {
            regenerateButton.style.display = 'none';
        }
        
        try {
            // 获取当前设置
            const settings = await getSettings();
            
            // 收集聊天历史
            const historyMessages = [];
            let currentElement = document.getElementById('chat-messages').firstChild;
            
            // 遍历所有消息元素，直到当前助手消息
            while (currentElement && currentElement !== assistantMessageElement) {
                if (currentElement.classList.contains('message')) {
                    const role = currentElement.classList.contains('user') ? 'user' : 'assistant';
                    const content = currentElement.querySelector('.message-content').textContent;
                    
                    historyMessages.push({
                        role: role,
                        content: content
                    });
                }
                currentElement = currentElement.nextElementSibling;
            }
            
            // 根据默认AI服务选择
            const defaultAI = settings.defaultAI || settings.service || 'ollama';
            
            if (defaultAI === 'openai') {
                // 导入OpenAI服务
                const { sendMessageToOpenAI, parseOpenAIStreamingResponse } = await import('../services/openai-service.js');
                
                try {
                    // 使用OpenAI API
                    const response = await sendMessageToOpenAI(userMessageContent, historyMessages, settings.systemPrompt);
                    
                    // 处理流式响应
                    if (response && response.streaming) {
                        let fullResponse = '';
                        let buffer = ''; // 用于存储可能被截断的数据
                        
                        // 处理流式响应
                        while (true) {
                            try {
                                const { done, value } = await response.reader.read();
                                
                                if (done) {
                                    break;
                                }
                                
                                // 解码响应
                                const chunk = response.decoder.decode(value, { stream: true });
                                buffer += chunk;
                                
                                // 查找完整的数据行
                                const lines = buffer.split('\n');
                                buffer = lines.pop() || ''; // 保留最后一行（可能不完整）
                                
                                for (const line of lines) {
                                    if (line.trim().startsWith('data:')) {
                                        const content = parseOpenAIStreamingResponse(line);
                                        
                                        if (content && typeof content === 'string') {
                                            fullResponse += content;
                                            messageContent.innerHTML = renderMarkdown(fullResponse);
                                            
                                            // 应用代码高亮
                                            if (typeof hljs !== 'undefined') {
                                                try {
                                                    messageContent.querySelectorAll('pre code').forEach((block) => {
                                                        try {
                                                            hljs.highlightElement(block);
                                                        } catch (e) {
                                                            console.debug('Error highlighting code block:', e);
                                                        }
                                                    });
                                                } catch (e) {
                                                    console.debug('Error during code highlighting:', e);
                                                }
                                            }
                                            
                                            // 自动滚动到底部
                                            scrollToBottom();
                                        }
                                    }
                                }
                            } catch (error) {
                                console.error('Error reading stream:', error);
                                break;
                            }
                        }
                        
                        // 处理buffer中可能剩余的数据
                        if (buffer.trim() && buffer.trim().startsWith('data:')) {
                            const content = parseOpenAIStreamingResponse(buffer);
                            
                            if (content && typeof content === 'string') {
                                fullResponse += content;
                                messageContent.innerHTML = renderMarkdown(fullResponse);
                                
                                // 应用代码高亮
                                if (typeof hljs !== 'undefined') {
                                    try {
                                        messageContent.querySelectorAll('pre code').forEach((block) => {
                                            try {
                                                hljs.highlightElement(block);
                                            } catch (e) {
                                                console.debug('Error highlighting code block:', e);
                                            }
                                        });
                                    } catch (e) {
                                        console.debug('Error during code highlighting:', e);
                                    }
                                }
                                
                                // 自动滚动到底部
                                scrollToBottom();
                            }
                        }
                        
                        // 如果没有收到任何内容，显示错误消息
                        if (!fullResponse) {
                            console.error('No content received from OpenAI streaming response');
                            messageContent.innerHTML = '<div class="error-message">Error: No content received from OpenAI</div>';
                        } else {
                            // 将完整的响应添加到聊天历史
                            chatHistory.push({
                                role: 'assistant',
                                content: fullResponse
                            });
                            
                            // 保存聊天历史
                            await saveCurrentChat();
                        }
                    } else if (response) {
                        // 处理非流式响应
                        const responseText = response.fullResponse || response.message || '';
                        
                        // 确保responseText是字符串
                        if (typeof responseText === 'string') {
                            messageContent.innerHTML = renderMarkdown(responseText);
                            
                            // 应用代码高亮
                            if (typeof hljs !== 'undefined') {
                                try {
                                    messageContent.querySelectorAll('pre code').forEach((block) => {
                                        try {
                                            hljs.highlightElement(block);
                                        } catch (e) {
                                            console.debug('Error highlighting code block:', e);
                                        }
                                    });
                                } catch (e) {
                                    console.debug('Error during code highlighting:', e);
                                }
                            }
                            
                            // 将响应添加到聊天历史
                            chatHistory.push({
                                role: 'assistant',
                                content: responseText
                            });
                            
                            // 保存聊天历史
                            await saveCurrentChat();
                        } else {
                            console.error('Invalid response format:', response);
                            messageContent.innerHTML = '<div class="error-message">Error: Invalid response format</div>';
                        }
                    } else {
                        console.error('Empty response from OpenAI');
                        messageContent.innerHTML = '<div class="error-message">Error: Empty response from OpenAI</div>';
                    }
                    
                    // 显示重新生成按钮
                    if (regenerateButton) {
                        regenerateButton.style.display = '';  // 恢复默认显示状态
                    }
                    
                    // 自动滚动到底部
                    scrollToBottom();
                    
                } catch (openaiError) {
                    console.error('Error using OpenAI service:', openaiError);
                    messageContent.innerHTML = `<div class="error-message">Error using OpenAI: ${openaiError.message}</div>`;
                }
            } else {
                // 使用Ollama服务
                // 创建一个更新回调函数
                const updateCallback = (_, fullContent) => {
                    // 确保fullContent是字符串
                    if (typeof fullContent === 'string') {
                        messageContent.innerHTML = renderMarkdown(fullContent);
                        
                        // 应用代码高亮
                        if (typeof hljs !== 'undefined') {
                            try {
                                messageContent.querySelectorAll('pre code').forEach((block) => {
                                    try {
                                        hljs.highlightElement(block);
                                    } catch (e) {
                                        console.debug('Error highlighting code block:', e);
                                    }
                                });
                            } catch (e) {
                                console.debug('Error during code highlighting:', e);
                            }
                        }
                        
                        // 自动滚动到底部
                        scrollToBottom();
                    } else {
                        console.error('Invalid content format in updateCallback:', fullContent);
                    }
                };
                
                try {
                    // 使用Ollama服务
                    const response = await sendMessageToOllama(userMessageContent, historyMessages, updateCallback);
                    
                    // 更新助手消息内容
                    const responseText = response.content || response.message || '';
                    
                    // 确保responseText是字符串
                    if (typeof responseText === 'string') {
                        messageContent.innerHTML = renderMarkdown(responseText);
                        
                        // 应用代码高亮
                        if (typeof hljs !== 'undefined') {
                            try {
                                messageContent.querySelectorAll('pre code').forEach((block) => {
                                    try {
                                        hljs.highlightElement(block);
                                    } catch (e) {
                                        console.debug('Error highlighting code block:', e);
                                    }
                                });
                            } catch (e) {
                                console.debug('Error during code highlighting:', e);
                            }
                        }
                    } else {
                        console.error('Invalid response format from Ollama:', response);
                        messageContent.innerHTML = '<div class="error-message">Error: Invalid response format from Ollama</div>';
                    }
                    
                    // 在处理完Ollama响应后，添加助手消息到聊天历史
                    chatHistory.push({
                        role: 'assistant',
                        content: responseText
                    });
                    
                    // 保存聊天历史
                    await saveCurrentChat();
                    
                } catch (ollamaError) {
                    console.error('Error using Ollama service:', ollamaError);
                    messageContent.innerHTML = `<div class="error-message">Error using Ollama: ${ollamaError.message}</div>`;
                }
            }
            
            // 显示重新生成按钮
            if (regenerateButton) {
                regenerateButton.style.display = '';  // 恢复默认显示状态
            }
            
            // 自动滚动到底部
            scrollToBottom();
            
        } catch (error) {
            console.error('Error regenerating response:', error);
            messageContent.innerHTML = `<div class="error-message">Error regenerating response: ${error.message}</div>`;
            
            // 显示重新生成按钮
            if (regenerateButton) {
                regenerateButton.style.display = '';  // 恢复默认显示状态
            }
            
            // 自动滚动到底部
            scrollToBottom();
        }
    }

    // 滚动到底部函数
    function scrollToBottom() {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            // 使用平滑滚动效果
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    // 在页面加载完成后设置观察器
    document.addEventListener('DOMContentLoaded', () => {
        setupMessageObserver();
    });

    // 如果页面已经加载完成，立即设置观察器
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setupMessageObserver();
    }
} 