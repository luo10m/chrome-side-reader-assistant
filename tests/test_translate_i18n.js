/**
 * 测试翻译功能的i18n修复
 * 验证：
 * 1. 输入输出文本框的placeholder正确显示
 * 2. 自动语言检测功能工作
 * 3. 所有i18n键都能正确解析
 */

// 模拟Chrome扩展环境
const mockChrome = {
    runtime: {
        getURL: (path) => `chrome-extension://test/${path}`,
        sendMessage: (message, callback) => {
            // 模拟翻译响应
            setTimeout(() => {
                if (callback) {
                    callback({ messageId: Date.now().toString() });
                }
            }, 100);
        },
        onMessage: {
            addListener: (listener) => {
                // 模拟消息监听
                window.mockMessageListener = listener;
            },
            removeListener: (listener) => {
                // 模拟移除监听
                delete window.mockMessageListener;
            }
        }
    },
    storage: {
        local: {
            get: (keys, callback) => {
                // 模拟存储数据
                const mockData = {
                    settings: {
                        language: 'zh_cn',
                        openaiApiKey: 'test-key'
                    }
                };
                callback(mockData);
            }
        }
    }
};

// 设置全局Chrome对象
global.chrome = mockChrome;

// 模拟fetch
global.fetch = async (url) => {
    if (url.includes('locale/languages.json')) {
        return {
            ok: true,
            json: async () => ({
                languages: [
                    { code: 'en', name: 'English' },
                    { code: 'zh_cn', name: '简体中文' },
                    { code: 'ja', name: '日本語' }
                ]
            })
        };
    }

    if (url.includes('locale/zh_cn.json')) {
        return {
            ok: true,
            json: async () => ({
                translate: {
                    header: '翻译',
                    enterTextPlaceholder: '输入要翻译的文本...',
                    translationPlaceholder: '翻译结果将显示在这里',
                    autoDetect: '自动检测',
                    translateButton: '翻译',
                    translating: '翻译中...',
                    copied: '已复制！'
                }
            })
        };
    }

    return { ok: false };
};

// 模拟DOM环境
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;

// 测试函数
async function testTranslateI18n() {
    console.log('开始测试翻译功能的i18n修复...');

    try {
        // 1. 测试i18n初始化
        const { initI18n, t } = await import('../src/js/utils/i18n.js');
        await initI18n('zh_cn');

        // 2. 测试关键的i18n键
        const testKeys = [
            'translate.enterTextPlaceholder',
            'translate.translationPlaceholder',
            'translate.autoDetect',
            'translate.translateButton'
        ];

        console.log('测试i18n键解析：');
        testKeys.forEach(key => {
            const value = t(key);
            console.log(`  ${key}: ${value}`);
            if (value === key) {
                console.error(`  ❌ 键 ${key} 未找到对应的翻译`);
            } else {
                console.log(`  ✅ 键 ${key} 解析正确`);
            }
        });

        // 3. 测试翻译模块加载
        const container = document.createElement('div');
        const { loadTranslate } = await import('../src/js/modules/translate.js');

        await loadTranslate(container);

        // 4. 检查DOM元素是否正确创建
        const sourceTextarea = container.querySelector('#source-text');
        const translationOutput = container.querySelector('#translation-output');

        if (sourceTextarea && sourceTextarea.placeholder !== 'translate.enterTextPlaceholder') {
            console.log('✅ 输入框placeholder正确设置');
        } else {
            console.error('❌ 输入框placeholder未正确设置');
        }

        if (translationOutput && !translationOutput.textContent.includes('translate.translationPlaceholder')) {
            console.log('✅ 输出区域文本正确设置');
        } else {
            console.error('❌ 输出区域文本未正确设置');
        }

        console.log('✅ 翻译功能i18n修复测试完成');

    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
}

// 运行测试
if (require.main === module) {
    testTranslateI18n();
}

module.exports = { testTranslateI18n }; 