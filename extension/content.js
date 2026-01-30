// content.js

// 1. 注入拦截器到页面主上下文 (Main World)
// 为了绕过 CSP 限制，我们需要通过 src 引入外部脚本，而不是使用 inline// 注入功能脚本
const script = document.createElement('script');
script.src = chrome.runtime.getURL('injected.js');
script.onload = function() {
    this.remove();
};
(document.head || document.documentElement).appendChild(script);

// 注入 Tesseract.js (OCR)
const tesseractScript = document.createElement('script');
tesseractScript.src = chrome.runtime.getURL('tesseract.min.js');
tesseractScript.onload = function() {
    // Tesseract 加载完成后，会在 window.Tesseract 上挂载
    console.log("[GD-Layer] Tesseract.js 已加载，准备进行视觉审核");
};
(document.head || document.documentElement).appendChild(tesseractScript);

// 2. 创建 UI 面板
function createPanel() {
    if (document.getElementById('gd-lc-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'gd-lc-panel';
    panel.className = 'gd-lc-collapsed'; // 默认收起
    
    // HTML 结构分为：摘要栏 (Summary) 和 详情区 (Details)
    panel.innerHTML = `
      <!-- 摘要栏：常驻显示 -->
      <div class="gd-lc-summary" title="按住可拖拽">
        <div class="gd-lc-status-icon" id="gd-lc-status-icon">⏳</div>
        <div class="gd-lc-summary-text">
            <span id="gd-lc-mini-total">--</span> 图层
        </div>
        <div class="gd-lc-toggle-icon"></div>
      </div>

      <!-- 详情区：展开显示 -->
      <div class="gd-lc-details-wrapper">
          <div class="gd-lc-header">
            <span>图层审核结果</span>
            <span class="gd-lc-pin" title="固定面板 (鼠标移开不收起)">📌</span>
          </div>
          <div class="gd-lc-content">
            
            <!-- 审核结果区 (置顶) -->
            <div class="gd-lc-audit" id="gd-lc-audit">
                <div class="gd-lc-audit-waiting">分析中...</div>
            </div>

            <!-- 分割线 -->
            <div class="gd-lc-divider" style="margin: 15px 0;"></div>

            <!-- 图层统计区 (下沉) -->
            <div style="font-size: 14px; color: #fff; margin-bottom: 5px;">总图层: <span id="gd-lc-total" style="color: #40a9ff; font-weight: bold; font-size: 16px;">--</span></div>
            <div class="gd-lc-detail" id="gd-lc-detail">等待数据...</div>
            
            <!-- 白名单设置区 -->
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">
                <div style="font-size: 12px; color: #aaa; margin-bottom: 5px; cursor: pointer; user-select: none;" id="gd-lc-whitelist-toggle">⚙️ 白名单设置 (点击展开)</div>
                <div id="gd-lc-whitelist-panel" style="display: none;">
                    <div style="display: flex; gap: 5px; margin-bottom: 5px;">
                        <input type="text" id="gd-lc-whitelist-input" placeholder="输入关键词 (如: 发财)" style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px; border-radius: 4px; font-size: 12px;">
                        <button id="gd-lc-whitelist-add" style="background: #40a9ff; border: none; color: #fff; border-radius: 4px; padding: 0 8px; cursor: pointer;">+</button>
                    </div>
                    <div id="gd-lc-whitelist-tags" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                </div>
            </div>

            <div class="gd-lc-tip">请刷新页面以捕获数据</div>
          </div>
      </div>
    `;
    document.body.appendChild(panel);

    // --- 事件绑定 ---
    const summary = panel.querySelector('.gd-lc-summary');
    const closeBtn = panel.querySelector('.gd-lc-close');
    let hoverTimer = null;

    // 展开/收起逻辑
    const expand = () => {
        panel.classList.remove('gd-lc-collapsed');
        panel.classList.add('gd-lc-expanded');
    };
    
    const collapse = () => {
        panel.classList.remove('gd-lc-expanded');
        panel.classList.add('gd-lc-collapsed');
    };

    const toggle = () => {
        if (panel.classList.contains('gd-lc-expanded')) {
            collapse();
        } else {
            expand();
        }
    };

    // 鼠标交互
    let isPinned = false;
    const pinBtn = panel.querySelector('.gd-lc-pin');

    panel.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
        expand();
    });

    panel.addEventListener('mouseleave', () => {
        // 如果固定了，就不收起
        if (isPinned) return;
        
        // 延迟收起，防止误触
        hoverTimer = setTimeout(() => {
            collapse();
        }, 300);
    });

    // 点击摘要栏切换
    summary.addEventListener('click', (e) => {
        e.stopPropagation();
        toggle();
    });

    // --- 拖拽功能 ---
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const element = panel;
    
    // 使用 panel 本身作为拖拽目标，或者使用 summary 和 header 作为手柄
    const header = panel.querySelector('.gd-lc-header');
    
    // 为两个手柄都绑定事件
    summary.onmousedown = dragMouseDown;
    if (header) header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        // 如果点击的是图钉按钮，不触发拖拽
        if (e.target.classList.contains('gd-lc-pin')) return;
        
        e = e || window.event;
        e.preventDefault();
        // 获取鼠标初始位置
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        // 拖拽开始时，临时禁用 transition，防止拖拽延迟
        element.style.transition = 'none';
        
        document.onmouseup = closeDragElement;
        // 鼠标移动时调用
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // 计算新位置
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // 设置新位置
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.bottom = 'auto';
        element.style.right = 'auto';
    }

    function closeDragElement() {
        // 停止移动
        document.onmouseup = null;
        document.onmousemove = null;
        // 恢复 transition
        panel.style.transition = '';
        // 恢复鼠标样式
        document.body.style.cursor = 'default';
    }
    
    // 复制按钮点击事件
    const copyBtn = panel.querySelector('.gd-lc-copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 构建报告内容
            const status = document.getElementById('gd-lc-status-icon').innerText;
            const total = document.getElementById('gd-lc-total').innerText;
            
            // 获取审核结果
            let resultText = "未知";
            const successEl = document.querySelector('.gd-lc-audit-result.success');
            const errorEl = document.querySelector('.gd-lc-audit-result.error');
            
            if (successEl) resultText = "✅ 通过";
            if (errorEl) resultText = "❌ 不通过";
            
            let report = `【图层审核报告】\n`;
            report += `审核结果：${resultText}\n`;
            report += `总图层数：${total}\n`;
            
            // 获取详情
            const auditList = document.querySelector('.gd-lc-audit-list');
            if (auditList) {
                report += `\n问题详情：\n`;
                const items = auditList.querySelectorAll('li');
                items.forEach((item, index) => {
                    // 清理 HTML 标签，只保留文本
                    let text = item.innerText.replace(/\[查看\]/g, '').trim();
                    report += `${index + 1}. ${text}\n`;
                });
            } else if (successEl) {
                report += `\n详情：图层分层合理、文字均可编辑\n`;
            }
            
            copyToClipboard(report);
        });
    }

    // 图钉按钮点击事件
    if (pinBtn) {
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止冒泡，防止触发 toggle
            e.preventDefault();
            
            isPinned = !isPinned;
            console.log("Pin clicked, isPinned:", isPinned); // Debug

            if (isPinned) {
                pinBtn.classList.add('active');
                pinBtn.title = "取消固定";
                panel.style.borderColor = "rgba(255, 77, 79, 0.8)"; // 边框更亮 (红色)
                panel.style.boxShadow = "0 0 15px rgba(255, 77, 79, 0.3)"; // 增加发光 (红色)
            } else {
                pinBtn.classList.remove('active');
                pinBtn.title = "固定面板 (鼠标移开不收起)";
                panel.style.borderColor = "rgba(255, 255, 255, 0.1)";
                panel.style.boxShadow = "none";
            }
        });
    }

    // 白名单逻辑
    const whitelistToggle = panel.querySelector('#gd-lc-whitelist-toggle');
    const whitelistPanel = panel.querySelector('#gd-lc-whitelist-panel');
    const whitelistInput = panel.querySelector('#gd-lc-whitelist-input');
    const whitelistAddBtn = panel.querySelector('#gd-lc-whitelist-add');
    const whitelistTags = panel.querySelector('#gd-lc-whitelist-tags');

    // 切换面板
    if (whitelistToggle) {
        whitelistToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止冒泡触发折叠
            const isHidden = whitelistPanel.style.display === 'none';
            whitelistPanel.style.display = isHidden ? 'block' : 'none';
            whitelistToggle.innerText = isHidden ? '⚙️ 文字白名单设置 (点击收起)' : '⚙️ 文字白名单设置 (点击展开)';
        });
    }
    
    // 防止面板内部点击触发折叠
    if (whitelistPanel) {
        whitelistPanel.addEventListener('click', (e) => e.stopPropagation());
    }

    // 渲染白名单
    const renderWhitelist = () => {
        const userWhitelist = JSON.parse(localStorage.getItem('gd-lc-whitelist') || '[]');
        if (whitelistTags) {
            whitelistTags.innerHTML = userWhitelist.map(word => `
                <span style="background: rgba(255,255,255,0.1); border-radius: 4px; padding: 2px 6px; font-size: 11px; display: flex; align-items: center; gap: 4px;">
                    ${word} <span class="gd-lc-whitelist-del" data-word="${word}" style="cursor: pointer; color: #ff4d4f;">×</span>
                </span>
            `).join('');

            // 绑定删除事件
            whitelistTags.querySelectorAll('.gd-lc-whitelist-del').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const wordToRemove = e.target.getAttribute('data-word');
                    const list = JSON.parse(localStorage.getItem('gd-lc-whitelist') || '[]');
                    const newList = list.filter(w => w !== wordToRemove);
                    localStorage.setItem('gd-lc-whitelist', JSON.stringify(newList));
                    renderWhitelist();
                };
            });
        }
    };

    // 添加白名单函数
    const addWhitelistWord = () => {
        const word = whitelistInput.value.trim();
        if (word) {
            const list = JSON.parse(localStorage.getItem('gd-lc-whitelist') || '[]');
            if (!list.includes(word)) {
                list.push(word);
                localStorage.setItem('gd-lc-whitelist', JSON.stringify(list));
                whitelistInput.value = '';
                renderWhitelist();
                
                // 添加成功反馈
                const originalText = whitelistAddBtn.innerText;
                whitelistAddBtn.innerText = '✅成功';
                setTimeout(() => whitelistAddBtn.innerText = originalText, 1000);
            } else {
                 // 已存在反馈
                const originalText = whitelistAddBtn.innerText;
                whitelistAddBtn.innerText = '⚠️重复';
                whitelistAddBtn.title = '已存在';
                setTimeout(() => {
                    whitelistAddBtn.innerText = originalText;
                    whitelistAddBtn.title = '';
                }, 1000);
            }
        }
    };

    // 绑定添加事件
    if (whitelistAddBtn) {
        whitelistAddBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addWhitelistWord();
        });
    }

    // 绑定回车事件
    if (whitelistInput) {
        whitelistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addWhitelistWord();
            }
        });
        // 阻止输入框点击冒泡
        whitelistInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // 初始化渲染
    renderWhitelist();

}

// 辅助：复制到剪贴板 (功能已移除，保留函数体防止调用报错)
function copyToClipboard(text) {}

// 确保 DOM 加载后再插入 UI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
} else {
    createPanel();
}

// 3. 监听拦截到的数据
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'GAODING_DATA_CAPTURED') {
        const data = event.data.payload;
        console.log("ContentScript 收到数据:", data);
        analyzeAndRender(data);
    }
});

function analyzeAndRender(data) {
    let elements = [];
    let pageCount = 0;
    
    // 深度查找 elements 数组
    try {
        if (data.layouts && Array.isArray(data.layouts)) {
            pageCount = data.layouts.length;
            data.layouts.forEach(layout => {
                if (layout.elements) {
                    elements = elements.concat(layout.elements);
                }
            });
        } else if (data.data && data.data.layouts && Array.isArray(data.data.layouts)) {
             pageCount = data.data.layouts.length;
             data.data.layouts.forEach(layout => {
                if (layout.elements) {
                    elements = elements.concat(layout.elements);
                }
            });
        } else if (data.elements && Array.isArray(data.elements)) {
            elements = data.elements;
            pageCount = 1;
        } else if (data.data && data.data.elements) {
            elements = data.data.elements;
            pageCount = 1;
        } 
        // 增加对 definition 结构的支持
        else if (data.definition && data.definition.layouts) {
             pageCount = data.definition.layouts.length;
             data.definition.layouts.forEach(layout => {
                if (layout.elements) {
                    elements = elements.concat(layout.elements);
                }
            });
        }
    } catch(e) {
        console.error("解析数据出错", e);
    }

    // 即使是空数组也要允许通过，以便处理“无图层”的情况
    if (elements && Array.isArray(elements)) {
        // 传入 canvas 信息
        const canvas = data.canvas || (data.data && data.data.canvas) || {};
        updateUI(elements, pageCount, canvas);
    }
}

// 深度视觉审核
function runDeepAudit() {
    window._gd_deep_audit_running = true; // 标记正在运行
    
    const deepAuditEl = document.getElementById('gd-lc-deep-audit');
    if (deepAuditEl) {
        deepAuditEl.innerHTML = '<div class="gd-lc-audit-waiting">正在进行深度视觉审核... <span class="gd-lc-spinner">↻</span></div>';
    } else {
         // 如果还没初始化，先不管，等 updateUI 创建容器
    }

    // 发送消息给 injected.js 请求执行 OCR
    window.postMessage({ type: 'GD_LC_RUN_OCR' }, '*');
}

// 监听来自 injected.js 的 OCR 结果
window.addEventListener('message', (event) => {
    if (event.data.type === 'GD_LC_OCR_RESULT') {
        const results = event.data.data;
        showDeepAuditResults(results);
    }
    if (event.data.type === 'GD_LC_OCR_PROGRESS') {
         const statusDiv = document.querySelector('.gd-lc-status');
         if (statusDiv) {
             statusDiv.innerText = `视觉分析中: ${event.data.progress}`;
         }
    }
});

function showDeepAuditResults(results) {
    window._gd_deep_audit_running = false;
    window._gd_deep_audit_done = true; // 标记已完成

    const deepAuditEl = document.getElementById('gd-lc-deep-audit');
    if (!deepAuditEl) return;

    // --- 综合审核逻辑 ---
    // 1. 获取基础分层审核结果 (从全局或 DOM 获取)
    // 这里我们假设如果页面上有 .gd-lc-audit-result.error，说明基础审核挂了
    const hasLayerIssue = document.querySelector('.gd-lc-audit-result.error') !== null;
    
    // 2. 分析 OCR 结果
    let ocrIssues = [];
    let errorCount = 0;
    let debugInfo = [];

    results.forEach(res => {
        if (res.error) {
            errorCount++;
            const shortUrl = res.url ? (res.url.substring(0, 30) + '...') : '无URL';
            debugInfo.push(`<li style="color:#aaa; font-size:10px;">❌ [读取失败] ${res.name} <br/> <a href="${res.url}" target="_blank" style="color:#666;">${shortUrl}</a></li>`);
        } else if (res.hasText && res.confidence > 70) { // 严格阈值 70%
            // 语义过滤升级：
            // 1. 去除标点、特殊符号、数字、空格
            const pureText = res.text.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
            
            // 2. 长度判定：至少要有2个连续的汉字或字母
            // "L人7" -> "L人" (长度2)，但这种组合看起来就很假
            // 增加正则判断：必须包含至少一个汉字，或者纯英文单词长度>3
            const hasChinese = /[\u4e00-\u9fa5]/.test(pureText);
            const isLongEnglish = /^[a-zA-Z]{4,}$/.test(pureText);
            
            // 3.1 用户自定义白名单过滤 (从 LocalStorage 读取)
            const userWhitelist = JSON.parse(localStorage.getItem('gd-lc-whitelist') || '[]');
            const defaultWhitelist = ['稿定', '发财', '福', '红包', 'VIP', '水印'];
            const whitelist = [...new Set([...defaultWhitelist, ...userWhitelist])]; // 合并去重
            
            // 修复：白名单判定逻辑过于宽松，导致长文本中只要包含白名单词就被放行
            // 新规则：
            // A. 文本完全等于白名单词 (精确匹配)
            // B. 文本包含白名单词，且总长度较短 (< 10)，说明主要是装饰性文字
            // C. 文本中白名单词的长度占比超过 50%
            
            const isWhitelisted = whitelist.some(word => {
                if (!pureText.includes(word)) return false;
                
                // 规则 A: 精确匹配 (忽略非关键字符后)
                if (pureText === word) return true;
                
                // 规则 B: 短文本豁免 (例如 "VIP专享" 包含 "VIP")
                if (pureText.length < 8) return true;
                
                // 规则 C: 占比豁免 (暂不启用，计算复杂且容易误判)
                return false;
            });

            if (isWhitelisted) {
                const shortUrl = res.url ? (res.url.substring(0, 30) + '...') : '无URL';
                debugInfo.push(`<li style="color:#52c41a; font-size:10px;">✅ [白名单] ${res.name} (包含: "${res.text}") <br/> <a href="${res.url}" target="_blank" style="color:#666;">${shortUrl}</a></li>`);
                return; // 跳过此条
            }

            // 只要有汉字且长度>=2，就认为是文字；或者是长英文
            if ((hasChinese && pureText.length >= 2) || isLongEnglish) {
                const shortUrl = res.url ? (res.url.substring(0, 30) + '...') : '无URL';
                const cleanText = res.text.length > 10 ? res.text.substring(0, 10) + '...' : res.text;
                ocrIssues.push(`
                    <li style="margin-bottom:6px; border-bottom:1px dashed #eee; padding-bottom:4px;">
                        <div style="font-weight:bold; color:#f5222d;">⚠️ 疑似文字: "${cleanText}"</div>
                        <div style="font-size:10px; color:#999;">
                            图层: ${res.name} (置信度:${Math.round(res.confidence)}%)
                        </div>
                    </li>`);
            } else {
                 // 视为安全（误判）
                 const shortUrl = res.url ? (res.url.substring(0, 30) + '...') : '无URL';
                 debugInfo.push(`<li style="color:#faad14; font-size:10px;">⚠️ [已过滤] ${res.name} (内容过短或置信度低: "${res.text}" ${Math.round(res.confidence)}%) <br/> <a href="${res.url}" target="_blank" style="color:#666;">${shortUrl}</a></li>`);
            }
        } else if (res.hasText && res.confidence > 50) { 
            // 3. 兜底逻辑：如果置信度在 50-70 之间，但识别出的文字很长（超过5个字），也判定为违规
            // 这能捕获你案例中的情况 (置信度 59%，但字数很多)
            const pureText = res.text.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
            
            // 3.1 白名单过滤 (同步更新逻辑)
            const userWhitelist = JSON.parse(localStorage.getItem('gd-lc-whitelist') || '[]');
            const defaultWhitelist = ['稿定', '发财', '福', '红包', 'VIP', '水印'];
            const whitelist = [...new Set([...defaultWhitelist, ...userWhitelist])];
            
            const isWhitelisted = whitelist.some(word => {
                if (!pureText.includes(word)) return false;
                if (pureText === word) return true;
                if (pureText.length < 8) return true;
                return false;
            });
            
            if (isWhitelisted) return;

            if (pureText.length > 5) {
                const shortUrl = res.url ? (res.url.substring(0, 30) + '...') : '无URL';
                const cleanText = res.text.length > 10 ? res.text.substring(0, 10) + '...' : res.text;
                ocrIssues.push(`
                    <li style="margin-bottom:6px; border-bottom:1px dashed #eee; padding-bottom:4px;">
                        <div style="font-weight:bold; color:#f5222d;">⚠️ 疑似文字: "${cleanText}"</div>
                        <div style="font-size:10px; color:#999;">
                            图层: ${res.name} (置信度:${Math.round(res.confidence)}%)
                        </div>
                    </li>`);
            }
        } else {
             const shortUrl = res.url ? (res.url.substring(0, 30) + '...') : '无URL';
             debugInfo.push(`<li style="color:#aaa; font-size:10px;">✅ [安全] ${res.name} <br/> <a href="${res.url}" target="_blank" style="color:#666;">${shortUrl}</a></li>`);
        }
    });

    const hasOcrIssue = ocrIssues.length > 0;
    const passed = !hasLayerIssue && !hasOcrIssue;

    // --- 导出结果给 Puppeteer ---
    const exportData = {
        passed: passed,
        hasLayerIssue: hasLayerIssue,
        hasOcrIssue: hasOcrIssue,
        ocrIssues: ocrIssues.map(html => html.replace(/<[^>]+>/g, '').trim()), // 简易去标签
        rawOcrResults: results,
        // 补全统计字段
        total: document.getElementById('gd-lc-total') ? parseInt(document.getElementById('gd-lc-total').textContent) : 0,
        // 由于 stats 变量在 updateUI 作用域内，这里较难直接获取
        // 我们可以解析 detail 栏，或者在 updateUI 里把 stats 挂到 window 上
        // 最简单的方法：解析 detail 栏
        // 其实我们可以从 gd-ext-basic-result 里拿 stats，因为它已经存了
        timestamp: Date.now()
    };
    
    // 尝试合并 basic 数据
    try {
        const basicEl = document.getElementById('gd-ext-basic-result');
        if (basicEl) {
            const basicData = JSON.parse(basicEl.textContent);
            exportData.total = basicData.total;
            exportData.groups = basicData.groups;
            exportData.textLayers = basicData.textLayers;
            exportData.imageLayers = basicData.imageLayers;
            exportData.vectorLayers = basicData.vectorLayers;
            // 如果基础审核有 failed reason，也要合并进来
            if (basicData.issues && basicData.issues.length > 0) {
                 // 这里的 issues 是字符串数组
            }
        }
    } catch(e) {}
    
    // 写入隐藏 DOM 供 Puppeteer 读取
    let resultScript = document.getElementById('gd-ext-result');
    if (!resultScript) {
        resultScript = document.createElement('script');
        resultScript.id = 'gd-ext-result';
        resultScript.type = 'application/json';
        document.body.appendChild(resultScript);
    }
    resultScript.textContent = JSON.stringify(exportData);
    // ---------------------------

    // --- 最终 UI 渲染 ---
    const auditEl = document.getElementById('gd-lc-audit');
    
    // 保存这次深度审核的结果到全局，防止 updateUI 覆盖
    window._gd_last_audit_passed = passed;
    window._gd_last_audit_html = ''; 
    
    let resultColor = passed ? '#52c41a' : '#f5222d';
    let resultIcon = passed ? '✅' : '❌';
    let resultText = passed ? '通过' : '不通过';
    
    let detailHtml = '';
    if (passed) {
        // 通过时的详情
        detailHtml = `
            <div style="font-size: 13px; color: #aaa; margin-top: 8px;">审核详情:</div>
            <div style="font-size: 13px; color: #fff; margin-top: 4px;">
                图层分层合理、文字均可编辑
            </div>`;
    } else {
        // 不通过时的详情
        detailHtml = `
            <div style="font-size: 13px; color: #aaa; margin-top: 8px;">审核详情:</div>
            <div style="font-size: 13px; color: #f5222d; margin-top: 4px; font-weight: bold;">
                ${hasLayerIssue ? '<div>图层分层不合理</div>' : ''}
                ${hasOcrIssue ? '<div>存在不可编辑文字</div>' : ''}
            </div>
            
            <ul class="gd-lc-audit-list" style="padding-left:0; list-style:none; margin-top:5px;">
                ${ocrIssues.join('')}
            </ul>`;
    }

    let finalHtml = `
        <div style="margin-bottom: 10px; padding: 0 4px;">
            <div style="font-weight: bold; font-size: 20px; color: ${resultColor}; display: flex; align-items: center; margin-bottom: 5px; margin-left: -4px;">
                <span style="margin-right: 6px;">${resultIcon}</span>${resultText}
            </div>
            ${detailHtml}
        </div>
    `;

    // 更新详情列表 (放在最后) - 移除
    /*
    if (debugInfo.length > 0) {
        finalHtml += `
        <details style="margin-top:10px; border-top:1px solid #333; padding-top:8px; padding-left: 4px;">
            <summary style="font-size:12px; color:#999; cursor:pointer;">查看图片检测详情 (${results.length}张)</summary>
            <ul style="padding-left:0; margin-top:5px; max-height:150px; overflow-y:auto; list-style:none;">
                ${debugInfo.join('')}
            </ul>
        </details>
        `;
    }
    */
    
    // 保存最终 HTML
    window._gd_last_audit_html = finalHtml;
    
    auditEl.innerHTML = finalHtml;

    // 更新状态图标
    const statusIcon = document.getElementById('gd-lc-status-icon');
    if (statusIcon) statusIcon.textContent = passed ? '✅' : '❌';
}

function updateUI(elements, pageCount, canvas = {}) {
    // --- 1. 数据清洗与分类 ---
    let stats = {
        total: 0,       // 实际原子图层总数 (文本+图片+视频等，不含背景)
        groups: 0,      // 组的数量
        boards: 0,      // 画板的数量
        types: {},      // 各类型原子图层统计
        textLayers: 0,  // 专门统计文本图层
        backgrounds: 0, // 背景层数量
        hasRealBackground: false // 是否检测到有效背景
    };

    // 假设 pageCount 就是画板数 (如果是多页设计)
    stats.boards = pageCount || 0;

    // 辅助函数：判断是否为全屏/背景元素
    const isBackgroundElement = (el, index) => {
        // 1. 显式类型
        if (el.type === 'background') return true;
        
        // 2. 如果没有画布尺寸，且是第一个元素且是图片，大概率是背景
        if (!canvas.width && index === 0 && (el.type === 'image' || el.type === 'video')) return true;

        // 3. 有画布尺寸，判断尺寸匹配度 (允许 5px 误差)
        if (canvas.width && canvas.height) {
            const isFullScreen = Math.abs(el.width - canvas.width) < 10 && Math.abs(el.height - canvas.height) < 10;
            // 必须是底层元素 (前3层) 且是图片/视频
            if (index < 3 && isFullScreen && (el.type === 'image' || el.type === 'video')) return true;
        }
        
        return false;
    };

    // 标记是否已经找到背景（只允许一个主背景）
    let backgroundFound = false;

    elements.forEach((el, index) => {
        let type = el.type || 'unknown';
        
        // 归一化类型
        if (type === 'path' || type === 'shape') type = 'svg';
        if (type === 'effectText' || type === 'threeText') type = 'text';
        
        // 识别画板/页面
        if (type === 'page' || type === 'board' || type === 'artboard') {
            stats.boards++; 
            return; 
        }

        // 识别组
        if (type === 'group' || type === 'folder') {
            stats.groups++;
            return; // 组不计入总图层
        }

        // 识别背景 (背景也计入总图层)
        if (!backgroundFound && isBackgroundElement(el, index)) {
            stats.backgrounds++;
            stats.hasRealBackground = true;
            backgroundFound = true;
            // return; // 修改：背景现在也计入总图层
        }

        // 专门统计文本
        if (type === 'text') {
            stats.textLayers++;
        }

        // 其他都算原子图层
        stats.total++;
        stats.types[type] = (stats.types[type] || 0) + 1;
    });

    // --- 2. 更新 UI ---
    
    // 更新总图层数 (大数字)
    const totalEl = document.getElementById('gd-lc-total');
    if (totalEl) totalEl.textContent = stats.total;

    // 更新简略栏信息
    const miniTotalEl = document.getElementById('gd-lc-mini-total');
    if (miniTotalEl) miniTotalEl.textContent = stats.total;
    
    let detailHtml = '';

    // 第一行：概览 (画板、组、背景)
    detailHtml += `<div style="display:flex; gap:10px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:11px; color:#aaa;">`;
    if (stats.boards > 0) detailHtml += `<span>🖼️ 画板 ${stats.boards}</span>`;
    if (stats.backgrounds > 0) detailHtml += `<span>🌄 背景 ${stats.backgrounds}</span>`;
    if (stats.groups > 0) detailHtml += `<span>📂 组 ${stats.groups}</span>`;
    detailHtml += `</div>`;

    // 第二行：具体分类列表
    const sortedTypes = Object.entries(stats.types).sort((a, b) => b[1] - a[1]);
    
    sortedTypes.forEach(([type, count]) => {
        const typeName = translateType(type);
        detailHtml += `<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; align-items:center;">
            <span style="color:#ddd;">${typeName}</span>
            <span style="font-family:monospace; font-weight:bold; color:#40a9ff;">${count}</span>
        </div>`;
    });

    const detailEl = document.getElementById('gd-lc-detail');
    if (detailEl) detailEl.innerHTML = detailHtml;
    
    // 3. 运行审核逻辑
    if (elements.length > 0) {
        // 如果之前已经跑过深度审核且有结果，优先恢复结果，而不是重新跑
        if (window._gd_deep_audit_done && window._gd_last_audit_html) {
             const auditEl = document.getElementById('gd-lc-audit');
             if (auditEl) auditEl.innerHTML = window._gd_last_audit_html;
             
             // 恢复图标状态
             const statusIcon = document.getElementById('gd-lc-status-icon');
             if (statusIcon) statusIcon.textContent = window._gd_last_audit_passed ? '✅' : '❌';
             
             return; // 直接返回，不再跑 runAudit（因为 runAudit 会覆盖 UI）
        }

        // 自动触发深度审核
        // 修复：增加防抖，避免每次 updateUI 都触发
        if (!window._gd_deep_audit_running && !window._gd_deep_audit_done) {
             runDeepAudit();
        }
    }
    
    // 如果还没深度审核过，或者正在审核中，可以先显示基础审核结果
    if (!window._gd_deep_audit_done) {
        runAudit(elements, stats, canvas);
    }

    const tipEl = document.querySelector('.gd-lc-tip');
    if (tipEl) tipEl.style.display = 'none';
}

function runAudit(elements, stats, canvas) {
    const auditEl = document.getElementById('gd-lc-audit');
    if (!auditEl) return;

    let issues = [];

    // 规则 1: 图层分层合理性
    // 如果总图层很少 (<2) 且没有组，可能是整图
    // 注意：现在 total 已经剔除了背景。如果 total=0，说明只有背景。如果 total=1，说明只有1个元素。
    if (stats.total === 0) {
        issues.push("无图层分层");
    } else if (stats.total < 2 && stats.groups === 0) {
        issues.push("有效图层过少，疑似整图未分层");
    }

    // 规则 2: 文字可编辑性
    // 只有当存在图层时才检测文字，避免在“无图层分层”时报多余的错
    if (stats.total > 0) {
        // 如果没有文本图层
        if (stats.textLayers === 0) {
            issues.push("未检测到可编辑文字，文字可能已被栅格化");
        } else if (stats.total > 5 && (stats.textLayers / stats.total) < 0.1) {
            issues.push("可编辑文字占比过低");
        }
    }

    // 规则 3: 背景分离检测
    // 已经在 updateUI 里检测了 hasRealBackground
    if (!stats.hasRealBackground && stats.total > 0) {
        // 如果没有识别出背景，但有图层。可能是背景太小，或者背景是纯色（无 element），或者背景混在图层里了
        // 如果 elements[0] 尺寸很大但没被识别为背景（比如 index 很大？不，index=0）
        // 这里的提示稍微温和一点
        if (stats.total > 5) {
             // issues.push("未检测到独立背景层");
        }
    }


    // --- 输出结果 ---
    const statusIcon = document.getElementById('gd-lc-status-icon');
    
    // --- 导出基础数据给 Puppeteer ---
    const exportData = {
        total: stats.total,
        groups: stats.groups,
        textLayers: stats.textLayers,
        // 新增详细统计
        imageLayers: (stats.types['image'] || 0) + (stats.types['mask'] || 0) + (stats.types['ninePatch'] || 0),
        vectorLayers: (stats.types['svg'] || 0) + (stats.types['shape'] || 0) + (stats.types['path'] || 0),
        issues: issues,
        passed: issues.length === 0, // 暂时只看基础
        timestamp: Date.now()
    };
    
    let resultScript = document.getElementById('gd-ext-basic-result');
    if (!resultScript) {
        resultScript = document.createElement('script');
        resultScript.id = 'gd-ext-basic-result';
        resultScript.type = 'application/json';
        document.body.appendChild(resultScript);
    }
    resultScript.textContent = JSON.stringify(exportData);
    // -------------------------------

    // 基础分层审核结果
    let basicAuditResult = '';
    if (issues.length === 0) {
        basicAuditResult = `
            <div class="gd-lc-audit-result success">
                <div class="gd-lc-audit-icon">✅</div>
                <div class="gd-lc-audit-text">图层分层合理</div>
            </div>`;
    } else {
        basicAuditResult = `
            <div class="gd-lc-audit-result error">
                <div class="gd-lc-audit-icon">❌</div>
                <div class="gd-lc-audit-text">不通过：分层不合理</div>
            </div>
            <ul class="gd-lc-audit-list">
                ${issues.map(i => `<li>${i}</li>`).join('')}
            </ul>`;
    }
    
    auditEl.innerHTML = basicAuditResult;
    
    // 初始化深度审核区域
    // 只有当有图层时才显示深度审核
    if (stats.total > 0) {
        const deepAuditEl = document.createElement('div');
        deepAuditEl.id = 'gd-lc-deep-audit';
        deepAuditEl.innerHTML = '<div class="gd-lc-audit-waiting">正在进行深度视觉审核...</div>';
        auditEl.appendChild(deepAuditEl);
    }

    // 更新状态图标
    if (statusIcon) statusIcon.textContent = issues.length === 0 ? '✅' : '❌';
}

function getIconForType(type) {
    type = (type || '').toLowerCase();
    if (type.includes('text')) return '📝';
    if (type.includes('image')) return '🖼️';
    if (type.includes('group')) return '📁';
    if (type.includes('svg') || type.includes('shape')) return '🔶';
    if (type.includes('video')) return '🎬';
    if (type.includes('audio')) return '🎵';
    return '📄';
}

function translateType(type) {
    const map = {
        'text': '文字',
        'threeText': '文字',
        'effectText': '文字', // 新增
        'image': '图片',
        'mask': '图片',
        'ninePatch': '图片', // 新增：九宫格图也是图片
        'svg': '矢量图', // 改名
        'shape': '矢量图', // 改名
        'path': '矢量图', // 新增
        'group': '组合',
        'background': '背景',
        'video': '视频',
        'audio': '音频',
        'flex': '表格/布局'
    };
    // 模糊匹配
    if (type.toLowerCase().includes('text')) return '文字';
    if (type.toLowerCase().includes('path') || type.toLowerCase().includes('shape') || type.toLowerCase().includes('svg')) return '矢量图';
    
    return map[type] || type;
}
