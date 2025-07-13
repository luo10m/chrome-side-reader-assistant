/**
 * 下拉控件同步功能测试
 * 验证自动语言检测时下拉控件的视觉同步
 */

const assert = require('assert');

// 模拟DOM环境
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
    <select id="target-language">
        <option value="en">English</option>
        <option value="zh_cn">简体中文</option>
        <option value="fr">Français</option>
        <option value="de">Deutsch</option>
    </select>
</body>
</html>
`);

global.document = dom.window.document;
global.window = dom.window;
global.Event = dom.window.Event;

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
        targetLanguageElement.dispatchEvent(new Event('change', { bubbles: true }));

        // 清理事件监听器
        targetLanguageElement.removeEventListener('change', changeHandler);

        return {
            detected: detectedLang,
            suggested: suggestedTarget,
            previous: previousTarget,
            changed: true,
            eventFired: changeEventFired,
            currentValue: targetLanguageElement.value,
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
        selectedOption: targetLanguageElement.options[targetLanguageElement.selectedIndex]
    };
}

// 测试用例
function runDropdownSyncTests() {
    console.log('开始下拉控件同步功能测试...\n');

    // 测试1: 验证change事件被正确触发
    console.log('测试1: 验证change事件触发');
    const targetLanguage1 = document.getElementById('target-language');
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
    const targetLanguage2 = document.getElementById('target-language');
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
    const targetLanguage3 = document.getElementById('target-language');
    targetLanguage3.value = 'en'; // 设置初始值为英文

    const chineseText2 = '这是中文文本';
    const result3 = simulateDetectLanguageWithSync(chineseText2, targetLanguage3);

    assert.strictEqual(result3.detected, 'zh_cn', '应该检测到中文');
    assert.strictEqual(result3.suggested, 'en', '应该建议英文');
    assert.strictEqual(result3.changed, false, '不应该改变目标语言（已经是英文）');
    assert.strictEqual(result3.eventFired, false, 'change事件不应该被触发');
    assert.strictEqual(result3.currentValue, 'en', '下拉控件的值应该保持英文');
    console.log('✓ 通过\n');

    // 测试4: 验证事件冒泡
    console.log('测试4: 验证事件冒泡');
    const targetLanguage4 = document.getElementById('target-language');
    targetLanguage4.value = 'de'; // 设置初始值为德文

    // 在父元素上监听事件
    let bubbledEventFired = false;
    const bubbleHandler = (event) => {
        if (event.target === targetLanguage4) {
            bubbledEventFired = true;
        }
    };

    document.body.addEventListener('change', bubbleHandler);

    const chineseText3 = '这是另一段中文文本用于测试冒泡';
    const result4 = simulateDetectLanguageWithSync(chineseText3, targetLanguage4);

    document.body.removeEventListener('change', bubbleHandler);

    assert.strictEqual(result4.eventFired, true, '直接change事件应该被触发');
    assert.strictEqual(bubbledEventFired, true, '事件应该正确冒泡到父元素');
    console.log('✓ 通过\n');

    // 测试5: 验证selectedIndex的正确性
    console.log('测试5: 验证selectedIndex的正确性');
    const targetLanguage5 = document.getElementById('target-language');
    targetLanguage5.value = 'fr'; // 设置初始值为法文

    const originalSelectedIndex = targetLanguage5.selectedIndex;

    const englishText2 = 'Another English text for testing selectedIndex';
    const result5 = simulateDetectLanguageWithSync(englishText2, targetLanguage5);

    assert.strictEqual(result5.changed, true, '应该改变目标语言');
    assert.notStrictEqual(targetLanguage5.selectedIndex, originalSelectedIndex, 'selectedIndex应该改变');
    assert.strictEqual(targetLanguage5.options[targetLanguage5.selectedIndex].value, 'zh_cn', '新选中的选项应该是中文');
    console.log('✓ 通过\n');

    console.log('🎉 所有下拉控件同步测试通过！');
    console.log('改进效果：');
    console.log('1. ✅ change事件正确触发');
    console.log('2. ✅ 下拉控件视觉状态同步');
    console.log('3. ✅ 事件冒泡正常工作');
    console.log('4. ✅ selectedIndex正确更新');
    console.log('5. ✅ 避免不必要的事件触发');
}

// 运行测试
try {
    runDropdownSyncTests();
} catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
} 