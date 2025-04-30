# 页面级别的独立对话列表功能设计

您提出的需求是非常合理的增强 - 每个网页维护独立的对话记录，并在切换页面时能正确显示相应的对话历史。这是提升用户体验的重要功能。

## 1. 每个页面如何维护独立的消息列表

### 数据结构设计

```javascript
// 以标签页ID为键，存储每个页面的消息历史
const pageMessagesMap = {
  "tab123": [
    { role: "system", content: "你是一个有帮助的助手..." },
    { role: "assistant", content: "这是页面摘要内容...", type: "summary" },
    { role: "user", content: "对这个页面的提问..." },
    { role: "assistant", content: "对问题的回答..." }
  ],
  "tab456": [ /* 另一个标签页的消息 */ ]
};
```

### 实现方案

1. **初始化标签页关联**：

```javascript
// 当扩展打开或刷新时，获取当前标签页ID
let currentTabId = null;

function initChatForCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      currentTabId = tabs[0].id;
      loadChatHistory(currentTabId);
    }
  });
}
```

1. **标签页切换监听**：

```javascript
// 监听标签页切换
chrome.tabs.onActivated.addListener((activeInfo) => {
  currentTabId = activeInfo.tabId;
  loadChatHistory(currentTabId);
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tabId === currentTabId) {
    // 标签页内容更新完成，可能需要刷新摘要
    checkForSummaryUpdate(tabId, tab.url);
  }
});
```

1. **加载聊天历史函数**：

```javascript
function loadChatHistory(tabId) {
  // 清空当前显示的消息
  chatMessages.innerHTML = '';
  
  // 从存储中获取该标签页的消息历史
  chrome.storage.local.get(['pageMessages_' + tabId], (result) => {
    const messages = result['pageMessages_' + tabId] || [];
    
    // 如果没有历史消息，显示默认欢迎消息
    if (messages.length === 0) {
      addWelcomeMessage();
      return;
    }
    
    // 渲染历史消息
    messages.forEach(msg => {
      addMessageToUI(msg.role, msg.content, msg.type);
    });
  });
}
```

## 2. 聊天消息存储与隔离方案

### 存储方案

1. **使用 Chrome 存储 API**：

```javascript
// 保存聊天记录
function saveChatHistory(tabId, messages) {
  chrome.storage.local.set({
    ['pageMessages_' + tabId]: messages
  }, () => {
    console.log('聊天记录已保存');
  });
}
```

1. **消息添加与更新**：

```javascript
// 添加新消息并保存
function addMessage(role, content, type = null) {
  if (!currentTabId) return;
  
  // 获取当前消息列表
  chrome.storage.local.get(['pageMessages_' + currentTabId], (result) => {
    let messages = result['pageMessages_' + currentTabId] || [];
    
    // 添加新消息
    messages.push({ role, content, type });
    
    // 渲染到UI
    addMessageToUI(role, content, type);
    
    // 保存更新后的消息列表
    saveChatHistory(currentTabId, messages);
  });
}
```

1. **摘要消息特殊处理**：

```javascript
// 更新或添加摘要消息
function updateSummary(tabId, summaryContent) {
  chrome.storage.local.get(['pageMessages_' + tabId], (result) => {
    let messages = result['pageMessages_' + tabId] || [];
    
    // 查找现有摘要消息
    const summaryIndex = messages.findIndex(m => m.role === 'assistant' && m.type === 'summary');
    
    if (summaryIndex >= 0) {
      // 更新现有摘要
      messages[summaryIndex].content = summaryContent;
    } else {
      // 添加新摘要（放在系统消息之后，如果有的话）
      const systemIndex = messages.findIndex(m => m.role === 'system');
      if (systemIndex >= 0) {
        messages.splice(systemIndex + 1, 0, { 
          role: 'assistant', 
          content: summaryContent, 
          type: 'summary' 
        });
      } else {
        messages.unshift({ 
          role: 'assistant', 
          content: summaryContent, 
          type: 'summary' 
        });
      }
    }
    
    // 保存更新后的消息列表
    saveChatHistory(tabId, messages);
    
    // 如果是当前标签页，刷新UI
    if (tabId === currentTabId) {
      loadChatHistory(tabId);
    }
  });
}
```

## 3. 其他重要补充

### 性能与存储优化

1. **消息长度限制**：

```javascript
// 限制每个标签页最多保存的消息数量
const MAX_MESSAGES_PER_TAB = 50;

function trimMessagesIfNeeded(messages) {
  if (messages.length > MAX_MESSAGES_PER_TAB) {
    // 保留系统消息和摘要
    const systemMessages = messages.filter(m => m.role === 'system' || m.type === 'summary');
    const otherMessages = messages.filter(m => m.role !== 'system' && m.type !== 'summary');
    
    // 只保留最新的对话
    const trimmedOtherMessages = otherMessages.slice(-MAX_MESSAGES_PER_TAB + systemMessages.length);
    
    return [...systemMessages, ...trimmedOtherMessages];
  }
  return messages;
}
```

1. **数据清理机制**：

```javascript
// 定期清理长时间未访问的标签页数据
function cleanupUnusedTabData() {
  const RETENTION_DAYS = 7; // 保留7天内访问过的标签页数据
  
  chrome.storage.local.get(null, (items) => {
    const now = Date.now();
    for (const key in items) {
      if (key.startsWith('pageMessages_')) {
        const lastAccessed = items[key + '_lastAccessed'] || 0;
        if (now - lastAccessed > RETENTION_DAYS * 24 * 60 * 60 * 1000) {
          chrome.storage.local.remove([key, key + '_lastAccessed']);
        }
      }
    }
  });
}

// 记录访问时间
function updateAccessTime(tabId) {
  chrome.storage.local.set({
    ['pageMessages_' + tabId + '_lastAccessed']: Date.now()
  });
}
```

### 用户体验增强

1. **会话持久性指示**：

```javascript
// 在UI上显示当前会话状态
function updateSessionStatus() {
  const statusElement = document.getElementById('session-status');
  if (statusElement) {
    chrome.storage.local.get(['pageMessages_' + currentTabId], (result) => {
      const messages = result['pageMessages_' + currentTabId] || [];
      if (messages.length > 0) {
        statusElement.textContent = `已保存 ${messages.length} 条消息`;
        statusElement.classList.add('active');
      } else {
        statusElement.textContent = '新会话';
        statusElement.classList.remove('active');
      }
    });
  }
}
```

1. **会话管理功能**：

```javascript
// 添加清除当前会话按钮
function setupSessionControls() {
  const clearButton = document.getElementById('clear-session');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (confirm('确定要清除当前页面的所有聊天记录吗？')) {
        chrome.storage.local.remove(['pageMessages_' + currentTabId], () => {
          chatMessages.innerHTML = '';
          addWelcomeMessage();
          updateSessionStatus();
        });
      }
    });
  }
}
```

### 摘要与聊天集成

1. **摘要作为上下文**：

```javascript
// 发送消息到API时包含摘要作为上下文
function sendMessageToAPI(userMessage) {
  chrome.storage.local.get(['pageMessages_' + currentTabId], (result) => {
    const messages = result['pageMessages_' + currentTabId] || [];
    
    // 查找摘要消息
    const summaryMessage = messages.find(m => m.type === 'summary');
    
    // 构建发送到API的消息列表
    let apiMessages = [];
    
    // 添加系统消息
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      apiMessages.push(systemMessage);
    }
    
    // 添加摘要作为上下文
    if (summaryMessage) {
      apiMessages.push({
        role: 'system',
        content: `以下是当前页面的摘要，请将其作为回答用户问题的背景：\n${summaryMessage.content}`
      });
    }
    
    // 添加最近的几轮对话
    const recentMessages = messages
      .filter(m => m.type !== 'summary' && m.role !== 'system')
      .slice(-6); // 只取最近3轮对话
    
    apiMessages = [...apiMessages, ...recentMessages, { role: 'user', content: userMessage }];
    
    // 发送到API
    // ...API调用代码...
  });
}
```

1. **页面内容变化重新摘要**：

```javascript
// 检测页面内容变化并更新摘要
function checkForSummaryUpdate(tabId, currentUrl) {
  chrome.storage.local.get(['pageLastUrl_' + tabId], (result) => {
    const lastUrl = result['pageLastUrl_' + tabId];
    
    // URL变化了，需要重新生成摘要
    if (lastUrl !== currentUrl) {
      // 保存新URL
      chrome.storage.local.set({ ['pageLastUrl_' + tabId]: currentUrl });
      
      // 显示摘要按钮并允许用户主动更新摘要
      updateSummaryButtonStatus(true);
      
      // 可选: 自动开始生成新页面的摘要
      // startSummarize();
    }
  });
}
```

## 技术实现步骤

1. 修改数据存储结构，使用 Chrome Storage API 存储每个标签页的消息
2. 添加标签页监听器，在切换或更新标签页时加载相应的消息
3. 更新摘要生成逻辑，将摘要作为特殊类型的助手消息存储
4. 实现消息管理功能，包括添加、更新和清理
5. 增强用户界面，显示会话状态和提供管理控件

这个方案将确保每个网页都有独立的对话上下文，并在用户在不同标签页之间切换时保持状态的连续性，大大提升使用体验。

## 4. 页面切换时的side panel处理

当用户从已打开side panel的页面切换到另一个页面时，需要正确处理side panel的状态和内容：

### 保持side panel状态

```javascript
// 在标签页切换事件中维持side panel打开状态
chrome.tabs.onActivated.addListener((activeInfo) => {
  currentTabId = activeInfo.tabId;
  
  // 加载新页面的聊天历史
  loadChatHistory(currentTabId);
  
  // 不关闭side panel，保持其可见性
});
```

### 加载新页面聊天记录时的用户体验优化

```javascript
// 在loadChatHistory函数中添加状态指示
function loadChatHistory(tabId) {
  // 显示加载状态
  showLoadingIndicator();
  
  // 清空当前显示的消息
  chatMessages.innerHTML = '';
  
  // 从存储中获取该标签页的消息历史
  chrome.storage.local.get(['pageMessages_' + tabId], (result) => {
    const messages = result['pageMessages_' + tabId] || [];
    
    // 隐藏加载状态
    hideLoadingIndicator();
    
    // 如果没有历史消息，自动请求生成摘要
    if (messages.length === 0) {
      generatePageSummary(tabId);
      return;
    }
    
    // 渲染历史消息
    messages.forEach(msg => {
      addMessageToUI(msg.role, msg.content, msg.type);
    });
  });
}

// 加载指示器相关函数
function showLoadingIndicator() {
  const loader = document.getElementById('chat-loading') || createLoadingElement();
  loader.style.display = 'flex';
}

function hideLoadingIndicator() {
  const loader = document.getElementById('chat-loading');
  if (loader) loader.style.display = 'none';
}

function createLoadingElement() {
  const loader = document.createElement('div');
  loader.id = 'chat-loading';
  loader.className = 'chat-loading';
  loader.innerHTML = '<div class="spinner"></div><p>正在加载对话...</p>';
  document.querySelector('.chat-container').appendChild(loader);
  return loader;
}
```

### 视觉样式一致性

为确保用户在页面切换时获得一致的体验：

1. 保持side panel的大小、位置和视觉样式不变
2. 在切换页面时保留滚动位置或自动滚动到合适位置（如新摘要的开始处）
3. 确保各控件的状态适当更新（如清空输入框）

通过以上处理，用户在不同页面间切换时，side panel会自然地跟随切换到对应页面的对话上下文，提供流畅的使用体验。

## 5. 其他重要补充