// Import i18n utility
import { t } from '../utils/i18n.js';

// Load Translate module
export function loadTranslate(container) {
    // Create translate UI
    container.innerHTML = `
        <div class="translate-container">
            <div class="translate-header">
                <h2 data-i18n="translate.header">Translate</h2>
            </div>
            <div class="translate-content">
                <div class="translate-form">
                    <div class="translate-row">
                        <div class="translate-language-selector">
                            <select id="source-language">
                                <option value="auto" selected>Auto detect</option>
                                <option value="en">English</option>
                                <option value="zh-CN">Chinese (Simplified)</option>
                                <option value="zh-TW">Chinese (Traditional)</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="ja">Japanese</option>
                                <option value="ko">Korean</option>
                                <option value="ru">Russian</option>
                                <option value="ar">Arabic</option>
                                <option value="hi">Hindi</option>
                                <option value="pt">Portuguese</option>
                                <option value="it">Italian</option>
                            </select>
                        </div>
                        <button id="swap-languages" class="icon-button">
                            <img src="assets/svg/swap.svg" alt="Swap" class="button-icon">
                        </button>
                        <div class="translate-language-selector">
                            <select id="target-language">
                                <option value="en">English</option>
                                <option value="zh-CN" selected>Chinese (Simplified)</option>
                                <option value="zh-TW">Chinese (Traditional)</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="de">German</option>
                                <option value="ja">Japanese</option>
                                <option value="ko">Korean</option>
                                <option value="ru">Russian</option>
                                <option value="ar">Arabic</option>
                                <option value="hi">Hindi</option>
                                <option value="pt">Portuguese</option>
                                <option value="it">Italian</option>
                            </select>
                        </div>
                    </div>
                    <div class="translate-row">
                        <div class="translate-text-container">
                            <div class="translate-text-area">
                                <textarea id="source-text" placeholder="Enter text to translate"></textarea>
                            </div>
                            <div class="translate-text-actions">
                                <button id="clear-source" class="icon-button" data-i18n-title="translate.clearSource">
                                    <img src="assets/svg/clear.svg" alt="Clear" class="button-icon">
                                </button>
                                <button id="copy-source" class="icon-button" data-i18n-title="translate.copySource">
                                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="translate-row">
                        <button id="translate-button" class="translate-button" data-i18n="translate.translateButton">
                            Translate
                        </button>
                    </div>
                    <div class="translate-row">
                        <div class="translate-result-container">
                            <div class="translate-result">
                                <div id="translation-output"></div>
                            </div>
                            <div class="translate-result-actions">
                                <button id="copy-result" class="icon-button" data-i18n-title="translate.copyResult">
                                    <img src="assets/svg/copy.svg" alt="Copy" class="button-icon">
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Get DOM elements
    const sourceLanguage = document.getElementById('source-language');
    const targetLanguage = document.getElementById('target-language');
    const swapLanguagesButton = document.getElementById('swap-languages');
    const sourceText = document.getElementById('source-text');
    const clearSourceButton = document.getElementById('clear-source');
    const copySourceButton = document.getElementById('copy-source');
    const translateButton = document.getElementById('translate-button');
    const translationOutput = document.getElementById('translation-output');
    const copyResultButton = document.getElementById('copy-result');
    
    // Function to perform translation
    async function performTranslation() {
        const text = sourceText.value.trim();
        if (!text) {
            translationOutput.innerHTML = `<div class="translate-empty">${t('translate.enterTextPrompt')}</div>`;
            return;
        }
        
        const sl = sourceLanguage.value;
        const tl = targetLanguage.value;
        
        // Show loading state
        translationOutput.innerHTML = `<div class="translate-loading">${t('translate.translating')}</div>`;
        
        try {
            // 使用 Google 翻译的非官方 API
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
            
            // 使用 background.js 代理请求，避免 CORS 问题
            chrome.runtime.sendMessage({
                action: 'fetchTranslation',
                url: url
            }, (response) => {
                if (response.error) {
                    console.error('Translation error:', response.error);
                    translationOutput.innerHTML = `<div class="translate-error">${t('translate.translationFailed')}: ${response.error}</div>`;
                    return;
                }
                
                try {
                    const data = JSON.parse(response.data);
                    if (data && data[0]) {
                        // 提取翻译结果
                        let translation = '';
                        for (let i = 0; i < data[0].length; i++) {
                            if (data[0][i][0]) {
                                translation += data[0][i][0];
                            }
                        }
                        
                        translationOutput.textContent = translation;
                    } else {
                        translationOutput.innerHTML = `<div class="translate-error">${t('translate.translationFailed')}</div>`;
                    }
                } catch (error) {
                    console.error('Error parsing translation:', error);
                    translationOutput.innerHTML = `<div class="translate-error">${t('translate.translationFailed')}: ${error.message}</div>`;
                }
            });
        } catch (error) {
            console.error('Translation error:', error);
            translationOutput.innerHTML = `<div class="translate-error">${t('translate.translationFailed')}: ${error.message}</div>`;
        }
    }
    
    // Event listeners
    translateButton.addEventListener('click', performTranslation);
    
    // Enter key in source text area
    sourceText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            performTranslation();
        }
    });
    
    // Swap languages
    swapLanguagesButton.addEventListener('click', () => {
        // Don't swap if source is "auto"
        if (sourceLanguage.value === 'auto') {
            return;
        }
        
        const temp = sourceLanguage.value;
        sourceLanguage.value = targetLanguage.value;
        targetLanguage.value = temp;
    });
    
    // Clear source text
    clearSourceButton.addEventListener('click', () => {
        sourceText.value = '';
        sourceText.focus();
    });
    
    // Copy source text
    copySourceButton.addEventListener('click', () => {
        navigator.clipboard.writeText(sourceText.value)
            .then(() => {
                // Show copied notification
                const notification = document.createElement('div');
                notification.className = 'copy-notification';
                notification.textContent = 'Copied!';
                copySourceButton.appendChild(notification);
                
                // Remove notification after a short delay
                setTimeout(() => {
                    notification.remove();
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
            });
    });
    
    // Copy result
    copyResultButton.addEventListener('click', () => {
        const textToCopy = translationOutput.textContent;
        
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                // Show copied notification
                const notification = document.createElement('div');
                notification.className = 'copy-notification';
                notification.textContent = 'Copied!';
                copyResultButton.appendChild(notification);
                
                // Remove notification after a short delay
                setTimeout(() => {
                    notification.remove();
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
            });
    });
} 