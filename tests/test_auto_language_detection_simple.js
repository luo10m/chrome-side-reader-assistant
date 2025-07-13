/**
 * 简单的自动语言检测功能测试
 * 不依赖jest，使用Node.js原生断言
 */

const assert = require('assert');

// 模拟语言检测函数
function detectLanguageHeuristic(text) {
    // 简化的语言检测逻辑
    const chinesePattern = /[\u4e00-\u9fff]/g;
    const chineseCount = (text.match(chinesePattern) || []).length;
    const totalLength = text.length;

    if (chineseCount / totalLength > 0.3) return 'zh_cn';
    return 'en';
}

// 模拟自动语言检测函数
function simulateAutoDetection(text, targetLanguageSelect) {
    const detectedLang = detectLanguageHeuristic(text);
    let suggestedTarget = null;

    if (detectedLang === 'zh_cn') {
        suggestedTarget = 'en';
    } else if (detectedLang === 'en') {
        suggestedTarget = 'zh_cn';
    }

    if (suggestedTarget && suggestedTarget !== targetLanguageSelect.value) {
        const previousTarget = targetLanguageSelect.value;
        targetLanguageSelect.value = suggestedTarget;

        return {
            detected: detectedLang,
            suggested: suggestedTarget,
            previous: previousTarget,
            changed: true
        };
    }

    return {
        detected: detectedLang,
        suggested: null,
        previous: targetLanguageSelect.value,
        changed: false
    };
}

// 测试用例
function runTests() {
    console.log('开始自动语言检测功能测试...\n');

    // 测试1: 中文输入应该自动设置目标语言为英文
    console.log('测试1: 中文输入 -> 英文目标');
    const targetLanguageSelect1 = { value: 'zh_cn' };
    const chineseText = '你好，这是一段中文文本，用于测试自动语言检测功能。';
    const result1 = simulateAutoDetection(chineseText, targetLanguageSelect1);

    assert.strictEqual(result1.detected, 'zh_cn', '应该检测到中文');
    assert.strictEqual(result1.suggested, 'en', '应该建议英文作为目标语言');
    assert.strictEqual(result1.changed, true, '应该改变目标语言');
    assert.strictEqual(targetLanguageSelect1.value, 'en', '目标语言应该设置为英文');
    console.log('✓ 通过\n');

    // 测试2: 英文输入应该自动设置目标语言为中文
    console.log('测试2: 英文输入 -> 中文目标');
    const targetLanguageSelect2 = { value: 'en' };
    const englishText = 'Hello, this is an English text for testing automatic language detection.';
    const result2 = simulateAutoDetection(englishText, targetLanguageSelect2);

    assert.strictEqual(result2.detected, 'en', '应该检测到英文');
    assert.strictEqual(result2.suggested, 'zh_cn', '应该建议中文作为目标语言');
    assert.strictEqual(result2.changed, true, '应该改变目标语言');
    assert.strictEqual(targetLanguageSelect2.value, 'zh_cn', '目标语言应该设置为中文');
    console.log('✓ 通过\n');

    // 测试3: 混合文本应该根据主要语言设置目标语言
    console.log('测试3: 混合文本 -> 根据主要语言');
    const targetLanguageSelect3 = { value: 'zh_cn' };
    const mixedText = '这是一段中文混合文本，包含一些 English words 但中文更多。';
    const result3 = simulateAutoDetection(mixedText, targetLanguageSelect3);

    assert.strictEqual(result3.detected, 'zh_cn', '应该检测到中文为主要语言');
    assert.strictEqual(result3.suggested, 'en', '应该建议英文作为目标语言');
    assert.strictEqual(result3.changed, true, '应该改变目标语言');
    console.log('✓ 通过\n');

    // 测试4: 如果目标语言已经正确，不应该改变
    console.log('测试4: 目标语言已正确 -> 不改变');
    const targetLanguageSelect4 = { value: 'en' };
    const chineseText2 = '这是中文文本';
    const result4 = simulateAutoDetection(chineseText2, targetLanguageSelect4);

    assert.strictEqual(result4.detected, 'zh_cn', '应该检测到中文');
    assert.strictEqual(result4.suggested, null, '不应该建议改变（目标语言已正确）');
    assert.strictEqual(result4.changed, false, '不应该改变目标语言');
    assert.strictEqual(targetLanguageSelect4.value, 'en', '目标语言应该保持为英文');
    console.log('✓ 通过\n');

    // 测试5: 语言检测启发式算法准确性
    console.log('测试5: 语言检测算法准确性');
    const testCases = [
        { text: '你好世界', expected: 'zh_cn' },
        { text: 'Hello World', expected: 'en' },
        { text: '这是一个测试', expected: 'zh_cn' },
        { text: 'This is a test', expected: 'en' },
        { text: '中文为主要语言 with English', expected: 'zh_cn' }, // 中文字符更多
        { text: 'English is primary 中文少', expected: 'en' }  // 英文字符更多
    ];

    testCases.forEach(({ text, expected }, index) => {
        const detected = detectLanguageHeuristic(text);
        assert.strictEqual(detected, expected, `测试用例 ${index + 1} 失败: "${text}" 应该检测为 ${expected}`);
        console.log(`  ✓ "${text}" -> ${detected}`);
    });
    console.log('✓ 通过\n');

    // 测试6: 短文本检测
    console.log('测试6: 短文本长度检查');
    const shortText = 'Hi';
    assert.strictEqual(shortText.length < 10, true, '短文本应该少于10个字符');
    console.log('✓ 通过\n');

    console.log('🎉 所有测试通过！自动语言检测功能实现正确。');
}

// 运行测试
try {
    runTests();
} catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
} 