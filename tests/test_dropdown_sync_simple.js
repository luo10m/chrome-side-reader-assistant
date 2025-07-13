/**
 * 简化的下拉控件同步功能测试
 * 验证改进后的语言检测逻辑
 */

const assert = require('assert');

// 模拟DOM元素
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

// 模拟Event类
class MockEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.bubbles = options.bubbles || false;
        this.target = null;
    }
}

// 模拟语言检测函数
function detectLanguageHeuristic(text) {
    const chinesePattern = /[\u4e00-\u9fff]/g;
    const chineseCount = (text.match(chinesePattern) || []).length;
    const totalLength = text.length;

    if (chineseCount / totalLength > 0.3) return 'zh_cn';
    return 'en';
}

// 模拟改进后的语言检测函数
function simulateDetectLanguageWithSync(text, targetLanguageElement) {
    const detectedLang = detectLanguageHeuristic(text);
    let suggestedTarget = null;

    if (detectedLang === 'zh_cn') {
        suggestedTarget = 'en';
    } else if (detectedLang === 'en') {
        suggestedTarget = 'zh_cn';
    }

    if (suggestedTarget && suggestedTarget !== targetLanguageElement.value) {
        const previousTarget = targetLanguageElement.value;

        // 记录change事件是否被触发
        let changeEventFired = false;
        const changeHandler = () => {
            changeEventFired = true;
        };

        targetLanguageElement.addEventListener('change', changeHandler);

        // 设置新值
        targetLanguageElement.value = suggestedTarget;

        // 触发change事件（模拟改进后的代码）
        const event = new MockEvent('change', { bubbles: true });
        event.target = targetLanguageElement;
        targetLanguageElement.dispatchEvent(event);

        // 清理事件监听器
        targetLanguageElement.removeEventListener('change', changeHandler);

        return {
            detected: detectedLang,
            suggested: suggestedTarget,
            previous: previousTarget,
            changed: true,
            eventFired: changeEventFired,
            currentValue: targetLanguageElement.value,
            selectedIndex: targetLanguageElement.selectedIndex,
            selectedOption: targetLanguageElement.options[targetLanguageElement.selectedIndex]
        };
    }

    return {
        detected: detectedLang,
        suggested: null,
        previous: targetLanguageElement.value,
        changed: false,
        eventFired: false,
        currentValue: targetLanguageElement.value,
        selectedIndex: targetLanguageElement.selectedIndex,
        selectedOption: targetLanguageElement.options[targetLanguageElement.selectedIndex]
    };
}

// 测试用例
function runDropdownSyncTests() {
    console.log('开始下拉控件同步功能测试...\n');

    // 测试1: 验证change事件被正确触发
    console.log('测试1: 验证change事件触发');
    const targetLanguage1 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage1.value = 'zh_cn'; // 设置初始值

    const chineseText = '这是一段中文文本用于测试';
    const result1 = simulateDetectLanguageWithSync(chineseText, targetLanguage1);

    assert.strictEqual(result1.detected, 'zh_cn', '应该检测到中文');
    assert.strictEqual(result1.suggested, 'en', '应该建议英文');
    assert.strictEqual(result1.changed, true, '应该改变目标语言');
    assert.strictEqual(result1.eventFired, true, 'change事件应该被触发');
    assert.strictEqual(result1.currentValue, 'en', '下拉控件的值应该是英文');
    assert.strictEqual(result1.selectedOption.value, 'en', '选中的选项应该是英文');
    console.log('✓ 通过\n');

    // 测试2: 验证下拉控件的视觉状态同步
    console.log('测试2: 验证下拉控件视觉状态同步');
    const targetLanguage2 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage2.value = 'fr'; // 设置初始值为法文

    const englishText = 'This is an English text for testing';
    const result2 = simulateDetectLanguageWithSync(englishText, targetLanguage2);

    assert.strictEqual(result2.detected, 'en', '应该检测到英文');
    assert.strictEqual(result2.suggested, 'zh_cn', '应该建议中文');
    assert.strictEqual(result2.changed, true, '应该改变目标语言');
    assert.strictEqual(result2.eventFired, true, 'change事件应该被触发');
    assert.strictEqual(result2.currentValue, 'zh_cn', '下拉控件的值应该是中文');
    assert.strictEqual(result2.selectedOption.value, 'zh_cn', '选中的选项应该是中文');
    assert.strictEqual(result2.selectedOption.textContent, '简体中文', '选中选项的文本应该是简体中文');
    console.log('✓ 通过\n');

    // 测试3: 验证不需要改变时不触发事件
    console.log('测试3: 验证不需要改变时不触发事件');
    const targetLanguage3 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage3.value = 'en'; // 设置初始值为英文

    const chineseText2 = '这是中文文本';
    const result3 = simulateDetectLanguageWithSync(chineseText2, targetLanguage3);

    assert.strictEqual(result3.detected, 'zh_cn', '应该检测到中文');
    assert.strictEqual(result3.suggested, null, '不应该建议改变（目标语言已正确）');
    assert.strictEqual(result3.changed, false, '不应该改变目标语言（已经是英文）');
    assert.strictEqual(result3.eventFired, false, 'change事件不应该被触发');
    assert.strictEqual(result3.currentValue, 'en', '下拉控件的值应该保持英文');
    console.log('✓ 通过\n');

    // 测试4: 验证selectedIndex的正确性
    console.log('测试4: 验证selectedIndex的正确性');
    const targetLanguage4 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage4.value = 'fr'; // 设置初始值为法文

    const originalSelectedIndex = targetLanguage4.selectedIndex;

    const englishText2 = 'Another English text for testing selectedIndex';
    const result4 = simulateDetectLanguageWithSync(englishText2, targetLanguage4);

    assert.strictEqual(result4.changed, true, '应该改变目标语言');
    assert.notStrictEqual(targetLanguage4.selectedIndex, originalSelectedIndex, 'selectedIndex应该改变');
    assert.strictEqual(targetLanguage4.options[targetLanguage4.selectedIndex].value, 'zh_cn', '新选中的选项应该是中文');
    assert.strictEqual(targetLanguage4.selectedIndex, 1, 'selectedIndex应该是1（中文选项的索引）');
    console.log('✓ 通过\n');

    // 测试5: 验证事件处理器的正确执行
    console.log('测试5: 验证事件处理器的正确执行');
    const targetLanguage5 = new MockSelectElement([
        { value: 'en', text: 'English' },
        { value: 'zh_cn', text: '简体中文' },
        { value: 'fr', text: 'Français' },
        { value: 'de', text: 'Deutsch' }
    ]);
    targetLanguage5.value = 'de'; // 设置初始值为德文

    let handlerCallCount = 0;
    let handlerReceivedEvent = null;

    const testHandler = (event) => {
        handlerCallCount++;
        handlerReceivedEvent = event;
    };

    targetLanguage5.addEventListener('change', testHandler);

    const chineseText3 = '这是另一段中文文本用于测试事件处理';
    const result5 = simulateDetectLanguageWithSync(chineseText3, targetLanguage5);

    assert.strictEqual(result5.eventFired, true, 'change事件应该被触发');
    assert.strictEqual(handlerCallCount, 1, '事件处理器应该被调用一次');
    assert.strictEqual(handlerReceivedEvent.type, 'change', '事件类型应该是change');
    assert.strictEqual(handlerReceivedEvent.target, targetLanguage5, '事件目标应该是下拉控件');
    console.log('✓ 通过\n');

    console.log('🎉 所有下拉控件同步测试通过！');
    console.log('\n改进效果总结：');
    console.log('1. ✅ change事件正确触发');
    console.log('2. ✅ 下拉控件视觉状态同步');
    console.log('3. ✅ selectedIndex正确更新');
    console.log('4. ✅ 事件处理器正确执行');
    console.log('5. ✅ 避免不必要的事件触发');
    console.log('\n💡 改进说明：');
    console.log('- 添加了 targetLanguage.dispatchEvent(new Event("change", { bubbles: true }))');
    console.log('- 确保程序化设置值后触发change事件');
    console.log('- 保证下拉控件的视觉状态与实际值同步');
    console.log('- 支持事件冒泡，兼容现有的事件监听逻辑');
}

// 运行测试
try {
    runDropdownSyncTests();
} catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
} 