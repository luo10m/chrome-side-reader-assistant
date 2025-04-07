// Set panel behavior to open on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Default settings
const defaultSettings = {
  ollamaUrl: 'http://192.168.5.99:11434/api/generate',
  ollamaModel: 'qwen2.5:7b',
  theme: 'light',
  useProxy: false,
  useStreaming: true
};

// Current settings
let currentSettings = { ...defaultSettings };

// Load settings from storage
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        currentSettings = { ...defaultSettings, ...result.settings };
      }
      resolve(currentSettings);
    });
  });
}

// Save settings to storage
function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, () => {
      currentSettings = settings;
      resolve();
    });
  });
}

// Initialize settings
loadSettings();

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    console.log(`Command received: ${command}`);
    if (command === "_execute_action") {
        // 直接尝试打开侧边栏，不检查是否已打开
        chrome.sidePanel.open().catch((error) => {
            console.error("Error opening side panel:", error);
        });
    }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendMessageToOllama') {
        // 创建一个连接 ID，用于标识这个请求
        const connectionId = Date.now().toString();
        
        // 发送初始响应，包含连接 ID
        sendResponse({ streaming: true, connectionId });
        
        // 设置一个监听器，等待从前端建立的连接
        const connectionListener = (port) => {
            if (port.name === `ollama-stream-${connectionId}`) {
                // 移除监听器，避免内存泄漏
                chrome.runtime.onConnect.removeListener(connectionListener);
                
                // 发送消息到 Ollama
                sendMessageToOllama(request.message, request.history)
                    .then(async ({ reader, decoder, fullResponse, model, streaming }) => {
                        // 如果不是流式响应，直接发送完整响应并关闭连接
                        if (!streaming) {
                            port.postMessage({ 
                                done: true, 
                                content: fullResponse,
                                model: model
                            });
                            port.disconnect();
                            return;
                        }
                        
                        try {
                            // 读取流式响应
                            while (true) {
                                const { done, value } = await reader.read();
                                
                                if (done) {
                                    // 流结束，发送完整响应
                                    port.postMessage({ 
                                        done: true, 
                                        content: fullResponse,
                                        model: model
                                    });
                                    port.disconnect();
                                    break;
                                }
                                
                                // 解码数据块
                                const chunk = decoder.decode(value, { stream: true });
                                
                                try {
                                    // 解析 JSON 行
                                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                                    
                                    for (const line of lines) {
                                        try {
                                            // 尝试解析每一行 JSON
                                            const data = JSON.parse(line);
                                            
                                            if (data.response) {
                                                // 添加到完整响应
                                                fullResponse += data.response;
                                                
                                                // 发送增量更新
                                                port.postMessage({ 
                                                    done: false, 
                                                    content: data.response,
                                                    model: model
                                                });
                                            }
                                        } catch (jsonError) {
                                            // 如果单行解析失败，记录错误但继续处理其他行
                                            console.warn('Error parsing JSON line:', jsonError, line);
                                            // 在处理不完整 JSON 的部分添加更多的匹配模式
                                            if (line.includes('"response":"')) {
                                                // 尝试提取响应内容，即使 JSON 格式不完整
                                                const responseMatch = line.match(/"response":"([^"]*)"/);
                                                if (responseMatch && responseMatch[1]) {
                                                    const response = responseMatch[1];
                                                    fullResponse += response;
                                                    port.postMessage({
                                                        done: false,
                                                        content: response,
                                                        model: model
                                                    });
                                                }
                                            } else if (line.includes('"context":')) {
                                                // 处理上下文信息，可能表示流的结束
                                                port.postMessage({
                                                    done: false,
                                                    content: "",
                                                    model: model
                                                });
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error('Error processing chunk:', e, chunk);
                                }
                            }
                        } catch (error) {
                            console.error('Error reading stream:', error);
                            port.postMessage({ error: error.message });
                            port.disconnect();
                        }
                    })
                    .catch(error => {
                        console.error('Error sending message to Ollama:', error);
                        port.postMessage({ error: error.message });
                        port.disconnect();
                    });
                
                // 监听端口断开
                port.onDisconnect.addListener(() => {
                    console.log('Port disconnected');
                });
            }
        };
        
        // 添加连接监听器
        chrome.runtime.onConnect.addListener(connectionListener);
        
        // 设置超时，如果 5 秒内没有建立连接，则移除监听器
        setTimeout(() => {
            chrome.runtime.onConnect.removeListener(connectionListener);
        }, 5000);
        
        // 返回 true 表示将异步发送响应
        return true;
    } else if (request.action === 'getSettings') {
        // 返回当前设置
        sendResponse(currentSettings);
        return false;
    } else if (request.action === 'updateSettings') {
        // 更新设置
        saveSettings(request.settings)
            .then(() => {
                sendResponse(currentSettings);
            })
            .catch(error => {
                sendResponse({ error: error.message });
            });
        
        // 返回 true 表示将异步发送响应
        return true;
    }
});

// Send message to Ollama with streaming support
async function sendMessageToOllama(message, history) {
    try {
        // Use settings for Ollama URL and model
        let ollamaUrl = currentSettings.ollamaUrl;
        const ollamaModel = currentSettings.ollamaModel;
        const useProxy = currentSettings.useProxy;
        const useStreaming = currentSettings.useStreaming !== false; // 默认启用
        
        // 如果启用了代理，使用 CORS 代理
        if (useProxy) {
            ollamaUrl = `https://cors-anywhere.herokuapp.com/${ollamaUrl}`;
        }
        
        console.log(`Sending request to ${ollamaUrl} with model ${ollamaModel}`);
        
        // 构建提示文本，包含历史消息
        let prompt = "";
        if (history && history.length > 0) {
            for (const msg of history) {
                if (msg.role === 'user') {
                    prompt += `User: ${msg.content}\n`;
                } else if (msg.role === 'assistant') {
                    prompt += `Assistant: ${msg.content}\n`;
                }
            }
        }
        
        // 添加当前消息
        prompt += `User: ${message}\nAssistant:`;
        
        console.log("Formatted prompt:", prompt);
        
        // 使用 fetch API 发送请求
        const response = await fetch(ollamaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: ollamaModel,
                prompt: prompt,
                stream: useStreaming
            })
        });
        
        if (!response.ok) {
            console.error(`Ollama API error: ${response.status}`);
            const errorText = await response.text();
            console.error(`Error details: ${errorText}`);
            throw new Error(`Ollama API error: ${response.status}`);
        }
        
        // 如果不使用流式响应，直接返回完整响应
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
        
        // 读取流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        
        // 返回流式响应所需的对象
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

// 添加重试逻辑
let retryCount = 0;
const maxRetries = 3;

async function sendWithRetry() {
    try {
        // 发送请求逻辑...
    } catch (error) {
        if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retrying (${retryCount}/${maxRetries})...`);
            return await sendWithRetry();
        } else {
            throw error;
        }
    }
}