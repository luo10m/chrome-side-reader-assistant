/**
 * 完整的下拉控件同步和视觉反馈演示
 * 展示自动语言检测、下拉控件同步、事件触发和视觉高亮的完整流程
 */

// 模拟DOM环境
class MockSelectElement {
    constructor(options = []) {
        this.options = options.map((opt, index) => ({
            value: opt.value,
            textContent: opt.text,
            selected: index === 0
        }));
        this._value = this.options[0]?.value || '';
        this._selectedIndex = 0;
        this.eventListeners = {};
        this.classList = new MockClassList();
    }

    get value() {
        return this._value;
    }

    set value(newValue) {
        this._value = newValue;
        this._selectedIndex = this.options.findIndex(opt => opt.value === newValue);
        if (this._selectedIndex === -1) this._selectedIndex = 0;

        // 更新选中状态
        this.options.forEach((opt, index) => {
            opt.selected = index === this._selectedIndex;
        });
    }

    get selectedIndex() {
        return this._selectedIndex;
    }

    addEventListener(event, handler) {
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(handler);
    }

    removeEventListener(event, handler) {
        if (this.eventListeners[event]) {
            this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
        }
    }

    dispatchEvent(event) {
        if (this.eventListeners[event.type]) {
            this.eventListeners[event.type].forEach(handler => {
                handler.call(this, event);
            });
        }
        return true;
    }
}

// 模拟classList
class MockClassList {
    constructor() {
        this.classes = new Set();
    }

    add(className) {
        this.classes.add(className);
    }

    remove(className) {
        this.classes.delete(className);
    }

    contains(className) {
        return this.classes.has(className);
    }

    toggle(className) {
        if (this.classes.has(className)) {
            this.classes.delete(className);
            return false;
        } else {
            this.classes.add(className);
            return true;
        }
    }

    toString() {
        return Array.from(this.classes).join(' ');
    }
}

// 模拟Event类
class MockEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
        this.target = null;
    }
}

// 模拟setTimeout
const mockSetTimeout = (callback, delay) => {
    console.log(`⏱️  设置定时器: ${delay}ms 后执行高亮移除`);
    // 立即执行以便演示
    setTimeout(() => {
        console.log(`⏱️  定时器执行: 移除高亮效果`);
        callback();
    }, 100); // 缩短时间以便演示
};

// 模拟语言检测函数
function detectLanguageHeuristic(text) {
    const chinesePattern = /[\u4e00-\u9fff]/g;
    const chineseCount = (text.match(chinesePattern) || []).length;
    const totalLength = text.length;

    if (chineseCount / totalLength > 0.3) return 'zh_cn';
    return 'en';
}

// 模拟完整的改进后的语言检测函数
function simulateCompleteDetectLanguage(text, targetLanguageElement) {
    console.log(`🔍 开始语言检测: "${text}"`);

    const detectedLang = detectLanguageHeuristic(text);
    console.log(`🎯 检测到语言: ${detectedLang}`);

    let suggestedTarget = null;

    if (detectedLang === 'zh_cn') {
        suggestedTarget = 'en';
    } else if (detectedLang === 'en') {
        suggestedTarget = 'zh_cn';
    }

    if (suggestedTarget) {
        console.log(`💡 建议目标语言: ${suggestedTarget}`);
    }

    if (suggestedTarget && suggestedTarget !== targetLanguageElement.value) {
        const previousTarget = targetLanguageElement.value;
        console.log(`🔄 目标语言变更: ${previousTarget} -> ${suggestedTarget}`);

        // 设置新值
        targetLanguageElement.value = suggestedTarget;
        console.log(`📝 更新下拉控件值: ${suggestedTarget}`);

        // 添加高亮效果
        targetLanguageElement.classList.add('highlight-change');
        console.log(`✨ 添加高亮效果: highlight-change`);

        // 设置定时器移除高亮
        mockSetTimeout(() => {
            targetLanguageElement.classList.remove('highlight-change');
            console.log(`🔄 移除高亮效果: highlight-change`);
        }, 1500);

        // 记录change事件是否被触发
        let changeEventFired = false;
        const changeHandler = () => {
            changeEventFired = true;
            console.log(`📢 change事件被触发`);
        };

        targetLanguageElement.addEventListener('change', changeHandler);

        // 触发change事件
        const event = new MockEvent('change', { bubbles: true });
        event.target = targetLanguageElement;
        targetLanguageElement.dispatchEvent(event);

        // 清理事件监听器
        targetLanguageElement.removeEventListener('change', changeHandler);

        // 模拟用户反馈通知
        console.log(`🔔 显示用户通知: 自动检测 ${getLanguageName(detectedLang)} → ${getLanguageName(suggestedTarget)}`);

        return {
            detected: detectedLang,
            suggested: suggestedTarget,
            previous: previousTarget,
            changed: true,
            eventFired: changeEventFired,
            currentValue: targetLanguageElement.value,
            selectedIndex: targetLanguageElement.selectedIndex,
            selectedOption: targetLanguageElement.options[targetLanguageElement.selectedIndex],
            highlightAdded: targetLanguageElement.classList.contains('highlight-change')
        };
    }

    console.log(`✅ 无需更改目标语言（已经是 ${targetLanguageElement.value}）`);

    return {
        detected: detectedLang,
        suggested: null,
        previous: targetLanguageElement.value,
        changed: false,
        eventFired: false,
        currentValue: targetLanguageElement.value,
        selectedIndex: targetLanguageElement.selectedIndex,
        selectedOption: targetLanguageElement.options[targetLanguageElement.selectedIndex],
        highlightAdded: false
    };
}

// 语言名称映射
function getLanguageName(code) {
    const names = {
        'zh_cn': '简体中文',
        'en': 'English',
        'fr': 'Français',
        'de': 'Deutsch'
    };
    return names[code] || code;
}

// 演示用例
function runCompleteDemo() {
    console.log('🚀 开始完整的下拉控件同步和视觉反馈演示\n');
    console.log('='.repeat(70));

    // 演示1: 中文输入 -> 英文目标
    console.log('\n📋 演示1: 中文输入自动设置英文目标');
    console.log('-'.repeat(50));

    const targetLanguage1 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage1.value = 'zh_cn'; // 设置初始值

    console.log(`🎯 初始目标语言: ${getLanguageName(targetLanguage1.value)}`);

    const result1 = simulateCompleteDetectLanguage('你好，这是一段中文文本用于测试自动语言检测功能。', targetLanguage1);

    console.log(`📊 结果总结:`);
    console.log(`   - 检测语言: ${getLanguageName(result1.detected)}`);
    console.log(`   - 建议目标: ${result1.suggested ? getLanguageName(result1.suggested) : 'null'}`);
    console.log(`   - 是否改变: ${result1.changed ? '✅' : '❌'}`);
    console.log(`   - 事件触发: ${result1.eventFired ? '✅' : '❌'}`);
    console.log(`   - 高亮效果: ${result1.highlightAdded ? '✅' : '❌'}`);
    console.log(`   - 最终值: ${getLanguageName(result1.currentValue)}`);

    // 演示2: 英文输入 -> 中文目标
    console.log('\n📋 演示2: 英文输入自动设置中文目标');
    console.log('-'.repeat(50));

    const targetLanguage2 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage2.value = 'fr'; // 设置初始值为法文

    console.log(`🎯 初始目标语言: ${getLanguageName(targetLanguage2.value)}`);

    const result2 = simulateCompleteDetectLanguage('Hello, this is an English text for testing automatic language detection functionality.', targetLanguage2);

    console.log(`📊 结果总结:`);
    console.log(`   - 检测语言: ${getLanguageName(result2.detected)}`);
    console.log(`   - 建议目标: ${result2.suggested ? getLanguageName(result2.suggested) : 'null'}`);
    console.log(`   - 是否改变: ${result2.changed ? '✅' : '❌'}`);
    console.log(`   - 事件触发: ${result2.eventFired ? '✅' : '❌'}`);
    console.log(`   - 高亮效果: ${result2.highlightAdded ? '✅' : '❌'}`);
    console.log(`   - 最终值: ${getLanguageName(result2.currentValue)}`);

    // 演示3: 无需更改的情况
    console.log('\n📋 演示3: 目标语言已正确，无需更改');
    console.log('-'.repeat(50));

    const targetLanguage3 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage3.value = 'en'; // 设置初始值为英文

    console.log(`🎯 初始目标语言: ${getLanguageName(targetLanguage3.value)}`);

    const result3 = simulateCompleteDetectLanguage('这是中文文本，目标语言已经是英文', targetLanguage3);

    console.log(`📊 结果总结:`);
    console.log(`   - 检测语言: ${getLanguageName(result3.detected)}`);
    console.log(`   - 建议目标: ${result3.suggested ? getLanguageName(result3.suggested) : 'null'}`);
    console.log(`   - 是否改变: ${result3.changed ? '✅' : '❌'}`);
    console.log(`   - 事件触发: ${result3.eventFired ? '✅' : '❌'}`);
    console.log(`   - 高亮效果: ${result3.highlightAdded ? '✅' : '❌'}`);
    console.log(`   - 最终值: ${getLanguageName(result3.currentValue)}`);

    console.log('\n' + '='.repeat(70));
    console.log('🎉 完整功能演示完成！\n');

    console.log('💡 改进总结:');
    console.log('1. ✅ 自动语言检测 - 基于字符特征识别语言');
    console.log('2. ✅ 智能目标设置 - 中文→英文，英文→中文');
    console.log('3. ✅ 下拉控件同步 - 程序化设置value并触发change事件');
    console.log('4. ✅ 视觉高亮反馈 - 添加highlight-change类并自动移除');
    console.log('5. ✅ 用户通知显示 - 显示检测结果和语言变更信息');
    console.log('6. ✅ 事件冒泡支持 - 支持现有的事件监听逻辑');
    console.log('7. ✅ 性能优化 - 避免不必要的更改和事件触发');

    console.log('\n🔧 技术实现:');
    console.log('- CSS过渡效果: transition: background-color 0.5s ease');
    console.log('- 高亮样式: .highlight-change { background-color: #e8f0fe !important; }');
    console.log('- 事件触发: targetLanguage.dispatchEvent(new Event("change", { bubbles: true }))');
    console.log('- 定时移除: setTimeout(() => classList.remove("highlight-change"), 1500)');

    console.log('\n🎯 用户体验提升:');
    console.log('- 减少手动操作，智能判断用户意图');
    console.log('- 清晰的视觉反馈，用户能立即看到变化');
    console.log('- 平滑的动画过渡，提升操作体验');
    console.log('- 非侵入式设计，不影响正常使用流程');
}

// 运行演示
runCompleteDemo(); 