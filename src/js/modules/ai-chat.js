// Import the API service and markdown renderer
import { sendMessageToOllama, getSettings } from '../services/ollama-service.js';
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
                        <button id="new-chat-button" class="action-button" data-i18n-title="chat.newChat">
                            <img src="assets/svg/new-chat.svg" alt="New Chat" class="button-icon">
                        </button>
                        <button id="history-button" class="action-button" data-i18n-title="chat.history">
                            <img src="assets/svg/history.svg" alt="History" class="button-icon">
                        </button>
                        <button id="send-button" data-i18n-title="chat.send">
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
        
        // Format message content with markdown
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
        
        messageElement.appendChild(contentElement);
        
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
                    const { reader, decoder } = response;
                    let fullText = '';
                    let buffer = '';
                    
                    while (true) {
                        const { done, value } = await reader.read();
                        
                        if (done) {
                            break;
                        }
                        
                        // Decode chunk
                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;
                        
                        // Process complete lines
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // Keep the last potentially incomplete line
                        
                        for (const line of lines) {
                            if (line.trim()) {
                                const parsed = parseOpenAIStreamingResponse(line);
                                
                                if (!parsed.done && parsed.content) {
                                    fullText += parsed.content;
                                    
                                    // 直接更新 streamingMessageElement 而不是调用 updateAssistantMessage
                                    if (streamingMessageElement) {
                                        // 移除打字指示器
                                        const typingIndicator = streamingMessageElement.querySelector('.typing-indicator');
                                        if (typingIndicator) {
                                            typingIndicator.remove();
                                        }
                                        
                                        // 更新内容
                                        streamingMessageElement.innerHTML = renderMarkdown(fullText);
                                        
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
                                }
                            }
                        }
                    }
                    
                    // Process the last buffer
                    if (buffer.trim()) {
                        const parsed = parseOpenAIStreamingResponse(buffer);
                        if (!parsed.done && parsed.content) {
                            fullText += parsed.content;
                            
                            // 直接更新 streamingMessageElement
                            if (streamingMessageElement) {
                                streamingMessageElement.innerHTML = renderMarkdown(fullText);
                                
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
                        }
                    }
                    
                    // Add to chat history
                    chatHistory.push({
                        role: 'assistant',
                        content: fullText
                    });
                    
                    // Save chat history
                    await saveCurrentChat();
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
                    
                    // Save chat history
                    await saveCurrentChat();
                }
                
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
        }
    }
} 