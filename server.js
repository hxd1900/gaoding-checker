const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 用于保存 Cookies 的文件路径 (废弃，改用 UserDataDir)
// const COOKIES_PATH = path.join(__dirname, 'cookies.json');
// 在受限环境中，使用项目目录下的 UserDataDir 可能会导致 crashpad 报错
// 尝试使用 /tmp 目录，或者忽略 crashpad 错误
const USER_DATA_DIR = path.join('/tmp', 'gaoding-chrome-data');

// 确保用户数据目录存在
if (!fs.existsSync(USER_DATA_DIR)) {
    try {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    } catch (e) {
        console.error('创建用户数据目录失败:', e);
    }
}

// 全局浏览器实例管理
let globalBrowser = null;
let globalPage = null; // 方案 A: 全局复用单个页面
// 使用相对路径，方便部署
const EXTENSION_PATH = path.join(__dirname, 'extension');

// 启动浏览器 (必须有头模式才能加载插件)
async function launchBrowser() {
    if (globalBrowser) {
        try {
            if (globalBrowser.isConnected()) {
                // 确保 globalPage 也是活的
                if (!globalPage || globalPage.isClosed()) {
                    const pages = await globalBrowser.pages();
                    globalPage = pages.length > 0 ? pages[0] : await globalBrowser.newPage();
                }
                return globalBrowser;
            }
        } catch(e) { globalBrowser = null; globalPage = null; }
    }
    
    console.log(`正在启动浏览器 (加载插件 + 持久化存储)...`);
    // 确保目录存在
    if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

    try {
        globalBrowser = await puppeteer.launch({
            headless: false, // 插件必须在有头模式下运行
            defaultViewport: null,
            userDataDir: USER_DATA_DIR, 
            args: [
                '--disable-gpu', 
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-breakpad', 
                '--disable-crash-reporter',
                `--disable-extensions-except=${EXTENSION_PATH}`,
                `--load-extension=${EXTENSION_PATH}`,
                '--window-position=10000,10000', // 移出屏幕
                // 增加 Docker 环境可能需要的参数
                '--disable-software-rasterizer',
                '--mute-audio',
            ]
        });
        
        // 方案 A: 初始化全局页面
        const pages = await globalBrowser.pages();
        globalPage = pages.length > 0 ? pages[0] : await globalBrowser.newPage();
        
        globalBrowser.on('disconnected', () => {
            console.log('浏览器已断开');
            globalBrowser = null;
            globalPage = null;
        });
        
        return globalBrowser;
    } catch (e) {
        console.error('启动浏览器失败:', e);
        // 如果带 userDataDir 启动失败，尝试不带 userDataDir 启动（降级模式）
        console.log('尝试降级模式启动 (无持久化)...');
        try {
             globalBrowser = await puppeteer.launch({
                headless: false,
                defaultViewport: null,
                args: [
                    '--disable-gpu', 
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    `--disable-extensions-except=${EXTENSION_PATH}`,
                    `--load-extension=${EXTENSION_PATH}`,
                    '--window-position=10000,10000',
                ]
            });
            // 降级模式也需要初始化页面
            const pages = await globalBrowser.pages();
            globalPage = pages.length > 0 ? pages[0] : await globalBrowser.newPage();
            return globalBrowser;
        } catch (e2) {
            console.error('降级启动也失败:', e2);
            throw e2;
        }
    }
}

// 核心检测函数 (Puppeteer) - v7.7 单页复用版
async function checkTemplate(browser, id) {
    // 确保有可用页面
    if (!globalPage || globalPage.isClosed()) {
        const pages = await browser.pages();
        globalPage = pages.length > 0 ? pages[0] : await browser.newPage();
    }
    const page = globalPage;

    try {
        console.log(`[${id}] 在当前页面跳转...`);
        
        // 使用同一个页面跳转，避免弹窗
        await page.goto(`https://www.gaoding.com/editor/design?id=${id}`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });

        // 2. 登录检测 (逻辑不变)
        if (page.url().includes('login') || page.url().includes('passport')) {
            console.warn(`[${id}] 需要登录，等待用户操作...`);
            try {
                // 等待 URL 变回编辑器
                await page.waitForFunction(() => {
                    return /editor\/design/.test(window.location.href) && !/login|passport/.test(window.location.href);
                }, { timeout: 300000 }); 
                
                console.log(`[${id}] 登录成功！`);
                await new Promise(r => setTimeout(r, 2000));
            } catch(e) {
                return { id, status: 'failed', error: '登录超时' };
            }
        }

        // 3. 等待插件结果 (逻辑不变)
        
        // 轮询读取结果
        let finalData = null;
        let startTime = Date.now();
        
        while (Date.now() - startTime < 60000) {
            // 检查页面是否还在当前 ID，防止意外跳转
            if (!page.url().includes(id)) {
                 // 如果页面变了（比如被用户手动跳走了），本次检测失败
                 // 但这里是串行执行，一般不会变
            }

            const data = await page.evaluate(() => {
                const deepEl = document.getElementById('gd-ext-result');
                const basicEl = document.getElementById('gd-ext-basic-result');
                
                let basicData = basicEl ? JSON.parse(basicEl.textContent) : null;
                let deepData = deepEl ? JSON.parse(deepEl.textContent) : null;
                
                if (deepData) {
                    return { type: 'deep', ...(basicData || {}), ...deepData };
                }
                if (basicData) {
                    return { type: 'basic', ...basicData };
                }
                return null;
            });

            if (data) {
                if (data.type === 'deep') {
                    finalData = data;
                    break;
                }
                if (data.type === 'basic') {
                    if (data.total === 0) {
                        finalData = data;
                        break;
                    }
                    finalData = data; 
                }
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!finalData) {
            return { id, status: 'failed', error: '超时：插件未返回检测结果' };
        }
        
        if (finalData.type === 'basic' && finalData.total > 0) {
             return { 
                 id, 
                 status: 'failed', 
                 error: 'OCR 检测超时，无法确认最终结果',
                 data: finalData 
             };
        }

        console.log(`[${id}] 获取到检测结果:`, finalData.type);
        return { id, status: 'success', data: finalData };

    } catch (e) {
        console.error(`[${id}] 发生错误:`, e.message);
        return { id, status: 'error', error: e.message };
    } finally {
        // 关键：不要关闭页面！
        // if (page && !page.isClosed()) await page.close();
    }
}

// 适配器：将插件数据转换为前端需要的格式
function adaptPluginData(pluginData) {
    // 插件返回的数据结构已经在 content.js 中定义好了
    // type: 'deep' | 'basic'
    // deep: { passed, hasLayerIssue, hasOcrIssue, ocrIssues, rawOcrResults, ... }
    // basic: { total, groups, textLayers, issues, passed, ... }
    
    // 我们需要返回给前端: { total, groups, ... } 用于显示 stats
    // 以及 passed/reason 用于显示结果
    
    // 如果只有 basic 数据
    if (pluginData.type === 'basic') {
        return {
            total: pluginData.total,
            groups: pluginData.groups,
            textLayers: pluginData.textLayers,
            passed: pluginData.passed,
            reason: pluginData.issues.join('; ') || '符合规范',
            detail: pluginData.issues.join('; ')
        };
    }
    
    // 如果有 deep 数据
    // deep 数据里没有 total/groups 等详细统计，因为那是 content.js 的局部变量
    // 哎呀，我在 content.js 的 exportData 里漏了 total/groups！
    // 不过 basic 数据肯定在 deep 之前生成，我们可以尝试 merge，或者 modify content.js
    // 现在的逻辑是：如果拿到 deep，就 break 了。
    // 让我在 content.js 里把 stats 也加到 deep export 里吧？
    // 或者，简单的做法：Puppeteer 读取时，同时读取 basic 和 deep，合并之。
    
    return {
        passed: pluginData.passed,
        reason: pluginData.hasLayerIssue ? '图层结构问题' : (pluginData.hasOcrIssue ? '存在未转曲文字' : '符合规范'),
        detail: (pluginData.ocrIssues || []).join('; ') || (pluginData.hasLayerIssue ? '分层不合理' : '符合规范'),
        // 暂时拿不到 total/groups，除非修改 content.js。
        // 为了快速修复，我们在 evaluate 里把 basic 的数据也带上
    };
}

// API
app.post('/api/check', async (req, res) => {
    const { ids } = req.body;
    if (!ids) return res.status(400).json({ error: 'Missing ids' });

    let browser = await launchBrowser(); 

    const results = [];
    for (const id of ids) {
        if (!id.trim()) continue;
        
        try {
            // 获取混合数据
            let result = await checkTemplate(browser, id.trim());
            
            if (result.status === 'success') {
                // 在 checkTemplate 内部我们只拿到了 finalData (可能是 deep 或 basic)
                // 实际上我们需要合并。
                // 让我们修改 checkTemplate 的 evaluate 逻辑，一次性拿所有 DOM 数据
                
                // 重新构造数据给前端
                const d = result.data;
                
                // 这里需要一点 trick：Puppeteer 拿到的可能是 basic+deep 的混合体
                // 我们在 content.js 的 deep export 里并没有包含 total。
                // 但页面上肯定有 basic 的 script 标签。
                
                // 为了避免麻烦，我在 checkTemplate 里已经尽力拿了。
                // 如果 finalData 是 deep，它缺 total。
                // 让我去 content.js 补一下 total 吧，这样最稳。
            }
            
            // 临时逻辑：如果 content.js 没改，这里会缺字段。
            // 先按 result.data 原样返回，前端可能显示 undefined。
            // 稍后我马上去改 content.js
            
            results.push({
                id: id.trim(),
                process_status: result.status === 'success' ? 'detected' : 'failed',
                audit_result: result.data?.passed ? 'pass' : 'reject',
                detail: result.data?.ocrIssues?.join('; ') || result.data?.issues?.join('; ') || '',
                data: {
                    total: result.data?.total || 0, // 待修复
                    groups: result.data?.groups || 0 // 待修复
                }
            });

        } catch (e) {
            results.push({ id, process_status: 'failed', error: e.message });
        }
    }
    
    res.json({ results });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});