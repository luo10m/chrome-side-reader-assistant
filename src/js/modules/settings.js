import { getSettings, updateSettings } from '../services/ollama-service.js';
import { t, getCurrentLanguage, loadLanguage, getAvailableLanguages } from '../utils/i18n.js';

// Load settings
export async function loadSettings(container) {
    // 先获取设置，然后再创建 HTML
    const settings = await getSettings();
    
    // Get language options
    const languageOptions = await generateLanguageOptions();
    
    // Create settings UI with tabs
    const systemPromptTabHtml = `
    <div class="tab-content" id="system-prompt-tab">
        <div class="settings-section">
            <h3 data-i18n="settings.sections.systemPrompt.title">系统提示词</h3>
            
            <div class="prompt-cards-container">
                <!-- 卡片列表将动态生成 -->
            </div>
            
            <div class="prompt-actions">
                <button id="add-prompt-card" class="settings-button">
                    <img src="assets/svg/plus.svg" alt="Add" class="button-icon">
                    <span data-i18n="settings.sections.systemPrompt.addNew">添加新提示词</span>
                </button>
            </div>
        </div>
    </div>
    `;

    container.innerHTML = `
        <div class="settings-container">
            <div class="settings-header">
                <h2 data-i18n="settings.header">Settings</h2>
            </div>
            
            <div class="settings-tabs">
                <button class="tab-button active" data-tab="general" data-i18n="settings.tabs.general">General</button>
                <button class="tab-button" data-tab="ollama" data-i18n="settings.tabs.ollama">Ollama</button>
                <button class="tab-button" data-tab="openai" data-i18n="settings.tabs.openai">OpenAI</button>
                <button class="tab-button" data-tab="system-prompt" data-i18n="settings.tabs.systemPrompt">System Prompt</button>
            </div>
            
            <div class="settings-content">
                <!-- General Tab -->
                <div class="tab-content active" id="general-tab">
                    <div class="settings-section">
                        <h3 data-i18n="settings.sections.appearance.title">Appearance</h3>
                        <div class="settings-item">
                            <label data-i18n="settings.sections.appearance.theme.label">Theme</label>
                            <div class="settings-control">
                                <select id="theme-select">
                                    <option value="light" data-i18n="settings.sections.appearance.theme.light">Light</option>
                                    <option value="dark" data-i18n="settings.sections.appearance.theme.dark">Dark</option>
                                </select>
                            </div>
                        </div>
                        <div class="settings-item">
                            <label data-i18n="settings.sections.appearance.language.label">Language</label>
                            <div class="settings-control">
                                <select id="language-select">
                                    ${languageOptions}
                                </select>
                            </div>
                        </div>
                        <div class="settings-item">
                            <h3 data-i18n="settings.sections.defaultAI.title">AI Settings</h3>
                            <div class="settings-item">
                                <label for="default-ai-select" data-i18n="settings.sections.defaultAI.label">Default AI Provider</label>
                                <div class="settings-control">
                                    <select id="default-ai-select">
                                        <option value="ollama" ${settings.defaultAI === 'ollama' ? 'selected' : ''} data-i18n="settings.sections.defaultAI.options.ollama">Ollama</option>
                                        <option value="openai" ${settings.defaultAI === 'openai' ? 'selected' : ''} data-i18n="settings.sections.defaultAI.options.openai">OpenAI</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="settings-item checkbox-item">
                            <label>
                                <input type="checkbox" id="load-last-chat-checkbox">
                                <span data-i18n="settings.sections.appearance.loadLastChat">Load last chat on startup</span>
                            </label>
                        </div>
                    </div>
                </div>
                
                <!-- Ollama Tab -->
                <div class="tab-content" id="ollama-tab">
                    <div class="settings-section">
                        <h3 data-i18n="settings.sections.ollama.title">Ollama Settings</h3>
                        <div class="settings-item">
                            <label data-i18n="settings.sections.ollama.url.label">Ollama URL</label>
                            <div class="url-input-container">
                                <div class="url-part">
                                    <label for="ollama-host" class="small-label" data-i18n="settings.sections.ollama.url.host">Host</label>
                                    <input type="text" id="ollama-host" placeholder="http://192.168.5.99">
                                </div>
                                <div class="url-part small">
                                    <label for="ollama-port" class="small-label" data-i18n="settings.sections.ollama.url.port">Port</label>
                                    <input type="text" id="ollama-port" placeholder="11434">
                                </div>
                                <div class="url-part">
                                    <label for="ollama-path" class="small-label" data-i18n="settings.sections.ollama.url.path">Path</label>
                                    <input type="text" id="ollama-path" placeholder="/api/generate">
                                </div>
                            </div>
                        </div>
                        <div class="settings-item">
                            <label for="ollama-model" data-i18n="settings.sections.ollama.model.label">Ollama Model</label>
                            <div class="model-select-container">
                                <select id="ollama-model" disabled>
                                    <option value="" data-i18n="settings.sections.ollama.model.loading">Loading models...</option>
                                </select>
                                <button id="refresh-models" class="icon-button" data-i18n-title="settings.buttons.refresh">
                                    <img src="assets/svg/refresh.svg" alt="Refresh" class="button-icon">
                                </button>
                            </div>
                        </div>
                        <div class="settings-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="use-proxy">
                                <span data-i18n="settings.sections.ollama.proxy">Use CORS proxy (try this if you get 403 errors)</span>
                            </label>
                        </div>
                        <div class="settings-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="use-streaming" checked>
                                <span data-i18n="settings.sections.ollama.streaming">Enable streaming responses</span>
                            </label>
                        </div>
                        <button id="test-connection" class="settings-button" data-i18n="settings.buttons.testConnection">Test Connection</button>
                        <button id="test-api" class="settings-button" data-i18n="settings.buttons.testApi">Test API</button>
                        <div id="connection-status" class="connection-status"></div>
                    </div>
                </div>
                
                <!-- OpenAI Tab -->
                <div class="tab-content" id="openai-tab">
                    <div class="settings-section">
                        <h3 data-i18n="settings.sections.openai.title">OpenAI Settings</h3>
                        
                        <div class="settings-item">
                            <label for="openai-api-key" data-i18n="settings.sections.openai.apiKey.label">API Key</label>
                            <div class="settings-control">
                                <input type="text" id="openai-api-key" placeholder="sk-..." value="${settings.openaiApiKey || ''}">
                            </div>
                        </div>
                        
                        <div class="settings-item">
                            <label for="openai-base-url" data-i18n="settings.sections.openai.baseUrl.label">Base URL (Optional)</label>
                            <div class="settings-control">
                                <input type="text" id="openai-base-url" placeholder="https://api.openai.com/v1" value="${settings.openaiBaseUrl || ''}">
                            </div>
                        </div>
                        
                        <div class="settings-item">
                            <label for="openai-model-select" data-i18n="settings.sections.openai.model.label">Model</label>
                            <div class="model-select-container">
                                <select id="openai-model-select">
                                    <option value="" data-i18n="settings.sections.openai.model.placeholder">Select a model</option>
                                    <option value="gpt-3.5-turbo" ${settings.openaiModel === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
                                    <option value="gpt-4" ${settings.openaiModel === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
                                    <option value="gpt-4-turbo" ${settings.openaiModel === 'gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo</option>
                                    <option value="custom" ${settings.openaiModel === 'custom' ? 'selected' : ''}>Custom</option>
                                </select>
                                <button id="refresh-openai-models" class="icon-button" data-i18n-title="settings.buttons.refresh">
                                    <img src="assets/svg/refresh.svg" alt="Refresh" class="button-icon">
                                </button>
                            </div>
                        </div>

                        <div class="settings-item">
                            <label for="openai-custom-model" data-i18n="settings.sections.openai.customModel.label">Custom Model</label>
                            <div class="settings-control">
                                <input type="text" id="openai-custom-model" placeholder="custom-model-name" value="${settings.openaiCustomModel || ''}">
                            </div>
                        </div>
                        
                        <div class="settings-item">
                            <button id="test-openai-connection" class="settings-button" data-i18n="settings.buttons.testConnection">Test Connection</button>
                            <div id="openai-connection-status" class="settings-status"></div>
                        </div>
                    </div>
                </div>
                
                ${systemPromptTabHtml}
            </div>
        </div>
        
        <div class="settings-actions">
            <button id="reset-settings" class="settings-button secondary" data-i18n-title="settings.buttons.reset">
                <img src="assets/svg/reset.svg" alt="Reset" class="button-icon">
            </button>
            <button id="save-settings" class="settings-button primary" data-i18n="settings.buttons.save">Save Settings</button>
        </div>
    `;
    
    // 添加选项卡切换功能
    const tabButtons = container.querySelectorAll('.tab-button');
    const tabContents = container.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // 移除所有选项卡的活动状态
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.style.display = 'none');
            
            // 激活当前选项卡
            button.classList.add('active');
            document.getElementById(`${tabId}-tab`).style.display = 'block';
        });
    });
    
    // Get DOM elements
    const ollamaHostInput = document.getElementById('ollama-host');
    const ollamaPortInput = document.getElementById('ollama-port');
    const ollamaPathInput = document.getElementById('ollama-path');
    const ollamaModelSelect = document.getElementById('ollama-model');
    const refreshModelsButton = document.getElementById('refresh-models');
    const themeSelect = document.getElementById('theme-select');
    const languageSelect = document.getElementById('language-select');
    const testConnectionButton = document.getElementById('test-connection');
    const connectionStatus = document.getElementById('connection-status');
    const saveSettingsButton = document.getElementById('save-settings');
    const useProxyCheckbox = document.getElementById('use-proxy');
    const testApiButton = document.getElementById('test-api');
    const useStreamingCheckbox = document.getElementById('use-streaming');
    const systemPromptTextarea = document.getElementById('system-prompt');
    const resetSettingsButton = document.getElementById('reset-settings');
    const loadLastChatCheckbox = document.getElementById('load-last-chat-checkbox');
    const defaultAI = document.getElementById('default-ai-select');
    
    // Set current language
    languageSelect.value = getCurrentLanguage();
    
    // Language change event
    languageSelect.addEventListener('change', async () => {
        await loadLanguage(languageSelect.value);
    });
    
    // Load current settings
    getSettings().then(settings => {
        // Parse URL
        if (settings.ollamaUrl) {
            try {
                const url = new URL(settings.ollamaUrl);
                ollamaHostInput.value = `${url.protocol}//${url.hostname}`;
                ollamaPortInput.value = url.port || '11434';
                ollamaPathInput.value = url.pathname || '/api/generate';
            } catch (e) {
                // If URL parsing fails, use default values
                ollamaHostInput.value = 'http://192.168.5.99';
                ollamaPortInput.value = '11434';
                ollamaPathInput.value = '/api/generate';
            }
        } else {
            ollamaHostInput.value = 'http://192.168.5.99';
            ollamaPortInput.value = '11434';
            ollamaPathInput.value = '/api/generate';
        }
        
        themeSelect.value = settings.theme || 'light';
        useProxyCheckbox.checked = settings.useProxy || false;
        useStreamingCheckbox.checked = settings.useStreaming !== false;
        loadLastChatCheckbox.checked = settings.loadLastChat !== false;
        
        // Build full URL
        const fullUrl = `${ollamaHostInput.value}:${ollamaPortInput.value}${ollamaPathInput.value}`;
        
        // Load model list
        fetchModelList(fullUrl, useProxyCheckbox.checked, settings.ollamaModel);
        
        // 初始化系统提示词卡片功能
        initSystemPrompts(settings);
        
        // Set default AI
        document.getElementById('default-ai-select').value = settings.defaultAI || 'ollama';
    });
    
    // When URL parts change, refresh model list
    function updateModelListFromUrlChange() {
        const fullUrl = `${ollamaHostInput.value}:${ollamaPortInput.value}${ollamaPathInput.value}`;
        const currentModel = ollamaModelSelect.value;
        fetchModelList(fullUrl, useProxyCheckbox.checked, currentModel);
    }
    
    ollamaHostInput.addEventListener('change', updateModelListFromUrlChange);
    ollamaPortInput.addEventListener('change', updateModelListFromUrlChange);
    ollamaPathInput.addEventListener('change', updateModelListFromUrlChange);
    
    // Refresh model list button
    refreshModelsButton.addEventListener('click', () => {
        // Save current selected model
        const currentModel = ollamaModelSelect.value;
        fetchModelList(ollamaHostInput.value + ':' + ollamaPortInput.value + ollamaPathInput.value, useProxyCheckbox.checked, currentModel);
    });
    
    // Fetch model list
    async function fetchModelList(url, useProxy, selectedModel) {
        if (!url) {
            ollamaModelSelect.innerHTML = `<option value="">${t('settings.sections.ollama.model.placeholder')}</option>`;
            ollamaModelSelect.disabled = true;
            return;
        }
        
        // Save current selected model (if any)
        const currentSelectedModel = ollamaModelSelect.value || selectedModel;
        
        ollamaModelSelect.innerHTML = `<option value="">${t('settings.sections.ollama.model.loading')}</option>`;
        ollamaModelSelect.disabled = true;
        
        try {
            // Build model list API URL
            let modelListUrl = url.replace('/api/chat', '').replace('/api/generate', '');
            if (!modelListUrl.endsWith('/')) {
                modelListUrl += '/';
            }
            modelListUrl += 'api/tags';
            
            console.log('Fetching model list from:', modelListUrl);
            
            // If proxy is enabled, use CORS proxy
            if (useProxy) {
                modelListUrl = `https://cors-anywhere.herokuapp.com/${modelListUrl}`;
                console.log('Using CORS proxy, URL:', modelListUrl);
            }
            
            // 使用 AbortController 设置超时
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
            
            try {
                const response = await fetch(modelListUrl, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                });
                
                // 清除超时
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.models && Array.isArray(data.models) && data.models.length > 0) {
                        // Clear selection
                        ollamaModelSelect.innerHTML = '';
                        
                        // Add model options
                        data.models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model.name;
                            option.textContent = `${model.name} (${formatSize(model.size)})`;
                            ollamaModelSelect.appendChild(option);
                        });
                        
                        // Try to restore previously selected model
                        if (currentSelectedModel && ollamaModelSelect.querySelector(`option[value="${currentSelectedModel}"]`)) {
                            ollamaModelSelect.value = currentSelectedModel;
                        }
                        
                        ollamaModelSelect.disabled = false;
                    } else {
                        ollamaModelSelect.innerHTML = `<option value="">${t('settings.sections.ollama.model.empty')}</option>`;
                        ollamaModelSelect.disabled = true;
                    }
                } else {
                    const errorText = await response.text();
                    console.error('Error response from API:', response.status, errorText);
                    ollamaModelSelect.innerHTML = `<option value="">${t('settings.sections.ollama.model.error')}: ${response.status} ${response.statusText}</option>`;
                    ollamaModelSelect.disabled = true;
                }
            } catch (fetchError) {
                // 清除超时
                clearTimeout(timeoutId);
                throw fetchError; // 重新抛出错误，由外层 catch 处理
            }
        } catch (error) {
            console.error('Error fetching model list:', error);
            
            let errorMessage = '';
            
            // 提供更具体的错误信息
            if (error instanceof DOMException) {
                if (error.name === 'AbortError') {
                    errorMessage = '请求超时，请检查 Ollama 服务是否正在运行';
                } else {
                    errorMessage = `${error.name}: ${error.message}`;
                }
            } else if (error.name === 'AbortError') {
                errorMessage = '请求超时，请检查 Ollama 服务是否正在运行';
            } else if (error.message && error.message.includes('Failed to fetch')) {
                errorMessage = '无法连接到 Ollama 服务，请检查 URL 和网络连接';
            } else if (error.message && error.message.includes('NetworkError')) {
                errorMessage = '网络错误，可能是 CORS 问题，请尝试启用代理';
            } else if (error.toString) {
                // 尝试获取更有意义的错误信息
                errorMessage = error.toString();
            } else {
                // 如果无法获取有意义的错误信息，使用通用消息
                errorMessage = '连接服务器时出错，请检查网络和服务器状态';
            }
            
            ollamaModelSelect.innerHTML = `<option value="">${t('settings.sections.ollama.model.error')}: ${errorMessage}</option>`;
            ollamaModelSelect.disabled = true;
        }
    }
    
    // Format model size
    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Test connection
    testConnectionButton.addEventListener('click', async () => {
        connectionStatus.textContent = t('settings.status.testing');
        connectionStatus.className = 'connection-status testing';
        
        try {
            // Build test URL
            let testUrl = ollamaHostInput.value + ':' + ollamaPortInput.value;
            
            // Make sure URL ends with /api/version
            if (!testUrl.includes('/api/version')) {
                testUrl = testUrl.replace(/\/$/, '') + '/api/version';
            }
            
            // If proxy is enabled, use CORS proxy
            if (useProxyCheckbox.checked) {
                testUrl = `https://cors-anywhere.herokuapp.com/${testUrl}`;
            }
            
            const response = await fetch(testUrl, {
                method: 'GET'
            });
            
            if (response.ok) {
                const data = await response.json();
                connectionStatus.textContent = t('settings.status.success', { version: data.version });
                connectionStatus.className = 'connection-status success';
                
                // Save current selected model
                const currentModel = ollamaModelSelect.value;
                // Refresh model list
                fetchModelList(ollamaHostInput.value + ':' + ollamaPortInput.value + ollamaPathInput.value, useProxyCheckbox.checked, currentModel);
            } else {
                connectionStatus.textContent = t('settings.status.error', { error: `${response.status} ${response.statusText}` });
                connectionStatus.className = 'connection-status error';
            }
        } catch (error) {
            connectionStatus.textContent = t('settings.status.error', { error: error.message });
            connectionStatus.className = 'connection-status error';
        }
    });
    
    // Test API
    testApiButton.addEventListener('click', async () => {
        connectionStatus.textContent = t('settings.status.apiTesting');
        connectionStatus.className = 'connection-status testing';
        
        try {
            let apiUrl = ollamaHostInput.value + ':' + ollamaPortInput.value + ollamaPathInput.value;
            const model = ollamaModelSelect.value;
            
            if (!model) {
                connectionStatus.textContent = t('settings.status.selectModel');
                connectionStatus.className = 'connection-status error';
                return;
            }
            
            // If proxy is enabled, use CORS proxy
            if (useProxyCheckbox.checked) {
                apiUrl = `https://cors-anywhere.herokuapp.com/${apiUrl}`;
            }
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: "Hello, how are you?",
                    stream: false
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                connectionStatus.textContent = t('settings.status.apiSuccess', { response: data.response || JSON.stringify(data) });
                connectionStatus.className = 'connection-status success';
            } else {
                const errorText = await response.text();
                connectionStatus.textContent = t('settings.status.apiError', { error: `${response.status} ${response.statusText} - ${errorText}` });
                connectionStatus.className = 'connection-status error';
            }
        } catch (error) {
            connectionStatus.textContent = t('settings.status.apiError', { error: error.message });
            connectionStatus.className = 'connection-status error';
        }
    });
    
    // Show notification message
    function showNotification(container, message, type = 'success') {
        // Remove existing notifications
        const existingMessages = document.querySelectorAll('.settings-message');
        existingMessages.forEach(msg => msg.remove());
        
        // Create new notification
        const notification = document.createElement('div');
        notification.className = `settings-message ${type}`;
        notification.textContent = message;
        
        // Add to document, not container
        document.body.appendChild(notification);
        
        // Remove message after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    // Save settings
    saveSettingsButton.addEventListener('click', async () => {
        // Build full URL
        const fullUrl = `${ollamaHostInput.value}:${ollamaPortInput.value}${ollamaPathInput.value}`;
        
        const newSettings = {
            ollamaUrl: fullUrl,
            ollamaModel: ollamaModelSelect.value,
            theme: themeSelect.value,
            language: languageSelect.value,
            useProxy: useProxyCheckbox.checked,
            useStreaming: useStreamingCheckbox.checked,
            loadLastChat: loadLastChatCheckbox.checked,
            systemPrompt: systemPromptTextarea.value,
            defaultAI: document.getElementById('default-ai-select').value,
            openaiApiKey: document.getElementById('openai-api-key').value.trim(),
            openaiBaseUrl: document.getElementById('openai-base-url').value.trim(),
            openaiModel: document.getElementById('openai-model-select').value,
            openaiCustomModel: document.getElementById('openai-custom-model').value.trim(),
        };
        
        try {
            await updateSettings(newSettings);
            
            // Show success message
            showNotification(container, t('settings.notifications.saved'), 'success');
            
            // Apply theme
            document.documentElement.setAttribute('data-theme', newSettings.theme);
            
            // Update code highlight theme
            updateCodeHighlightTheme(newSettings.theme);
            
            // If language has changed, load new language
            if (newSettings.language !== getCurrentLanguage()) {
                console.log(`Changing language from ${getCurrentLanguage()} to ${newSettings.language}`);
                await loadLanguage(newSettings.language);
            }
        } catch (error) {
            // Show error message
            showNotification(container, t('settings.notifications.error', { error: error.message }), 'error');
        }
    });

    // 重置设置按钮点击事件
    resetSettingsButton.addEventListener('click', async () => {
        // 显示确认对话框
        if (confirm(t('settings.confirmations.reset'))) {
            try {
                // 发送重置设置请求
                const resetSettings = await updateSettings({
                    reset: true  // 特殊标记，表示重置设置
                });
                
                // 不重新加载页面，而是更新当前页面的设置
                if (resetSettings) {
                    // 更新 URL 输入框
                    try {
                        const url = new URL(resetSettings.ollamaUrl);
                        ollamaHostInput.value = `${url.protocol}//${url.hostname}`;
                        ollamaPortInput.value = url.port || '11434';
                        ollamaPathInput.value = url.pathname || '/api/generate';
                    } catch (e) {
                        ollamaHostInput.value = 'http://192.168.5.99';
                        ollamaPortInput.value = '11434';
                        ollamaPathInput.value = '/api/generate';
                    }
                    
                    // 更新其他设置
                    themeSelect.value = resetSettings.theme || 'light';
                    languageSelect.value = resetSettings.language || 'en';
                    useProxyCheckbox.checked = resetSettings.useProxy || false;
                    useStreamingCheckbox.checked = resetSettings.useStreaming !== false;
                    loadLastChatCheckbox.checked = resetSettings.loadLastChat !== false;
                    systemPromptTextarea.value = resetSettings.systemPrompt || '';
                    defaultAI.value = resetSettings.defaultAI || 'ollama';
                    openaiApiKey.value = resetSettings.openaiApiKey || '';
                    openaiBaseUrl.value = resetSettings.openaiBaseUrl || 'https://api.openai.com/v1';
                    openaiModelSelect.value = resetSettings.openaiModel || 'gpt-3.5-turbo';
                    openaiCustomModel.value = resetSettings.openaiCustomModel || '';

                    // 更新模型列表
                    const fullUrl = `${ollamaHostInput.value}:${ollamaPortInput.value}${ollamaPathInput.value}`;
                    fetchModelList(fullUrl, useProxyCheckbox.checked, resetSettings.ollamaModel);
                    
                    // 应用主题
                    document.documentElement.setAttribute('data-theme', resetSettings.theme);
                    updateCodeHighlightTheme(resetSettings.theme);
                    
                    // 如果语言已更改，加载新语言
                    if (resetSettings.language !== getCurrentLanguage()) {
                        await loadLanguage(resetSettings.language);
                    }
                    
                    // 显示成功消息
                    showNotification(container, t('settings.notifications.resetSuccess'), 'success');
                }
            } catch (error) {
                // 显示错误消息
                showNotification(container, t('settings.notifications.resetError', { error: error.message }), 'error');
            }
        }
    });

    // 在设置加载时添加主题变化监听
    const resetButton = document.getElementById('reset-settings');
    const resetIcon = resetButton.querySelector('img');

    // 初始设置图标
    updateResetIcon(document.documentElement.getAttribute('data-theme'));

    // 监听主题变化
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                const theme = document.documentElement.getAttribute('data-theme');
                updateResetIcon(theme);
            }
        });
    });

    observer.observe(document.documentElement, { attributes: true });

    // 更新重置图标
    function updateResetIcon(theme) {
        if (theme === 'dark') {
            resetIcon.src = 'assets/svg/reset-dark.svg';
        } else {
            resetIcon.src = 'assets/svg/reset.svg';
        }
    }

    // 获取 OpenAI 相关元素
    const openaiTab = document.getElementById('openai-tab');
    const openaiSection = document.getElementById('openai-section');
    const openaiApiKey = document.getElementById('openai-api-key');
    const openaiBaseUrl = document.getElementById('openai-base-url');
    const openaiModelSelect = document.getElementById('openai-model-select');
    const refreshOpenAIModels = document.getElementById('refresh-openai-models');
    const testOpenAIConnection = document.getElementById('test-openai-connection');
    const openaiConnectionStatus = document.getElementById('openai-connection-status');
    const openaiCustomModel = document.getElementById('openai-custom-model');
    // 刷新 OpenAI 模型列表
    refreshOpenAIModels.addEventListener('click', async () => {
        const apiKey = openaiApiKey.value.trim();
        const baseUrl = openaiBaseUrl.value.trim();
        
        if (!apiKey) {
            openaiConnectionStatus.innerHTML = `<span class="error">${t('settings.sections.openai.model.error')}</span>`;
            return;
        }
        
        try {
            openaiConnectionStatus.innerHTML = `<span class="loading">${t('settings.sections.openai.model.loading')}</span>`;
            
            // 导入 getOpenAIModels 函数
            const { getOpenAIModels } = await import('../services/openai-service.js');
            
            // 获取模型列表
            const models = await getOpenAIModels(apiKey, baseUrl);
            
            // 清空现有选项
            openaiModelSelect.innerHTML = `<option value="" data-i18n="settings.sections.openai.model.placeholder">Select a model</option>`;
            
            // 添加模型选项
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                
                if (settings.openaiModel === model.id) {
                    option.selected = true;
                }
                
                openaiModelSelect.appendChild(option);
            });
            
            openaiConnectionStatus.innerHTML = '';
        } catch (error) {
            console.error('Error fetching OpenAI models:', error);
            openaiConnectionStatus.innerHTML = `<span class="error">${t('settings.sections.openai.model.error')}: ${error.message}</span>`;
        }
    });
    
    // 测试 OpenAI 连接
    testOpenAIConnection.addEventListener('click', async () => {
        const apiKey = openaiApiKey.value.trim();
        const baseUrl = openaiBaseUrl.value.trim();
        
        if (!apiKey) {
            openaiConnectionStatus.innerHTML = `<span class="error">${t('settings.sections.openai.apiKey.error')}</span>`;
            return;
        }
        
        try {
            openaiConnectionStatus.innerHTML = `<span class="loading">${t('settings.status.testing')}</span>`;
            
            // 导入 testOpenAIConnection 函数
            const { testOpenAIConnection } = await import('../services/openai-service.js');
            
            // 测试连接
            const result = await testOpenAIConnection(apiKey, baseUrl);
            
            openaiConnectionStatus.innerHTML = `<span class="success">${t('settings.status.success').replace('{version}', 'OpenAI')}</span>`;
        } catch (error) {
            console.error('Error testing OpenAI connection:', error);
            openaiConnectionStatus.innerHTML = `<span class="error">${t('settings.status.error').replace('{error}', error.message)}</span>`;
        }
    });

    // 初始化系统提示词功能
    function initSystemPrompts(settings) {
        // 确保系统提示词数组存在
        if (!settings.systemPrompts || !Array.isArray(settings.systemPrompts) || settings.systemPrompts.length === 0) {
            // 如果不存在，创建默认提示词
            settings.systemPrompts = [
                {
                    id: 'default',
                    name: t('settings.sections.systemPrompt.defaultPrompt', 'Default Prompt'),
                    content: settings.systemPrompt || '',
                    isDefault: true,
                    isActive: true,
                    icon: 'assistant'
                }
            ];
            settings.activePromptId = 'default';
            
            // 保存设置
            updateSettings(settings);
        }
        
        // 获取DOM元素
        const promptCardsContainer = document.querySelector('.prompt-cards-container');
        const addPromptCardButton = document.getElementById('add-prompt-card');
        
        // 渲染提示词卡片
        renderPromptCards(settings.systemPrompts, settings.activePromptId);
        
        // 绑定添加按钮事件
        addPromptCardButton.addEventListener('click', () => {
            openPromptEditor(null);
        });
    }
    
    // 渲染提示词卡片
    function renderPromptCards(systemPrompts, activePromptId) {
        // 获取DOM元素
        const promptCardsContainer = document.querySelector('.prompt-cards-container');
        if (!promptCardsContainer) return;
        
        // 清空容器
        promptCardsContainer.innerHTML = '';
        
        // 渲染每个卡片
        systemPrompts.forEach(prompt => {
            const card = createPromptCard(prompt, activePromptId === prompt.id);
            promptCardsContainer.appendChild(card);
        });
    }
    
    // 创建提示词卡片
    function createPromptCard(prompt, isActive) {
        const card = document.createElement('div');
        card.className = `prompt-card ${isActive ? 'active' : ''}`;
        card.dataset.id = prompt.id;
        
        // 卡片内容
        card.innerHTML = `
            <div class="prompt-card-icon">
                <img src="assets/svg/${prompt.icon || 'assistant'}.svg" alt="${prompt.name}" class="prompt-icon">
            </div>
            <div class="prompt-card-content">
                <div class="prompt-card-name">${prompt.name}</div>
                <div class="prompt-card-preview">${truncateText(prompt.content, 60)}</div>
            </div>
            <div class="prompt-card-actions">
                <button class="edit-prompt-button icon-button" data-i18n-title="settings.sections.systemPrompt.edit">
                    <img src="assets/svg/edit.svg" alt="Edit" class="button-icon">
                </button>
                ${prompt.isDefault ? '' : `
                <button class="delete-prompt-button icon-button" data-i18n-title="settings.sections.systemPrompt.delete">
                    <img src="assets/svg/delete.svg" alt="Delete" class="button-icon">
                </button>
                `}
            </div>
        `;
        
        // 绑定点击事件 - 选择此卡片
        card.addEventListener('click', (e) => {
            // 如果点击的是按钮，则不触发卡片选择
            if (e.target.closest('.edit-prompt-button') || e.target.closest('.delete-prompt-button')) {
                return;
            }
            
            // 移除所有卡片的active类
            document.querySelectorAll('.prompt-card').forEach(c => c.classList.remove('active'));
            
            // 添加active类到当前卡片
            card.classList.add('active');
            
            // 更新活动提示词ID
            updateActivePrompt(prompt.id);
        });
        
        // 绑定编辑按钮事件
        const editButton = card.querySelector('.edit-prompt-button');
        editButton.addEventListener('click', () => {
            openPromptEditor(prompt);
        });
        
        // 绑定删除按钮事件（如果不是默认卡片）
        if (!prompt.isDefault) {
            const deleteButton = card.querySelector('.delete-prompt-button');
            deleteButton.addEventListener('click', () => {
                confirmDeletePrompt(prompt.id);
            });
        }
        
        return card;
    }
    
    // 截断文本
    function truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
    
    // 更新活动提示词
    async function updateActivePrompt(promptId) {
        const settings = await getSettings();
        
        // 更新当前活动提示词ID
        settings.activePromptId = promptId;
        
        // 更新当前系统提示词内容（用于兼容旧版本）
        const activePrompt = settings.systemPrompts.find(p => p.id === promptId);
        if (activePrompt) {
            settings.systemPrompt = activePrompt.content;
        }
        
        // 保存设置
        await updateSettings(settings);
    }
    
    // 打开提示词编辑器
    function openPromptEditor(prompt) {
        // 创建模态对话框
        const modal = document.createElement('div');
        modal.className = 'prompt-editor-modal';
        modal.innerHTML = `
            <div class="prompt-editor-container">
                <div class="prompt-editor-header">
                    <h3 data-i18n="settings.sections.systemPrompt.editor.title">
                        ${prompt ? t('settings.sections.systemPrompt.editor.edit', 'Edit Prompt') : t('settings.sections.systemPrompt.editor.new', 'New Prompt')}
                    </h3>
                    <button class="close-editor-button">
                        <img src="assets/svg/close.svg" alt="Close" class="button-icon">
                    </button>
                </div>
                <div class="prompt-editor-content">
                    <div class="settings-item">
                        <label for="prompt-name" data-i18n="settings.sections.systemPrompt.editor.name">名称</label>
                        <input type="text" id="prompt-name" value="${prompt ? prompt.name : ''}" placeholder="${t('settings.sections.systemPrompt.editor.namePlaceholder', 'Enter prompt name')}">
                    </div>
                    <div class="settings-item">
                        <label for="prompt-icon" data-i18n="settings.sections.systemPrompt.editor.icon">图标</label>
                        <select id="prompt-icon">
                            <option value="assistant" ${prompt && prompt.icon === 'assistant' ? 'selected' : ''}>
                                ${t('settings.sections.systemPrompt.icons.assistant', 'Assistant')}
                            </option>
                            <option value="code" ${prompt && prompt.icon === 'code' ? 'selected' : ''}>
                                ${t('settings.sections.systemPrompt.icons.code', 'Code')}
                            </option>
                            <option value="creative" ${prompt && prompt.icon === 'creative' ? 'selected' : ''}>
                                ${t('settings.sections.systemPrompt.icons.creative', 'Creative')}
                            </option>
                            <option value="teacher" ${prompt && prompt.icon === 'teacher' ? 'selected' : ''}>
                                ${t('settings.sections.systemPrompt.icons.teacher', 'Teacher')}
                            </option>
                        </select>
                    </div>
                    <div class="settings-item">
                        <label for="prompt-content" data-i18n="settings.sections.systemPrompt.editor.content">提示词内容</label>
                        <textarea id="prompt-content" rows="8" placeholder="${t('settings.sections.systemPrompt.editor.contentPlaceholder', 'Enter system prompt content')}">${prompt ? prompt.content : ''}</textarea>
                    </div>
                </div>
                <div class="prompt-editor-actions">
                    <button class="settings-button secondary cancel-button" data-i18n="settings.buttons.cancel">取消</button>
                    <button class="settings-button primary save-button" data-i18n="settings.buttons.save">保存</button>
                </div>
            </div>
        `;
        
        // 添加到 DOM
        document.body.appendChild(modal);
        
        // 绑定关闭按钮
        const closeButton = modal.querySelector('.close-editor-button');
        closeButton.addEventListener('click', () => {
            modal.remove();
        });
        
        // 绑定取消按钮
        const cancelButton = modal.querySelector('.cancel-button');
        cancelButton.addEventListener('click', () => {
            modal.remove();
        });
        
        // 绑定保存按钮
        const saveButton = modal.querySelector('.save-button');
        saveButton.addEventListener('click', async () => {
            const name = document.getElementById('prompt-name').value.trim();
            const icon = document.getElementById('prompt-icon').value;
            const content = document.getElementById('prompt-content').value.trim();
            
            // 验证输入
            if (!name || !content) {
                alert(t('settings.sections.systemPrompt.editor.validation', 'Name and content are required'));
                return;
            }
            
            // 获取当前设置
            const settings = await getSettings();
            
            if (prompt) {
                // 编辑现有提示词
                const index = settings.systemPrompts.findIndex(p => p.id === prompt.id);
                if (index !== -1) {
                    settings.systemPrompts[index].name = name;
                    settings.systemPrompts[index].icon = icon;
                    settings.systemPrompts[index].content = content;
                    
                    // 如果编辑的是当前活动的提示词，更新系统提示词
                    if (settings.activePromptId === prompt.id) {
                        settings.systemPrompt = content;
                    }
                }
            } else {
                // 创建新提示词
                const newPrompt = {
                    id: `prompt_${Date.now()}`,
                    name,
                    icon,
                    content,
                    isDefault: false,
                    isActive: false
                };
                
                settings.systemPrompts.push(newPrompt);
            }
            
            // 保存设置
            await updateSettings(settings);
            
            // 重新渲染卡片
            renderPromptCards(settings.systemPrompts, settings.activePromptId);
            
            // 关闭编辑器
            modal.remove();
        });
    }
    
    // 确认删除提示词
    function confirmDeletePrompt(promptId) {
        if (confirm(t('settings.sections.systemPrompt.confirmDelete', 'Are you sure you want to delete this prompt?'))) {
            deletePrompt(promptId);
        }
    }
    
    // 删除提示词
    async function deletePrompt(promptId) {
        const settings = await getSettings();
        
        // 找到要删除的提示词索引
        const index = settings.systemPrompts.findIndex(p => p.id === promptId);
        
        if (index !== -1) {
            // 如果要删除的是当前活动的提示词，则切换到默认提示词
            if (settings.activePromptId === promptId) {
                const defaultPrompt = settings.systemPrompts.find(p => p.isDefault);
                if (defaultPrompt) {
                    settings.activePromptId = defaultPrompt.id;
                    settings.systemPrompt = defaultPrompt.content;
                }
            }
            
            // 删除提示词
            settings.systemPrompts.splice(index, 1);
            
            // 保存设置
            await updateSettings(settings);
            
            // 重新渲染卡片
            renderPromptCards(settings.systemPrompts, settings.activePromptId);
        }
    }
}

// Update code highlight theme
function updateCodeHighlightTheme(theme) {
    const lightThemeLink = document.getElementById('light-theme-highlight');
    const darkThemeLink = document.getElementById('dark-theme-highlight');
    
    if (theme === 'dark') {
        lightThemeLink.disabled = true;
        darkThemeLink.disabled = false;
        
        // Add dark mode class to code blocks
        document.querySelectorAll('.code-block').forEach(block => {
            block.classList.add('dark-theme');
        });
    } else {
        lightThemeLink.disabled = false;
        darkThemeLink.disabled = true;
        
        // Remove dark mode class from code blocks
        document.querySelectorAll('.code-block').forEach(block => {
            block.classList.remove('dark-theme');
        });
    }
    
    // Reapply code highlight
    setTimeout(() => {
        document.querySelectorAll('pre code').forEach((block) => {
            // Remove all highlight classes
            block.classList.forEach(cls => {
                if (cls.startsWith('hljs-')) {
                    block.classList.remove(cls);
                }
            });
            
            // Reapply highlight
            hljs.highlightElement(block);
        });
        
        // Force apply theme specific styles
        if (theme === 'dark') {
            document.documentElement.classList.add('force-dark-code');
        } else {
            document.documentElement.classList.remove('force-dark-code');
        }
    }, 100);
}

// 动态生成语言选项
async function generateLanguageOptions() {
    const languages = getAvailableLanguages();
    const currentLang = getCurrentLanguage();
    
    let options = '';
    languages.forEach(lang => {
        const selected = lang.code === currentLang ? 'selected' : '';
        options += `<option value="${lang.code}" ${selected}>${lang.name}</option>`;
    });
    
    return options;
} 