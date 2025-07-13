// Import i18n utility
import { t } from '../utils/i18n.js';

// Constants for DOM selectors and CSS classes
const SELECTORS = {
    SOURCE_LANGUAGE: 'source-language',
    TARGET_LANGUAGE: 'target-language',
    SWAP_LANGUAGES: 'swap-languages',
    SOURCE_TEXT: 'source-text',
    CLEAR_SOURCE: 'clear-source',
    COPY_SOURCE: 'copy-source',
    TRANSLATE_BUTTON: 'translate-button',
    TRANSLATION_OUTPUT: 'translation-output',
    COPY_RESULT: 'copy-result'
};

const CLASSES = {
    PLACEHOLDER: 'placeholder',
    LOADING: 'loading',
    TRANSLATE_LOADING: 'translate-loading',
    TRANSLATE_ERROR: 'translate-error',
    TRANSLATE_EMPTY: 'translate-empty'
};

const OUTPUT_STATES = {
    LOADING: 'loading',
    ERROR: 'error',
    EMPTY: 'empty',
    SUCCESS: 'success',
    PLACEHOLDER: 'placeholder'
};

/**
 * Creates language options for select elements
 * @param {Array<Object>} languages - The list of language objects from languages.json
 * @param {string} selectedValue - The value to be selected
 * @param {boolean} includeAutoDetect - Whether to include auto-detect option
 * @returns {string} HTML string of option elements
 */
function createLanguageOptions(languages, selectedValue, includeAutoDetect = false) {
    let options = [...languages]; // Create a mutable copy
    if (includeAutoDetect) {
        // Add the auto-detect option to the beginning of the list
        options.unshift({ code: 'auto', name: t('translate.autoDetect'), isAutoDetect: true });
    }

    return options
        .map(lang => {
            const value = lang.code;
            const name = lang.name;
            const selected = value === selectedValue ? 'selected' : '';
            const i18nKey = lang.isAutoDetect ? 'data-i18n="translate.autoDetect"' : '';
            const langName = lang.isAutoDetect ? name : lang.name;
            return `<option value="${value}" ${selected} ${i18nKey}>${langName}</option>`;
        })
        .join('');
}

/**
 * Displays a temporary "Copied!" notification next to a button.
 * @param {HTMLElement} buttonElement - The button that was clicked.
 */
function showCopyNotification(buttonElement) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = t('translate.copied');

    // Position and append
    document.body.appendChild(notification);
    const rect = buttonElement.getBoundingClientRect();
    notification.style.left = `${rect.left + window.scrollX}px`;
    notification.style.top = `${rect.top + window.scrollY - notification.offsetHeight - 5}px`;

    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    });

    // Remove notification after a short delay
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(10px)';
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

/**
 * Handles the logic for copying text to the clipboard.
 * @param {string} text - The text to copy.
 * @param {HTMLElement} buttonElement - The button that triggered the copy action.
 */
function handleCopy(text, buttonElement) {
    if (!text || !text.trim()) return;

    navigator.clipboard.writeText(text)
        .then(() => {
            showCopyNotification(buttonElement);
        })
        .catch(err => {
            console.error('Failed to copy text:', err);
            // Optionally, show an error notification
        });
}

/**
 * Shows a notification when language is auto-detected and target language is changed
 * @param {string} detectedLang - The detected source language code
 * @param {string} targetLang - The auto-set target language code
 */
function showLanguageDetectionFeedback(detectedLang, targetLang) {
    // Get language names for display
    const getLanguageName = (code) => {
        const langMap = {
            'zh_cn': '简体中文',
            'en': 'English'
        };
        return langMap[code] || code;
    };

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'language-detection-notification';
    notification.innerHTML = `
        <div class="detection-message">
            <span class="detection-icon">🔄</span>
            <span class="detection-text">
                ${t('translate.autoDetected')}: ${getLanguageName(detectedLang)} → ${getLanguageName(targetLang)}
            </span>
        </div>
    `;

    // Position and append
    const targetLanguageSelect = document.getElementById(SELECTORS.TARGET_LANGUAGE);
    const rect = targetLanguageSelect.getBoundingClientRect();
    notification.style.position = 'fixed';
    notification.style.left = `${rect.left + window.scrollX}px`;
    notification.style.top = `${rect.bottom + window.scrollY + 5}px`;
    notification.style.zIndex = '10000';
    notification.style.backgroundColor = '#4CAF50';
    notification.style.color = 'white';
    notification.style.padding = '8px 12px';
    notification.style.borderRadius = '4px';
    notification.style.fontSize = '12px';
    notification.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(-10px)';
    notification.style.transition = 'all 0.3s ease';

    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    });

    // Remove notification after a short delay
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-10px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Load Translate module
export async function loadTranslate(container) {
    let languages = [];
    try {
        const response = await fetch(chrome.runtime.getURL('locale/languages.json'));
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        languages = data.languages;
    } catch (error) {
        console.error("Failed to load languages file:", error);
        // Fallback to a minimal hardcoded list if fetch fails
        languages = [
            { code: "en", name: "English" },
            { code: "zh_cn", name: "简体中文" }
        ];
    }

    // Ensure i18n is initialized before creating UI
    if (typeof window.i18nInitialized === 'undefined') {
        const { initI18n } = await import('../utils/i18n.js');
        await initI18n();
        window.i18nInitialized = true;
    }

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
                                ${createLanguageOptions(languages, 'auto', true)}
                            </select>
                        </div>
                        <button id="swap-languages" class="icon-button" data-i18n-title="translate.swapLanguages">
                            <img src="assets/svg/swap.svg" alt="Swap" class="button-icon">
                        </button>
                        <div class="translate-language-selector">
                            <select id="target-language">
                                ${createLanguageOptions(languages, 'zh_cn', false)}
                            </select>
                        </div>
                    </div>
                    <div class="translate-row">
                        <div class="translate-text-container">
                            <div class="translate-text-area">
                                <textarea id="source-text" data-i18n-placeholder="translate.enterTextPlaceholder"></textarea>
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
                                <div id="translation-output" class="placeholder" data-i18n="translate.translationPlaceholder">Translation will appear here</div>
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
    const sourceLanguage = document.getElementById(SELECTORS.SOURCE_LANGUAGE);
    const targetLanguage = document.getElementById(SELECTORS.TARGET_LANGUAGE);
    const swapLanguagesButton = document.getElementById(SELECTORS.SWAP_LANGUAGES);
    const sourceText = document.getElementById(SELECTORS.SOURCE_TEXT);
    const clearSourceButton = document.getElementById(SELECTORS.CLEAR_SOURCE);
    const copySourceButton = document.getElementById(SELECTORS.COPY_SOURCE);
    const translateButton = document.getElementById(SELECTORS.TRANSLATE_BUTTON);
    const translationOutput = document.getElementById(SELECTORS.TRANSLATION_OUTPUT);
    const copyResultButton = document.getElementById(SELECTORS.COPY_RESULT);

    /**
     * Detects the language of the input text and automatically sets target language
     * @param {string} text - The text to detect language for
     */
    async function detectLanguage(text) {
        try {
            // Use an improved heuristic-based language detection
            const detectedLang = detectLanguageAdvanced(text);

            // Auto-set target language based on detected source language
            if (detectedLang && detectedLang !== 'unknown') {
                let suggestedTarget = null;

                // If input is Chinese, set target to English
                if (detectedLang === 'zh_cn') {
                    suggestedTarget = 'en';
                }
                // If input is English, set target to Chinese
                else if (detectedLang === 'en') {
                    suggestedTarget = 'zh_cn';
                }

                // Auto-set target language if we have a suggestion and it's different from current
                if (suggestedTarget && suggestedTarget !== targetLanguage.value) {
                    const previousTarget = targetLanguage.value;
                    targetLanguage.value = suggestedTarget;

                    // Highlight the dropdown to indicate a change
                    targetLanguage.classList.add('highlight-change');
                    setTimeout(() => {
                        targetLanguage.classList.remove('highlight-change');
                    }, 1500); // 高亮持续1.5秒

                    // Dispatch a change event to ensure UI and listeners are updated
                    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

                    // Log the auto-detection for debugging
                    console.log(`Auto-detected: ${detectedLang} -> ${suggestedTarget} (was: ${previousTarget})`);

                    // Show visual feedback to user
                    showLanguageDetectionFeedback(detectedLang, suggestedTarget);
                }
            }
        } catch (error) {
            console.error('Language detection failed:', error);
        }
    }

    /**
     * Simplified language detection for Chinese and English only
     * @param {string} text - The text to analyze
     * @returns {string} - Detected language code: 'zh_cn', 'en', or 'unknown'
     */
    function detectLanguageAdvanced(text) {
        if (!text || text.trim().length < 1) {
            return 'unknown';
        }

        const cleanText = text.trim();
        const totalLength = cleanText.length;

        // Count Chinese characters using Unicode ranges
        // CJK Unified Ideographs: U+4E00-U+9FFF
        // CJK Extension A: U+3400-U+4DBF
        // CJK Compatibility Ideographs: U+F900-U+FAFF
        const chinesePattern = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
        const chineseMatches = cleanText.match(chinesePattern);
        const chineseCount = chineseMatches ? chineseMatches.length : 0;

        // Count English letters (basic Latin)
        const englishPattern = /[a-zA-Z]/g;
        const englishMatches = cleanText.match(englishPattern);
        const englishCount = englishMatches ? englishMatches.length : 0;

        // Calculate percentages
        const chinesePercentage = chineseCount / totalLength;
        const englishPercentage = englishCount / totalLength;

        console.log(`Language detection: Chinese=${chineseCount}(${(chinesePercentage * 100).toFixed(1)}%), English=${englishCount}(${(englishPercentage * 100).toFixed(1)}%), Total=${totalLength}`);

        // Decision logic
        if (chineseCount > 0 && englishCount > 0) {
            // Mixed text: decide based on which is more dominant
            if (chineseCount > englishCount) {
                return 'zh_cn';
            } else {
                return 'en';
            }
        } else if (chineseCount > 0) {
            // Pure Chinese text
            return 'zh_cn';
        } else if (englishCount > 0) {
            // Pure English text
            return 'en';
        } else {
            // No Chinese or English characters found
            // For symbols, numbers, etc., default to English
            return 'en';
        }
    }

    /**
     * Simple heuristic-based language detection
     * @param {string} text - The text to analyze
     * @returns {string} - Detected language code
     */
    function detectLanguageHeuristic(text) {
        // Simple character-based detection
        const chinesePattern = /[\u4e00-\u9fff]/g;
        const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/g;
        const koreanPattern = /[\uac00-\ud7af]/g;
        const arabicPattern = /[\u0600-\u06ff]/g;
        const russianPattern = /[\u0400-\u04ff]/g;

        // Count characters
        const chineseCount = (text.match(chinesePattern) || []).length;
        const japaneseCount = (text.match(japanesePattern) || []).length;
        const koreanCount = (text.match(koreanPattern) || []).length;
        const arabicCount = (text.match(arabicPattern) || []).length;
        const russianCount = (text.match(russianPattern) || []).length;

        const totalLength = text.length;

        // If more than 30% of characters are from a specific script, detect that language
        if (chineseCount / totalLength > 0.3) return 'zh_cn';
        if (japaneseCount / totalLength > 0.3) return 'ja';
        if (koreanCount / totalLength > 0.3) return 'ko';
        if (arabicCount / totalLength > 0.3) return 'ar';
        if (russianCount / totalLength > 0.3) return 'ru';

        // Default to English for Latin scripts
        return 'en';
    }

    /**
     * Safely sets the output state with proper content handling
     * @param {string} type - The type of state: 'loading', 'error', 'empty', 'success', 'placeholder'
     * @param {string} content - The content to display
     */
    function setOutputState(type, content) {
        // Clear existing content
        translationOutput.innerHTML = '';
        translationOutput.classList.remove(CLASSES.PLACEHOLDER);
        translationOutput.style.whiteSpace = 'normal';

        switch (type) {
            case OUTPUT_STATES.SUCCESS:
                translationOutput.style.whiteSpace = 'pre-wrap';
                translationOutput.textContent = content;
                break;

            case OUTPUT_STATES.PLACEHOLDER:
                translationOutput.classList.add(CLASSES.PLACEHOLDER);
                translationOutput.textContent = content;
                break;

            case OUTPUT_STATES.LOADING:
            case OUTPUT_STATES.ERROR:
            case OUTPUT_STATES.EMPTY:
                const stateDiv = document.createElement('div');
                stateDiv.className = `translate-${type}`;
                stateDiv.textContent = content;
                translationOutput.appendChild(stateDiv);
                break;

            default:
                console.warn(`Unknown output state: ${type}`);
                translationOutput.textContent = content;
        }
    }

    // Function to perform translation
    async function performTranslation() {
        const text = sourceText.value.trim();
        if (!text) {
            setOutputState(OUTPUT_STATES.EMPTY, t('translate.enterTextPrompt'));
            return;
        }

        // Perform language detection before translation
        await detectLanguage(text);

        const targetLang = targetLanguage.value;

        // Show loading state and disable button
        setOutputState(OUTPUT_STATES.LOADING, t('translate.translating'));
        translateButton.disabled = true;
        translateButton.classList.add(CLASSES.LOADING);

        try {
            chrome.runtime.sendMessage({
                action: 'fetchTranslation',
                text: text,
                targetLang: targetLang
            }, (response) => {
                // Check for errors when the message port closes
                if (chrome.runtime.lastError) {
                    console.error('Translation message failed:', chrome.runtime.lastError.message);
                    translateButton.disabled = false;
                    translateButton.classList.remove(CLASSES.LOADING);
                    setOutputState(OUTPUT_STATES.ERROR, t('translate.translationFailed'));
                    return;
                }

                // Initial response just contains messageId
                if (response && response.messageId) {
                    console.log('Translation request sent, waiting for response...');
                    // The actual response will come via chrome.runtime.onMessage
                } else {
                    // Fallback error handling
                    translateButton.disabled = false;
                    translateButton.classList.remove(CLASSES.LOADING);
                    setOutputState(OUTPUT_STATES.ERROR, t('translate.translationFailed'));
                }
            });
        } catch (error) {
            // Handle synchronous exceptions in sending message
            translateButton.disabled = false;
            translateButton.classList.remove(CLASSES.LOADING);
            setOutputState(OUTPUT_STATES.ERROR, `${t('translate.translationFailed')}: ${error.message}`);
            console.error('Error sending translation message:', error);
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

    // Auto-detect language on input change
    let autoDetectTimeout;
    sourceText.addEventListener('input', (e) => {
        const text = e.target.value.trim();

        // Clear previous timeout
        if (autoDetectTimeout) {
            clearTimeout(autoDetectTimeout);
        }

        // Auto-detect if there's enough text (removed source language restriction)
        if (text.length > 2) {
            autoDetectTimeout = setTimeout(() => {
                detectLanguage(text);
            }, 800); // Reduced delay for better responsiveness
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
        setOutputState(OUTPUT_STATES.PLACEHOLDER, t('translate.translationPlaceholder'));
        sourceText.focus();
    });

    // Copy source text
    copySourceButton.addEventListener('click', () => {
        handleCopy(sourceText.value, copySourceButton);
    });

    // Copy result
    copyResultButton.addEventListener('click', () => {
        handleCopy(translationOutput.textContent, copyResultButton);
    });

    // Listen for translation responses
    const translationResponseListener = (message, sender, sendResponse) => {
        if (message.action === 'translationResponse') {
            // Re-enable button and remove loading state
            translateButton.disabled = false;
            translateButton.classList.remove(CLASSES.LOADING);

            if (message.success) {
                // On success, display the translated text
                setOutputState(OUTPUT_STATES.SUCCESS, message.translatedText);
            } else {
                // Handle translation failure
                const errorMessage = message.error || t('translate.translationFailed');
                setOutputState(OUTPUT_STATES.ERROR, errorMessage);
                console.error('Translation error:', message.error);
            }
        }
    };

    // Remove any existing listener to prevent duplicates
    if (window.translationResponseListener) {
        chrome.runtime.onMessage.removeListener(window.translationResponseListener);
    }

    // Add the listener and store reference for cleanup
    chrome.runtime.onMessage.addListener(translationResponseListener);
    window.translationResponseListener = translationResponseListener;
} 