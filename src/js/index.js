// Import modules
import { loadAIChat } from './modules/ai-chat.js';
import { loadSettings } from './modules/settings.js';
import { addCopyListeners } from './utils/copy-utils.js';
import { initI18n, updateDomTexts } from './utils/i18n.js';

// 全局变量，表示i18n是否已初始化
let i18nInitialized = false;

// 初始化应用
async function init() {
    console.log('Starting initialization...');
    
    // 确保DOM已加载
    if (document.readyState === 'loading') {
        console.log('Waiting for DOM to be ready...');
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }
    
    console.log('DOM is ready, initializing i18n');
    
    try {
        // 初始化国际化 - 等待完成
        await initI18n();
        i18nInitialized = true;
        console.log('i18n initialized, translations loaded');
        
        // 更新DOM文本
        updateDomTexts();
        console.log('DOM texts updated after i18n initialization');
        
        // 现在可以安全地初始化UI
        initUI();
    } catch (error) {
        console.error('Error during initialization:', error);
        // 即使出错也尝试初始化UI
        initUI();
    }
}

// 初始化UI
function initUI() {
    // DOM elements
    const aiChatBtn = document.getElementById('ai-chat-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const aiChatContent = document.getElementById('ai-chat-content');
    const settingsContent = document.getElementById('settings-content');
    
    // Load AI Chat by default
    loadAIChat(aiChatContent);
    
    // Add event listeners
    aiChatBtn.addEventListener('click', () => {
        // Switch to AI Chat
        aiChatBtn.classList.add('active');
        settingsBtn.classList.remove('active');
        aiChatContent.classList.add('active');
        settingsContent.classList.remove('active');
    });
    
    settingsBtn.addEventListener('click', () => {
        // Switch to Settings
        settingsBtn.classList.add('active');
        aiChatBtn.classList.remove('active');
        settingsContent.classList.add('active');
        aiChatContent.classList.remove('active');
        
        // Load settings
        loadSettings(settingsContent);
    });
    
    // Add copy listeners
    addCopyListeners();
    
    // Apply theme from settings
    chrome.storage.local.get(['settings'], (result) => {
        if (result.settings && result.settings.theme) {
            document.documentElement.setAttribute('data-theme', result.settings.theme);
        }
    });
    
    // 如果i18n已初始化，再次更新DOM文本
    if (i18nInitialized) {
        setTimeout(() => {
            updateDomTexts();
            console.log('DOM texts updated after UI initialization');
        }, 100);
    }
}

// 启动应用
init().then(() => {
    console.log('Initialization complete');
});

// 监听DOM内容加载完成事件
document.addEventListener('DOMContentLoaded', () => {
    // 只有在i18n已初始化的情况下才更新DOM文本
    if (i18nInitialized) {
        updateDomTexts();
        console.log('DOM texts updated after DOMContentLoaded');
    }
}); 