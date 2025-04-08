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
};

// current settings
let currentSettings = { ...defaultSettings };

// load settings
function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['settings'], (result) => {
            if (result.settings) {
                // merge default settings and stored settings
                currentSettings = { ...defaultSettings, ...result.settings };
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

// listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendMessageToOllama') {
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
                                        const data = JSON.parse(line);
                                        
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
    } else if (request.action === 'getSettings') {
        // return the current settings
        sendResponse(currentSettings);
        return false;
    } else if (request.action === 'updateSettings') {
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
    } else if (request.action === 'fetchTranslation') {
        fetch(request.url)
            .then(response => response.text())
            .then(data => {
                sendResponse({ data: data });
            })
            .catch(error => {
                console.error('Error fetching translation:', error);
                sendResponse({ error: error.message });
            });
        
        // 返回 true 表示将异步发送响应
        return true;
    }
});

// Send message to Ollama with streaming support
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

// add retry logic
let retryCount = 0;
const maxRetries = 3;

async function sendWithRetry() {
    try {
        // send request logic...
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

// listen for extension installation or update events
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        // set default settings
        const defaultSettings = {
            // ... existing default settings ...
            systemPrompt: 'You are a helpful AI assistant. Answer questions concisely and accurately.',
            // ... existing default settings ...
        };
        
        // save default settings
        await chrome.storage.local.set({ settings: defaultSettings });
        console.log('Default settings initialized');
    }
});

// add this at the top of background.js, for suppressing specific JSON parsing error warnings
const originalConsoleWarn = console.warn;
console.warn = function(...args) {
    // filter out specific JSON parsing error warnings
    if (args.length > 0 && 
        typeof args[0] === 'string' && 
        args[0].includes('Error parsing JSON line:')) {
        // log to console, but not as a warning
        console.debug(...args);
        return;
    }
    
    // for other warnings, use the original console.warn
    originalConsoleWarn.apply(console, args);
};