// Default settings
const defaultSettings = {
  ollamaUrl: 'http://192.168.5.99:11434/api/generate',
  ollamaModel: 'qwen2.5:7b',
  theme: 'light'
};

// Load settings from storage
export async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        resolve({ ...defaultSettings, ...result.settings });
      } else {
        resolve(defaultSettings);
      }
    });
  });
}

// Save settings to storage
export async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings }, () => {
      resolve();
    });
  });
}

// Update a single setting
export async function updateSetting(key, value) {
  const settings = await loadSettings();
  settings[key] = value;
  await saveSettings(settings);
  return settings;
} 