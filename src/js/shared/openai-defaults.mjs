export const DEFAULT_OPENAI_BASE_URL = 'https://tokenx24.com/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.4';
export const DEFAULT_OPENAI_MODELS = [
    { id: 'gpt-5.4', name: 'gpt-5.4' },
    { id: 'gpt-4.1', name: 'gpt-4.1' },
    { id: 'custom', name: 'custom' }
];

export function getDefaultOpenAIModels() {
    return DEFAULT_OPENAI_MODELS.map((model) => ({ ...model }));
}
