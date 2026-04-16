/**
 * 设置访问工具
 * 这个文件提供了访问和更新设置的函数
 */
import { mergeSettingsPatch, normalizeSettings } from '../shared/runtime-guards.mjs';

function readRawSettingsFromStorage() {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(['settings'], (result) => {
                const error = chrome.runtime?.lastError;
                if (error) {
                    reject(error);
                    return;
                }
                resolve(result?.settings);
            });
        } catch (error) {
            reject(error);
        }
    });
}

function writeSettingsToStorage(settings) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set({ settings }, () => {
                const error = chrome.runtime?.lastError;
                if (error) {
                    reject(error);
                    return;
                }
                resolve(settings);
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function getSettings() {
    const rawSettings = await readRawSettingsFromStorage();
    return normalizeSettings(rawSettings);
}

export async function updateSettings(settings) {
    const currentSettings = await getSettings();
    const nextSettings = settings?.reset === true
        ? normalizeSettings({})
        : mergeSettingsPatch(currentSettings, settings);

    await writeSettingsToStorage(nextSettings);
    return nextSettings;
}

export async function updateSetting(key, value) {
    return updateSettings({ [key]: value });
}

export async function getActiveSystemPrompt() {
    const settings = await getSettings();
    if (settings && settings.activePromptId && settings.systemPrompts) {
        const activePrompt = settings.systemPrompts.find((prompt) => prompt.id === settings.activePromptId);
        if (activePrompt) {
            return activePrompt.content;
        }
    }
    return settings?.systemPrompt || 'You are a helpful assistant.';
}
