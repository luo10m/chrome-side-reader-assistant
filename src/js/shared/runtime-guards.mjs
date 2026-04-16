import { DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL } from './openai-defaults.mjs';

const INTERNAL_DEFAULT_SETTINGS = {
    theme: 'light',
    language: 'en',
    defaultAI: 'openai',
    useProxy: false,
    useStreaming: true,
    loadLastChat: true,
    systemPrompt: 'You are a helpful assistant.',
    systemPrompts: [
        {
            id: 'default',
            name: 'Default Prompt',
            content: 'You are a helpful assistant.',
            isDefault: true,
            isActive: true,
            icon: 'assistant'
        }
    ],
    activePromptId: 'default',
    openaiApiKey: '',
    openaiBaseUrl: DEFAULT_OPENAI_BASE_URL,
    openaiModel: DEFAULT_OPENAI_MODEL,
    openaiCustomModel: ''
};

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clonePrompt(prompt) {
    return { ...prompt };
}

function getSafeDefaults(defaultSettings = INTERNAL_DEFAULT_SETTINGS) {
    const baseDefaults = isPlainObject(defaultSettings) ? defaultSettings : INTERNAL_DEFAULT_SETTINGS;
    const systemPrompts = Array.isArray(baseDefaults.systemPrompts) && baseDefaults.systemPrompts.length > 0
        ? baseDefaults.systemPrompts.map(clonePrompt)
        : INTERNAL_DEFAULT_SETTINGS.systemPrompts.map(clonePrompt);

    return {
        ...INTERNAL_DEFAULT_SETTINGS,
        ...baseDefaults,
        systemPrompts
    };
}

function normalizePrompt(prompt, index, fallbackContent) {
    if (!isPlainObject(prompt)) {
        return null;
    }

    const id = typeof prompt.id === 'string' && prompt.id.trim()
        ? prompt.id
        : `prompt-${index + 1}`;
    const content = typeof prompt.content === 'string' && prompt.content.trim()
        ? prompt.content
        : fallbackContent;
    const name = typeof prompt.name === 'string' && prompt.name.trim()
        ? prompt.name
        : `Prompt ${index + 1}`;

    return {
        ...prompt,
        id,
        name,
        content,
        icon: typeof prompt.icon === 'string' && prompt.icon.trim() ? prompt.icon : 'assistant',
        isDefault: Boolean(prompt.isDefault),
        isActive: Boolean(prompt.isActive)
    };
}

export function normalizeSettings(rawSettings, defaultSettings = INTERNAL_DEFAULT_SETTINGS) {
    const defaults = getSafeDefaults(defaultSettings);
    const source = isPlainObject(rawSettings) ? rawSettings : {};
    const merged = {
        ...defaults,
        ...source
    };

    const fallbackContent = typeof merged.systemPrompt === 'string' && merged.systemPrompt.trim()
        ? merged.systemPrompt
        : defaults.systemPrompt;

    let systemPrompts = Array.isArray(source.systemPrompts)
        ? source.systemPrompts.map((prompt, index) => normalizePrompt(prompt, index, fallbackContent)).filter(Boolean)
        : [];

    if (systemPrompts.length === 0) {
        systemPrompts = defaults.systemPrompts.map((prompt, index) => {
            const defaultPrompt = normalizePrompt(prompt, index, fallbackContent);
            return {
                ...defaultPrompt,
                isDefault: index === 0 || Boolean(defaultPrompt.isDefault)
            };
        });
    }

    let activePromptId = typeof source.activePromptId === 'string' ? source.activePromptId : '';
    if (!systemPrompts.some((prompt) => prompt.id === activePromptId)) {
        activePromptId = systemPrompts.find((prompt) => prompt.isDefault)?.id || systemPrompts[0].id;
    }

    systemPrompts = systemPrompts.map((prompt) => ({
        ...prompt,
        isActive: prompt.id === activePromptId
    }));

    const activePrompt = systemPrompts.find((prompt) => prompt.id === activePromptId) || systemPrompts[0];

    return {
        ...merged,
        systemPrompt: activePrompt?.content || fallbackContent || defaults.systemPrompt,
        systemPrompts,
        activePromptId
    };
}

export function mergeSettingsPatch(existingSettings, patch, defaultSettings = INTERNAL_DEFAULT_SETTINGS) {
    const safeExisting = isPlainObject(existingSettings) ? existingSettings : {};
    const safePatch = isPlainObject(patch) ? patch : {};
    return normalizeSettings({ ...safeExisting, ...safePatch }, defaultSettings);
}

export function ensureMessageList(list) {
    if (!Array.isArray(list)) {
        return [];
    }

    return list.filter((message) => isPlainObject(message));
}

export async function sendRuntimeMessageSafely(sendMessage, payload) {
    try {
        await Promise.resolve(sendMessage(payload));
        return { delivered: true };
    } catch (error) {
        return {
            delivered: false,
            error: error?.message || String(error)
        };
    }
}

export function resolveExtensionAssetUrl(assetPath, runtimeGetURL) {
    if (typeof runtimeGetURL === 'function') {
        return runtimeGetURL(assetPath);
    }

    return assetPath;
}
