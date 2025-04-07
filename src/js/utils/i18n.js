/**
 * 国际化工具类
 * 用于处理多语言支持
 */

// 当前语言
let currentLanguage = 'en';

// 语言数据
let translations = {};

// 可用语言列表
let availableLanguages = [];

/**
 * 初始化 i18n
 * @param {string} lang 初始语言
 * @returns {Promise} 加载语言文件的 Promise
 */
export async function initI18n(lang = 'en') {
    console.log('Initializing i18n...');
    
    // 加载语言配置
    try {
        const url = chrome.runtime.getURL('locale/languages.json');
        console.log(`Loading language configuration from: ${url}`);
        
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            availableLanguages = data.languages || [];
            console.log('Available languages:', availableLanguages);
        }
    } catch (error) {
        console.error('Error loading language configuration:', error);
        // 默认语言列表
        availableLanguages = [
            { code: 'en', name: 'English' },
            { code: 'zh_cn', name: '简体中文' },
            { code: 'zh_tw', name: '繁體中文' }
        ];
    }
    
    // 从存储中获取语言设置
    try {
        const result = await new Promise((resolve) => {
            chrome.storage.local.get(['settings'], (result) => {
                resolve(result);
            });
        });
        
        console.log('Settings from storage:', result);
        
        // 从settings对象中获取language
        if (result && result.settings && result.settings.language) {
            currentLanguage = result.settings.language;
            console.log(`Language from settings: ${currentLanguage}`);
        } else {
            // 如果没有设置语言，尝试使用浏览器语言
            const browserLang = navigator.language.toLowerCase();
            console.log(`Browser language: ${browserLang}`);
            
            // 检查是否有完全匹配
            const exactMatch = availableLanguages.find(lang => lang.code.toLowerCase() === browserLang);
            if (exactMatch) {
                currentLanguage = exactMatch.code;
            } else {
                // 检查是否有语言前缀匹配
                const prefix = browserLang.split('-')[0];
                const prefixMatch = availableLanguages.find(lang => 
                    lang.code.toLowerCase().startsWith(prefix));
                if (prefixMatch) {
                    currentLanguage = prefixMatch.code;
                }
            }
            console.log(`Selected language: ${currentLanguage}`);
        }
    } catch (error) {
        console.error('Error loading language setting:', error);
    }
    
    // 加载语言文件并等待完成
    await loadLanguage(currentLanguage);
    
    // 确保返回之前已加载完成
    return translations;
}

/**
 * 获取可用语言列表
 * @returns {Array} 可用语言列表
 */
export function getAvailableLanguages() {
    return availableLanguages;
}

/**
 * 加载语言文件
 * @param {string} lang 语言代码
 * @returns {Promise} 加载语言文件的 Promise
 */
export async function loadLanguage(lang) {
    try {
        // 使用chrome.runtime.getURL获取正确的文件路径
        const url = chrome.runtime.getURL(`locale/${lang}.json`);
        console.log(`Loading language file from: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load language file: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Language file loaded:', data);
        
        // 检查必要的键是否存在
        if (!data.app || !data.app.title) {
            console.error('Missing required translation key: app.title');
        }
        if (!data.app || !data.app.sidebar || !data.app.sidebar.chat) {
            console.error('Missing required translation key: app.sidebar.chat');
        }
        if (!data.app || !data.app.sidebar || !data.app.sidebar.settings) {
            console.error('Missing required translation key: app.sidebar.settings');
        }
        
        translations = data;
        currentLanguage = lang;
        
        // 保存语言设置到settings对象中
        chrome.storage.local.get(['settings'], (result) => {
            const settings = result.settings || {};
            settings.language = lang;
            chrome.storage.local.set({ settings });
        });
        
        // 立即更新DOM文本
        updateDomTexts();
        
        // 触发语言变更事件
        document.dispatchEvent(new CustomEvent('languageChanged'));
        
        console.log(`Language changed to: ${lang}`);
        return translations;
    } catch (error) {
        console.error(`Error loading language file for ${lang}:`, error);
        // 如果加载失败且不是英语，尝试加载英语
        if (lang !== 'en') {
            return loadLanguage('en');
        }
        return {};
    }
}

/**
 * 获取当前语言
 * @returns {string} 当前语言代码
 */
export function getCurrentLanguage() {
    return currentLanguage;
}

/**
 * 翻译文本
 * @param {string} key 翻译键，使用点表示法，如 'app.title'
 * @param {Object} params 替换参数
 * @returns {string} 翻译后的文本
 */
export function t(key, params = {}) {
    console.log(`Translating key: ${key}, current translations:`, translations);
    
    // 使用点表示法获取嵌套属性
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            console.warn(`Translation key not found: ${key}, current path: ${keys.slice(0, keys.indexOf(k)).join('.')}`);
            return key;
        }
    }
    
    if (typeof value === 'string') {
        // 替换参数
        return value.replace(/{([^}]+)}/g, (_, param) => {
            return params[param] !== undefined ? params[param] : `{${param}}`;
        });
    }
    
    console.warn(`Translation value is not a string: ${key}`);
    return key;
}

/**
 * 更新 DOM 元素的文本
 * 查找所有带有 data-i18n 属性的元素，并更新其文本
 */
export function updateDomTexts() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = t(key);
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = t(key);
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = t(key);
    });
}

// 监听语言变更事件
document.addEventListener('languageChanged', () => {
    updateDomTexts();
});

// 使用MutationObserver监听DOM变化，自动翻译新添加的元素
function setupMutationObserver() {
    if (!document.body) {
        // 如果body还不存在，等待DOMContentLoaded事件
        document.addEventListener('DOMContentLoaded', setupMutationObserver);
        return;
    }
    
    const observer = new MutationObserver((mutations) => {
        let needsUpdate = false;
        
        mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        if (node.hasAttribute('data-i18n') || 
                            node.hasAttribute('data-i18n-placeholder') || 
                            node.hasAttribute('data-i18n-title') ||
                            node.querySelector('[data-i18n], [data-i18n-placeholder], [data-i18n-title]')) {
                            needsUpdate = true;
                        }
                    }
                });
            }
        });
        
        if (needsUpdate) {
            updateDomTexts();
            console.log('DOM texts updated after mutation');
        }
    });
    
    // 开始观察整个文档
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('MutationObserver setup complete');
}

// 尝试立即设置观察者，如果失败则等待DOM加载完成
setupMutationObserver();