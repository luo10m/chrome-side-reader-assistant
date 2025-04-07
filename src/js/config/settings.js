/**
 * 设置访问工具
 * 这个文件提供了访问和更新设置的函数
 */

// 获取当前设置
export async function getSettings() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'getSettings'
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response.error) {
                reject(response.error);
            } else {
                resolve(response);
            }
        });
    });
}

// 更新设置
export async function updateSettings(settings) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: 'updateSettings',
            settings: settings
        }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response.error) {
                reject(response.error);
            } else {
                resolve(response);
            }
        });
    });
}

// 更新单个设置
export async function updateSetting(key, value) {
    const settings = await getSettings();
    settings[key] = value;
    return updateSettings(settings);
} 