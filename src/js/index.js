// Import modules
import { loadAIChat } from './modules/ai-chat.js';
import { loadSettings } from './modules/settings.js';
import { loadTranslate } from './modules/translate.js';
import { addCopyListeners } from './utils/copy-utils.js';
import { initI18n, updateDomTexts } from './utils/i18n.js';
import { getSettings } from './services/ollama-service.js';

// Global state
let i18nInitialized = false;

// DOM elements
const aiChatBtn = document.getElementById('ai-chat-btn');
const translateBtn = document.getElementById('translate-btn');
const settingsBtn = document.getElementById('settings-btn');
const aiChatContent = document.getElementById('ai-chat-content');
const translateContent = document.getElementById('translate-content');
const settingsContent = document.getElementById('settings-content');

// Tab configuration
const TAB_CONFIG = {
    'ai-chat': { btn: aiChatBtn, content: aiChatContent },
    'translate': { btn: translateBtn, content: translateContent },
    'settings': { btn: settingsBtn, content: settingsContent }
};

// Set active tab
function setActiveTab(tab) {
    // Remove active class from currently active elements
    document.querySelectorAll('.sidebar-btn.active, .content-section.active').forEach(el => {
        el.classList.remove('active');
    });

    // Add active class to selected tab
    if (TAB_CONFIG[tab]) {
        TAB_CONFIG[tab].btn.classList.add('active');
        TAB_CONFIG[tab].content.classList.add('active');
    }
}

// Initialize UI components and event listeners
async function initUI() {
    console.log('Initializing UI...');

    // Load all modules
    loadAIChat(aiChatContent);
    await loadTranslate(translateContent); // Wait for translate module to load languages
    loadSettings(settingsContent);

    // Add event listeners
    aiChatBtn.addEventListener('click', () => setActiveTab('ai-chat'));
    translateBtn.addEventListener('click', () => setActiveTab('translate'));
    settingsBtn.addEventListener('click', () => setActiveTab('settings'));

    // Add global listeners
    addCopyListeners();

    // Set default active tab
    setActiveTab('ai-chat');
    console.log('UI Initialized.');
}

// Main application entry point
async function main() {
    console.log('Starting application initialization...');

    // Ensure DOM is fully loaded
    if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    console.log('DOM is ready.');

    try {
        // Initialize internationalization
        await initI18n();
        i18nInitialized = true;
        console.log('i18n initialized.');

        // Apply theme from settings
        const settings = await getSettings();
        document.documentElement.setAttribute('data-theme', settings.theme || 'light');
        console.log(`Theme set to ${settings.theme || 'light'}.`);

        // Initialize the user interface
        await initUI();

        // Update all dynamic text elements with translations
        updateDomTexts();
        console.log('DOM texts updated.');

    } catch (error) {
        console.error('Error during application initialization:', error);
        // Attempt to initialize UI even if i18n or settings fail
        if (!i18nInitialized) {
            await initUI();
        }
    }

    console.log('Application initialization complete.');
}

// Run the application
main(); 