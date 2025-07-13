/**
 * 测试改进后的语言检测功能
 * 测试用例包括：中文、英文、混合文本、短文本等场景
 */

// 模拟DOM环境
const mockDOM = {
    targetLanguage: {
        value: 'zh_cn',
        classList: {
            add: function (className) {
                console.log(`Added class: ${className}`);
            },
            remove: function (className) {
                console.log(`Removed class: ${className}`);
            }
        },
        dispatchEvent: function (event) {
            console.log(`Event dispatched: ${event.type}`);
        }
    }
};

// 模拟全局对象
global.setTimeout = setTimeout;
global.console = console;

// 模拟showLanguageDetectionFeedback函数
function showLanguageDetectionFeedback(detectedLang, targetLang) {
    const getLanguageName = (code) => {
        const langMap = {
            'zh_cn': '简体中文',
            'en': 'English',
            'ja': '日本語',
            'ko': '한국어',
            'ar': 'العربية',
            'ru': 'Русский'
        };
        return langMap[code] || code;
    };

    console.log(`🔄 检测到语言: ${getLanguageName(detectedLang)} → ${getLanguageName(targetLang)}`);
}

/**
 * Advanced heuristic-based language detection using multiple indicators
 * @param {string} text - The text to analyze
 * @returns {string} - Detected language code or 'unknown'
 */
function detectLanguageAdvanced(text) {
    if (!text || text.trim().length < 1) {
        return 'unknown';
    }

    // Clean text for analysis
    const cleanText = text.trim().toLowerCase();
    const totalLength = cleanText.length;

    // Character pattern analysis
    const patterns = {
        chinese: /[\u4e00-\u9fff]/g,
        japanese: /[\u3040-\u309f\u30a0-\u30ff]/g,
        korean: /[\uac00-\ud7af]/g,
        arabic: /[\u0600-\u06ff]/g,
        russian: /[\u0400-\u04ff]/g,
        thai: /[\u0e00-\u0e7f]/g,
        hebrew: /[\u0590-\u05ff]/g,
        greek: /[\u0370-\u03ff]/g,
        latin: /[a-z]/g
    };

    // Count characters for each script
    const counts = {};
    for (const [lang, pattern] of Object.entries(patterns)) {
        const matches = cleanText.match(pattern);
        counts[lang] = matches ? matches.length : 0;
    }

    // Calculate percentages
    const percentages = {};
    for (const [lang, count] of Object.entries(counts)) {
        percentages[lang] = count / totalLength;
    }

    // Language-specific word patterns (common words/phrases)
    const languageIndicators = {
        zh_cn: [
            /[\u4e00-\u9fff]{2,}/g,  // Chinese characters in groups
            /的|了|是|在|我|你|他|她|它|这|那|有|没|不|也|都|会|能|可以|什么|怎么|为什么/g
        ],
        en: [
            /\b(the|and|or|but|in|on|at|to|for|of|with|by|from|up|about|into|through|during|before|after|above|below|between|among|under|over|inside|outside|without|within|against|toward|towards|across|behind|beyond|beside|beneath|around|throughout|underneath|alongside|underneath|throughout|meanwhile|however|therefore|moreover|furthermore|nevertheless|nonetheless|consequently|accordingly|subsequently|previously|simultaneously|alternatively|specifically|particularly|especially|generally|typically|usually|normally|commonly|frequently|occasionally|rarely|seldom|never|always|often|sometimes|perhaps|maybe|probably|possibly|definitely|certainly|surely|obviously|clearly|apparently|evidently|presumably|supposedly|allegedly|reportedly|seemingly|apparently|obviously|clearly|evidently|presumably|supposedly|allegedly|reportedly|seemingly)\b/gi,
            /\b(is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|might|may|can|must|shall|ought)\b/gi,
            /\b(this|that|these|those|here|there|where|when|why|how|what|which|who|whom|whose)\b/gi
        ],
        ja: [
            /[\u3040-\u309f\u30a0-\u30ff]/g,  // Hiragana and Katakana
            /です|ます|だ|である|の|に|を|が|は|と|で|から|まで|より|について|として|による|によって|において|に関して|に対して|に関する|に対する/g
        ],
        ko: [
            /[\uac00-\ud7af]/g,  // Hangul
            /이|그|저|의|에|을|를|이|가|은|는|도|만|부터|까지|와|과|로|으로|에서|에게|한테|께|께서|으로써|로써|처럼|같이|마다|조차|까지도|라도|이라도|든지|거나|나/g
        ]
    };

    // Advanced scoring system
    const scores = {
        zh_cn: 0,
        en: 0,
        ja: 0,
        ko: 0,
        ar: 0,
        ru: 0,
        unknown: 0
    };

    // Character-based scoring
    if (percentages.chinese > 0.1) scores.zh_cn += percentages.chinese * 10;
    if (percentages.japanese > 0.1) scores.ja += percentages.japanese * 10;
    if (percentages.korean > 0.1) scores.ko += percentages.korean * 10;
    if (percentages.arabic > 0.1) scores.ar += percentages.arabic * 10;
    if (percentages.russian > 0.1) scores.ru += percentages.russian * 10;

    // Pattern-based scoring for Chinese and English
    if (languageIndicators.zh_cn) {
        for (const pattern of languageIndicators.zh_cn) {
            const matches = cleanText.match(pattern);
            if (matches) {
                scores.zh_cn += matches.length * 2;
            }
        }
    }

    if (languageIndicators.en) {
        for (const pattern of languageIndicators.en) {
            const matches = cleanText.match(pattern);
            if (matches) {
                scores.en += matches.length * 0.5;
            }
        }
    }

    // English-specific patterns
    if (percentages.latin > 0.7) {
        // Check for English-specific patterns
        const englishPatterns = [
            /\b(ing|ed|ly|er|est|tion|sion|ness|ment|ful|less|able|ible)\b/gi,
            /\b[a-z]+'[a-z]+\b/gi,  // contractions like don't, can't
            /\b(a|an|the)\s+[a-z]+/gi  // articles
        ];

        for (const pattern of englishPatterns) {
            const matches = cleanText.match(pattern);
            if (matches) {
                scores.en += matches.length * 1.5;
            }
        }
    }

        // Find the language with highest score
    let maxScore = 0;
    let detectedLang = 'unknown';
    
    for (const [lang, score] of Object.entries(scores)) {
        if (score > maxScore && score > 0.5) {  // Lowered threshold
            maxScore = score;
            detectedLang = lang;
        }
    }

    // Special handling for short texts
    if (detectedLang === 'unknown' && totalLength <= 10) {
        // For very short texts, use simpler character-based detection
        if (percentages.chinese > 0.1) {
            detectedLang = 'zh_cn';
        } else if (percentages.japanese > 0.1) {
            detectedLang = 'ja';
        } else if (percentages.korean > 0.1) {
            detectedLang = 'ko';
        } else if (percentages.arabic > 0.1) {
            detectedLang = 'ar';
        } else if (percentages.russian > 0.1) {
            detectedLang = 'ru';
        } else if (percentages.latin > 0.3) {
            detectedLang = 'en';
        }
    }

    // Fallback: if mostly Latin characters but no strong English indicators, assume English
    if (detectedLang === 'unknown' && percentages.latin > 0.5) {
        detectedLang = 'en';
    }

    // For mixed language texts, use more sophisticated logic
    if (detectedLang === 'zh_cn' && percentages.latin > 0.4) {
        // If there's significant Latin content, check English patterns more carefully
        const englishScore = scores.en;
        const chineseScore = scores.zh_cn;
        
        // If English patterns are strong and Chinese is not overwhelmingly dominant
        if (englishScore > 2 && chineseScore / englishScore < 2) {
            detectedLang = 'en';
        }
    }

    console.log('Language detection scores:', scores, 'Detected:', detectedLang);
    return detectedLang;
}

/**
 * 模拟detectLanguage函数
 */
async function detectLanguage(text) {
    try {
        const detectedLang = detectLanguageAdvanced(text);

        if (detectedLang && detectedLang !== 'unknown') {
            let suggestedTarget = null;

            if (detectedLang === 'zh_cn') {
                suggestedTarget = 'en';
            } else if (detectedLang === 'en') {
                suggestedTarget = 'zh_cn';
            } else {
                suggestedTarget = 'en';
            }

            if (suggestedTarget && suggestedTarget !== mockDOM.targetLanguage.value) {
                const previousTarget = mockDOM.targetLanguage.value;
                mockDOM.targetLanguage.value = suggestedTarget;

                mockDOM.targetLanguage.classList.add('highlight-change');
                setTimeout(() => {
                    mockDOM.targetLanguage.classList.remove('highlight-change');
                }, 1500);

                mockDOM.targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

                console.log(`Auto-detected: ${detectedLang} -> ${suggestedTarget} (was: ${previousTarget})`);
                showLanguageDetectionFeedback(detectedLang, suggestedTarget);
            }
        }
    } catch (error) {
        console.error('Language detection failed:', error);
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
        expected: 'en'  // 应该默认为英文
    },
    {
        name: '日文文本',
        text: 'こんにちは、これは日本語のテストです。',
        expected: 'ja'
    },
    {
        name: '韩文文本',
        text: '안녕하세요, 이것은 한국어 테스트입니다.',
        expected: 'ko'
    },
    {
        name: '俄文文本',
        text: 'Привет, это русский тест.',
        expected: 'ru'
    }
];

// 运行测试
async function runTests() {
    console.log('🚀 开始测试改进后的语言检测功能...\n');

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

        // 测试完整的detectLanguage函数
        console.log('🔄 测试完整功能:');
        await detectLanguage(testCase.text);
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