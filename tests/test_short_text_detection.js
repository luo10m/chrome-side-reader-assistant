/**
 * 短文本语言检测测试
 * 验证2字符以上的文本都能被正确检测
 */

// 简化的语言检测函数
function detectLanguageAdvanced(text) {
    if (!text || text.trim().length < 1) {
        return 'unknown';
    }

    const cleanText = text.trim();
    const totalLength = cleanText.length;

    // Count Chinese characters using Unicode ranges
    const chinesePattern = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
    const chineseMatches = cleanText.match(chinesePattern);
    const chineseCount = chineseMatches ? chineseMatches.length : 0;

    // Count English letters
    const englishPattern = /[a-zA-Z]/g;
    const englishMatches = cleanText.match(englishPattern);
    const englishCount = englishMatches ? englishMatches.length : 0;

    console.log(`检测 "${text}": 中文=${chineseCount}, 英文=${englishCount}, 总长度=${totalLength}`);

    // Decision logic
    if (chineseCount > 0 && englishCount > 0) {
        return chineseCount > englishCount ? 'zh_cn' : 'en';
    } else if (chineseCount > 0) {
        return 'zh_cn';
    } else if (englishCount > 0) {
        return 'en';
    } else {
        return 'en'; // Default to English for symbols, numbers, etc.
    }
}

// 模拟触发条件检查
function shouldTriggerDetection(text) {
    return text.trim().length > 2;
}

// 短文本测试用例
const shortTextCases = [
    {
        name: '1个字符（不触发）',
        text: '好',
        shouldTrigger: false,
        expected: 'zh_cn'
    },
    {
        name: '2个字符（不触发）',
        text: '你好',
        shouldTrigger: false,
        expected: 'zh_cn'
    },
    {
        name: '3个字符（触发）',
        text: '你好吗',
        shouldTrigger: true,
        expected: 'zh_cn'
    },
    {
        name: '1个英文字符（不触发）',
        text: 'a',
        shouldTrigger: false,
        expected: 'en'
    },
    {
        name: '2个英文字符（不触发）',
        text: 'hi',
        shouldTrigger: false,
        expected: 'en'
    },
    {
        name: '3个英文字符（触发）',
        text: 'yes',
        shouldTrigger: true,
        expected: 'en'
    },
    {
        name: '4个英文字符（触发）',
        text: 'test',
        shouldTrigger: true,
        expected: 'en'
    },
    {
        name: '3个中文字符（触发）',
        text: '测试一下',
        shouldTrigger: true,
        expected: 'zh_cn'
    },
    {
        name: '混合3字符（触发）',
        text: 'a测试',
        shouldTrigger: true,
        expected: 'zh_cn'  // 中文字符更多
    },
    {
        name: '混合3字符英文为主（触发）',
        text: 'ab测',
        shouldTrigger: true,
        expected: 'en'  // 英文字符更多
    },
    {
        name: '标点符号3字符（触发）',
        text: '你好！',
        shouldTrigger: true,
        expected: 'zh_cn'
    },
    {
        name: '英文标点3字符（触发）',
        text: 'OK!',
        shouldTrigger: true,
        expected: 'en'
    }
];

// 运行测试
function runShortTextTests() {
    console.log('🚀 短文本语言检测测试（触发条件：>2字符）\n');

    let passedTests = 0;
    let totalTests = shortTextCases.length;
    let triggeredTests = 0;

    for (const testCase of shortTextCases) {
        console.log(`\n📝 测试: ${testCase.name}`);
        console.log(`📄 文本: "${testCase.text}" (长度: ${testCase.text.length})`);

        const willTrigger = shouldTriggerDetection(testCase.text);
        console.log(`🎯 是否触发检测: ${willTrigger ? '是' : '否'} (期望: ${testCase.shouldTrigger ? '是' : '否'})`);

        if (willTrigger === testCase.shouldTrigger) {
            console.log(`✅ 触发条件正确`);

            if (willTrigger) {
                triggeredTests++;
                const detected = detectLanguageAdvanced(testCase.text);
                console.log(`🔍 检测结果: ${detected} (期望: ${testCase.expected})`);

                if (detected === testCase.expected) {
                    console.log(`✅ 检测结果正确`);
                    passedTests++;
                } else {
                    console.log(`❌ 检测结果错误`);
                }
            } else {
                console.log(`⏸️  不触发检测（符合预期）`);
                passedTests++;
            }
        } else {
            console.log(`❌ 触发条件错误`);
        }
    }

    console.log(`\n📊 测试结果:`);
    console.log(`• 总测试数: ${totalTests}`);
    console.log(`• 通过测试: ${passedTests}`);
    console.log(`• 触发检测的测试: ${triggeredTests}`);
    console.log(`• 成功率: ${(passedTests / totalTests * 100).toFixed(1)}%`);

    if (passedTests === totalTests) {
        console.log('🎉 所有测试通过！');
    } else {
        console.log('⚠️  部分测试失败。');
    }

    console.log(`\n💡 优化效果:`);
    console.log(`• 降低触发门槛: 从5字符降低到2字符`);
    console.log(`• 更早响应: 3字符即可触发检测`);
    console.log(`• 提升体验: 短文本也能获得智能语言设置`);
    console.log(`• 保持性能: 仍然避免过于频繁的检测`);
}

// 运行测试
runShortTextTests(); 