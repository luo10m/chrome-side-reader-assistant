/**
 * 自动语言检测功能演示
 * 展示如何根据输入文本自动设置目标语言
 */

// 模拟语言检测函数
function detectLanguageHeuristic(text) {
    const chinesePattern = /[\u4e00-\u9fff]/g;
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/g;
    const koreanPattern = /[\uac00-\ud7af]/g;
    const arabicPattern = /[\u0600-\u06ff]/g;
    const russianPattern = /[\u0400-\u04ff]/g;

    const chineseCount = (text.match(chinesePattern) || []).length;
    const japaneseCount = (text.match(japanesePattern) || []).length;
    const koreanCount = (text.match(koreanPattern) || []).length;
    const arabicCount = (text.match(arabicPattern) || []).length;
    const russianCount = (text.match(russianPattern) || []).length;

    const totalLength = text.length;

    if (chineseCount / totalLength > 0.3) return 'zh_cn';
    if (japaneseCount / totalLength > 0.3) return 'ja';
    if (koreanCount / totalLength > 0.3) return 'ko';
    if (arabicCount / totalLength > 0.3) return 'ar';
    if (russianCount / totalLength > 0.3) return 'ru';

    return 'en';
}

// 模拟自动语言检测和目标语言设置
function autoDetectAndSetTarget(text, currentTarget) {
    const detectedLang = detectLanguageHeuristic(text);
    let suggestedTarget = null;

    if (detectedLang === 'zh_cn') {
        suggestedTarget = 'en';
    } else if (detectedLang === 'en') {
        suggestedTarget = 'zh_cn';
    }

    const willChange = suggestedTarget && suggestedTarget !== currentTarget;

    return {
        detected: detectedLang,
        suggested: suggestedTarget,
        current: currentTarget,
        willChange: willChange,
        newTarget: willChange ? suggestedTarget : currentTarget
    };
}

// 语言名称映射
const languageNames = {
    'zh_cn': '简体中文',
    'en': 'English',
    'ja': '日本語',
    'ko': '한국어',
    'ar': 'العربية',
    'ru': 'Русский'
};

// 演示用例
const demoTexts = [
    {
        text: '你好，这是一段中文文本。',
        currentTarget: 'zh_cn',
        description: '中文输入，当前目标语言为中文'
    },
    {
        text: 'Hello, this is an English text.',
        currentTarget: 'en',
        description: '英文输入，当前目标语言为英文'
    },
    {
        text: '这是中文文本用于测试',
        currentTarget: 'fr',
        description: '中文输入，当前目标语言为法文'
    },
    {
        text: 'This is English text for testing',
        currentTarget: 'de',
        description: '英文输入，当前目标语言为德文'
    },
    {
        text: '这是一段中文混合文本，包含一些 English words 但中文更多。',
        currentTarget: 'zh_cn',
        description: '中英混合文本，中文为主'
    }
];

console.log('🔄 自动语言检测功能演示\n');
console.log('='.repeat(60));

demoTexts.forEach((demo, index) => {
    console.log(`\n演示 ${index + 1}: ${demo.description}`);
    console.log('-'.repeat(40));
    console.log(`输入文本: "${demo.text}"`);
    console.log(`当前目标语言: ${languageNames[demo.currentTarget] || demo.currentTarget}`);

    const result = autoDetectAndSetTarget(demo.text, demo.currentTarget);

    console.log(`检测到语言: ${languageNames[result.detected] || result.detected}`);

    if (result.suggested) {
        console.log(`建议目标语言: ${languageNames[result.suggested] || result.suggested}`);
    }

    if (result.willChange) {
        console.log(`🔄 目标语言将自动调整为: ${languageNames[result.newTarget] || result.newTarget}`);
    } else {
        console.log(`✅ 目标语言保持不变: ${languageNames[result.current] || result.current}`);
    }
});

console.log('\n' + '='.repeat(60));
console.log('💡 功能说明:');
console.log('1. 当输入中文时，自动设置目标语言为英文');
console.log('2. 当输入英文时，自动设置目标语言为中文');
console.log('3. 如果目标语言已经正确，则不会改变');
console.log('4. 支持混合文本，根据主要语言判断');
console.log('5. 只有文本长度超过10个字符才会触发检测');
console.log('6. 用户界面会显示检测结果的实时反馈'); 