/**
 * 简化的语言检测功能测试
 * 只支持中文和英文检测
 */

// 简化的语言检测函数
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

// 测试用例
const testCases = [
    {
        name: '纯中文文本',
        text: '你好，这是一个中文测试文本。我们正在测试语言检测功能。',
        expected: 'zh_cn'
    },
    {
        name: '纯英文文本',
        text: 'Hello, this is an English test text. We are testing the language detection functionality.',
        expected: 'en'
    },
    {
        name: '中文常用词汇',
        text: '我们的产品非常好用，可以帮助你解决问题。',
        expected: 'zh_cn'
    },
    {
        name: '英文常用词汇',
        text: 'The quick brown fox jumps over the lazy dog. This is a test.',
        expected: 'en'
    },
    {
        name: '中英混合（中文为主）',
        text: '这是一个测试 test 文本，包含了中文和 English 内容。',
        expected: 'zh_cn'
    },
    {
        name: '中英混合（英文为主）',
        text: 'This is a test 测试 text with both English and 中文 content.',
        expected: 'en'
    },
    {
        name: '短中文文本',
        text: '测试',
        expected: 'zh_cn'
    },
    {
        name: '短英文文本',
        text: 'test',
        expected: 'en'
    },
    {
        name: '数字和符号',
        text: '123456 !@#$%^&*()',
        expected: 'en'  // 默认为英文
    },
    {
        name: '中文标点符号',
        text: '你好！',
        expected: 'zh_cn'
    },
    {
        name: '英文标点符号',
        text: 'Hello!',
        expected: 'en'
    },
    {
        name: '技术术语混合',
        text: 'JavaScript函数',
        expected: 'zh_cn'  // 中文字符更多
    },
    {
        name: '技术术语混合2',
        text: 'JavaScript function implementation',
        expected: 'en'  // 英文字符更多
    },
    {
        name: '单个中文字符',
        text: '好',
        expected: 'zh_cn'
    },
    {
        name: '单个英文字符',
        text: 'a',
        expected: 'en'
    }
];

// 运行测试
function runTests() {
    console.log('🚀 开始测试简化的语言检测功能（仅支持中文和英文）...\n');

    let passedTests = 0;
    let totalTests = testCases.length;

    for (const testCase of testCases) {
        console.log(`\n📝 测试: ${testCase.name}`);
        console.log(`📄 文本: "${testCase.text}"`);
        console.log(`🎯 期望: ${testCase.expected}`);

        const detected = detectLanguageAdvanced(testCase.text);

        if (detected === testCase.expected) {
            console.log(`✅ 通过 - 检测到: ${detected}`);
            passedTests++;
        } else {
            console.log(`❌ 失败 - 检测到: ${detected}, 期望: ${testCase.expected}`);
        }
    }

    console.log(`\n📊 测试结果: ${passedTests}/${totalTests} 通过`);
    console.log(`✨ 成功率: ${(passedTests / totalTests * 100).toFixed(1)}%`);

    if (passedTests === totalTests) {
        console.log('🎉 所有测试通过！');
    } else {
        console.log('⚠️  部分测试失败，需要进一步优化。');
    }
}

// 运行测试
runTests();

console.log('\n🎯 简化算法特点：');
console.log('✨ 1. 只支持中文和英文检测');
console.log('✨ 2. 使用Unicode范围精确识别中文字符');
console.log('✨ 3. 简单高效的字符计数算法');
console.log('✨ 4. 混合文本按字符数量决定主要语言');
console.log('✨ 5. 非中英文字符默认归类为英文'); 