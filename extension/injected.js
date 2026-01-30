(function() {
    console.log("🕵️‍♂️ 稿定图层计数器：拦截脚本已注入 v1.45 (精简版)");

    // 核心发送函数
    function sendData(data, source, extraInfo = {}) {
        let elements = [];
        
        if (Array.isArray(data)) {
            elements = data.map(el => {
                // 基础信息
                const base = {
                    type: el.type || (el.constructor ? el.constructor.name : 'unknown'),
                    id: el.id || el.name || Math.random().toString(),
                };

                // 尝试提取更多元数据 (兼容 Vue 对象和 DOM 节点)
                // 1. 标题/名称
                base.title = el.title || el.name || el.label || '';
                
                // 2. 内容 (文本)
                base.text = el.content || el.text || el.innerText || '';
                
                // 3. 资源 (图片/视频 URL)
                base.url = el.imageUrl || el.url || el.src || el.videoUrl || '';
                if (!base.url && el.tagName === 'IMG') base.url = el.src;
                if (!base.url && el.style && el.style.backgroundImage) {
                    base.url = el.style.backgroundImage.replace(/^url\(['"](.+)['"]\)$/, '$1');
                }

                // 4. 可见性
                base.visible = el.visible !== false && el.opacity !== 0;

                // 5. 尺寸与位置 (用于智能审核)
                base.width = el.width || el.offsetWidth || 0;
                base.height = el.height || el.offsetHeight || 0;
                base.left = el.left || el.offsetLeft || 0;
                base.top = el.top || el.offsetTop || 0;

                return base;
            });
        } else if (typeof data === 'number') {
            elements = new Array(data).fill({ type: 'unknown', id: Math.random().toString() });
        }
        
        // 允许发送空数据 (用于触发 "无图层" 状态)
        if (Array.isArray(elements)) {
            console.log(`%c[GD-Layer] 捕获成功 (${source}): ${elements.length} 个对象`, "color: green; font-weight: bold;");
            window.postMessage({ 
                type: 'GAODING_DATA_CAPTURED', 
                payload: { 
                    layouts: [{ elements: elements }],
                    canvas: extraInfo.canvas || {} // 发送画布信息
                }, 
                source: source 
            }, '*');
        }
    }

    // --- 工具：DOM 类型猜测 ---
    function guessTypeFromDom(node) {
        const html = node.outerHTML.toLowerCase();
        const className = node.className.toLowerCase();
        const style = window.getComputedStyle(node);
        
        // 排除隐藏元素
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null;

        if (html.includes('text') || className.includes('text')) return 'text';
        if (html.includes('image') || html.includes('img') || className.includes('image')) return 'image';
        if (html.includes('group') || html.includes('folder') || className.includes('group')) return 'group';
        if (html.includes('svg') || html.includes('shape') || html.includes('icon')) return 'svg';
        if (html.includes('video')) return 'video';
        return 'unknown';
    }

    // --- 策略 A: Vue 深度遍历 (兼容 Vue 2 & Vue 3) ---
    function findEditorData() {
        // 1. 尝试获取 Vue 根实例
        const root = document.getElementById('app') || document.querySelector('#app') || document.body;
        let vueRoot = root.__vue__; // Vue 2
        let vue3App = root.__vue_app__; // Vue 3

        // --- Vue 3 专门处理 ---
        if (vue3App) {
             try {
                const store = vue3App._context.provides.store || vue3App._context.provides.key;
                const globalStore = vue3App.config?.globalProperties?.$store;
                const targetStore = store || globalStore;
                if (targetStore && targetStore.state) {
                    return searchInState(targetStore.state);
                }
            } catch(e) {}
        }
        
        // 尝试从页面搜索 .editor-container 类
        const editorContainer = document.querySelector('.editor-container');
        if (editorContainer && editorContainer.__vue__) {
            const vm = editorContainer.__vue__;
            if (vm.layouts) {
                // 构建标准返回结构
                const elements = [];
                const extractElements = (layout) => {
                    if (layout.elements) {
                        layout.elements.forEach(el => {
                            elements.push(el);
                            if (el.elements) extractElements(el);
                        });
                    }
                    if (layout.background && layout.background.image) {
                        elements.push({
                            type: 'background',
                            id: 'bg-' + Math.random(),
                            imageUrl: layout.background.image.url,
                            width: layout.background.image.width,
                            height: layout.background.image.height
                        });
                    }
                };
                
                if (Array.isArray(vm.layouts)) {
                    vm.layouts.forEach(extractElements);
                }
                const canvas = vm.layouts[0] || {};
                return { elements, canvas: { width: canvas.width, height: canvas.height }, source: 'Vue:EditorContainer' };
            }
        }
        
        if (!vueRoot) return null;

        let queue = [vueRoot];
        let visited = new Set();
        let depth = 0;
        
        while(queue.length > 0 && depth < 3000) {
            const vm = queue.shift();
            if (visited.has(vm)) continue;
            visited.add(vm);
            depth++;

            try {
                // 1. 检查 $data
                if (vm.$data) {
                    const res = searchInObject(vm.$data);
                    if (res) return res;
                }
                
                // 2. 检查 $store
                if (vm.$store && vm.$store.state) {
                     const res = searchInState(vm.$store.state);
                     if (res) return res;
                }
            } catch(e) {}

            if (vm.$children) queue.push(...vm.$children);
        }
        return null;
    }

    // 抽离出的搜索逻辑
    function searchInState(state) {
         // A. 常用路径
         const candidates = [
             state.editor?.layouts?.[0]?.elements,
             state.design?.layouts?.[0]?.elements,
             state.global?.layouts?.[0]?.elements,
             state.editor?.canvas?.elements,
             state.editor?.elementList,
             state.dms?.layouts?.[0]?.elements,
             state.canvas?.layers
         ];
         
         const layout = state.editor?.layouts?.[0] || state.design?.layouts?.[0] || state.global?.layouts?.[0] || state.dms?.layouts?.[0];
         const canvasInfo = layout ? { width: layout.width, height: layout.height } : {};

         for(let c of candidates) {
             if (Array.isArray(c) && c.length > 0) {
                 return { elements: c, canvas: canvasInfo };
             }
         }

         // B. 深度递归
         const found = findElementsInObject(state, 0);
         if (found) {
             console.log("[GD-Layer] 通过深度搜索找到图层数据");
             return { elements: found, canvas: canvasInfo }; 
         }
         return null;
    }

    // 辅助：对象搜索
    function searchInObject(obj) {
         if (obj.elements && Array.isArray(obj.elements) && obj.elements.length > 0) {
             // 尝试找 canvas
             const canvas = obj.layouts?.[0] || obj.canvas || {};
             return { elements: obj.elements, canvas: { width: canvas.width, height: canvas.height } };
         }
         if (obj.layouts && Array.isArray(obj.layouts) && obj.layouts[0] && obj.layouts[0].elements) {
             return { elements: obj.layouts[0].elements, canvas: obj.layouts[0] };
         }
         return null;
    }

    // 辅助：深度递归 (原有逻辑移动到这里)
    const findElementsInObject = (obj, depth) => {
        if (depth > 4 || !obj || typeof obj !== 'object') return null;
        
        if (Array.isArray(obj)) {
            if (obj.length > 0 && obj[0] && (obj[0].id || obj[0].uuid) && (obj[0].type || obj[0].elementName)) {
                return obj;
            }
            return null;
        }

        for (let key in obj) {
            if (['history', 'user', 'ui', 'clipboard', 'guide', 'hotkey', 'assets', 'resource'].includes(key)) continue;
            
            if (key === 'elements' || key === 'layers' || key === 'widgets') {
                const res = findElementsInObject(obj[key], depth + 1);
                if (res) return res;
            }
            
            if (key === 'layouts' && Array.isArray(obj[key]) && obj[key][0]) {
                if (obj[key][0].elements) return obj[key][0].elements;
            }

            if (!key.startsWith('_') && typeof obj[key] === 'object') {
                const res = findElementsInObject(obj[key], depth + 1);
                if (res) return res;
            }
        }
        return null;
    };

    // --- 策略 B: DOM 暴力统计 (保底，无需图层面板) ---
    function scanDom() {
        // 1. 优先找图层面板 (最准)
        const layerItems = document.querySelectorAll('.layer-item, .element-item, [data-type="layer"], .layers-list > div, .layer-tree-node');
        
        if (layerItems.length > 0) {
            const elements = Array.from(layerItems)
                .map(node => {
                    const html = node.outerHTML.toLowerCase();
                    const className = node.className.toLowerCase();
                    const textContent = node.innerText.trim(); 

                    const hasChildren = node.nextElementSibling && 
                                      (node.nextElementSibling.classList.contains('layer-children') || 
                                       node.nextElementSibling.classList.contains('sub-layers'));

                    const isGroup = 
                        className.includes('group') || 
                        node.getAttribute('data-type') === 'group' ||
                        node.querySelector('.icon-group, .gd-icon-group, .group-icon') !== null ||
                        node.querySelector('.layer-expand, .tree-arrow, .icon-arrow-right, .expand-icon') !== null ||
                        html.includes('icon-folder') ||
                        textContent === '组' || 
                        textContent.startsWith('组 ') || 
                        textContent.endsWith(' 组') ||
                        textContent.includes('组') && !textContent.includes('组合') || 
                        (node.querySelector('input') && node.querySelector('input').value === '组') ||
                        (node.querySelector('.layer-name, .name') && node.querySelector('.layer-name, .name').innerText.trim() === '组') ||
                        hasChildren;
                    
                    if (isGroup) {
                        return { type: 'group', id: Math.random().toString() };
                    }
                    
                    return { 
                        type: node.getAttribute('data-type') || guessTypeFromDom(node), 
                        id: Math.random().toString() 
                    };
                })
                .filter(el => el.type !== null); 
            return { count: elements.length, data: elements, source: 'DOM:图层面板' };
        }

        // 2. 如果图层面板没打开，找画布上的交互节点
        const canvasItems = document.querySelectorAll('.editor-canvas .element, .editor-shell .widget, [data-element-id], .renderer-container .element-layer');
        if (canvasItems.length > 0) {
            const validItems = Array.from(canvasItems).filter(node => {
                const rect = node.getBoundingClientRect();
                return rect.width > 5 && rect.height > 5;
            });
            
            if (validItems.length > 0) {
                 const elements = validItems.map(node => ({ type: 'unknown', id: Math.random().toString() }));
                 return { count: validItems.length, data: elements, source: 'DOM:画布节点' };
            }
        }
        
        // 3. 终极保底：通过 CSS 选择器猜测
        const gdElements = document.querySelectorAll('.gd-element, .editor-element');
        if (gdElements.length > 0) {
             const elements = Array.from(gdElements).map(node => ({ type: 'unknown', id: Math.random().toString() }));
             return { count: gdElements.length, data: elements, source: 'DOM:gd-element' };
        }
        
        return null;
    }

    // --- 策略 C: 全局变量扫描 (针对 Vuex 未挂载到 DOM 的情况) ---
    function scanGlobals() {
        const potentialKeys = Object.keys(window).filter(k => 
            ['editor', 'design', 'schema', 'store', 'app', 'piso', 'canvas', 'stage', 'project', 'work'].some(term => k.toLowerCase().includes(term)) ||
            k.startsWith('__') // __NUXT__, __INITIAL_STATE__
        );
        
        // 增加一些已知可能的变量名
        potentialKeys.push('gd', 'gaoding', '_v_store');

        for (const key of potentialKeys) {
            try {
                const obj = window[key];
                if (!obj || typeof obj !== 'object') continue;

                // 1. 直接搜索对象
                const res = searchInObject(obj); 
                if (res) return { ...res, source: `Global:${key}` };
                
                // 2. 如果是 Vue 3 App 实例
                if (obj._context || obj.config) {
                     const store = obj._context?.provides?.store || obj.config?.globalProperties?.$store;
                     if (store && store.state) {
                         const res2 = searchInState(store.state);
                         if (res2) return { ...res2, source: `Global:${key}->Store` };
                     }
                }
                
                // 3. 检查 Store 及其 State
                if (obj.state && searchInState(obj.state)) return { ...searchInState(obj.state), source: `Global:${key}->State` };
                if (obj.store && obj.store.state && searchInState(obj.store.state)) return { ...searchInState(obj.store.state), source: `Global:${key}->Store` };

            } catch(e) {}
        }
        return null;
    }

    // --- 策略 D: Vue 3 DOM 深度扫描 (暴力查找组件状态) ---
    function scanVue3Deep() {
        // 为了性能，只扫描特定容器下的节点
        const containers = document.querySelectorAll('#app, .editor-canvas, .design-editor, body');
        
        for (const root of containers) {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
            let node;
            let count = 0;
            while(node = walker.nextNode()) {
                count++;
                if (count > 500) break; // 限制扫描数量，防止卡顿

                // 检查 Vue 3 内部属性
                // __vueParentComponent 是 Vue 3 组件实例的常见挂载点
                const instance = node.__vueParentComponent || (node.__vnode && node.__vnode.component);
                
                if (instance) {
                    // 检查 setupState (Vue 3 script setup)
                    if (instance.setupState) {
                        const res = searchInObject(instance.setupState);
                        if (res) return { ...res, source: 'Vue3Deep:setupState' };
                    }
                    // 检查 data
                    if (instance.data) {
                        const res = searchInObject(instance.data);
                        if (res) return { ...res, source: 'Vue3Deep:data' };
                    }
                    // 检查 props
                    if (instance.props) {
                        const res = searchInObject(instance.props);
                        if (res) return { ...res, source: 'Vue3Deep:props' };
                    }
                    // 检查 ctx
                    if (instance.ctx) {
                        const res = searchInObject(instance.ctx);
                        if (res) return { ...res, source: 'Vue3Deep:ctx' };
                    }
                }
            }
        }
        return null;
    }

    // --- 策略 E: Vue 3 DevTools 钩子 (上帝视角 - 修复版) ---
    function scanDevtoolsHook() {
        const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook) return null; // Hook 可能还没准备好

        // 有时候 hook.apps 是空的，因为应用还没注册
        // 我们需要监听 app:init 事件
        if (!hook._gd_listening) {
            hook._gd_listening = true;
            hook.on('app:init', (app) => {
                console.log("[GD-Layer] 捕获到新的 Vue App 初始化");
                // 立即扫描这个新 App
                const res = scanVueApp(app);
                if (res) {
                    sendData(res.elements, 'DevTools:AppInit', { canvas: res.canvas });
                }
            });
        }

        if (!hook.apps || hook.apps.length === 0) return null;

        // 遍历所有注册的 Vue 应用
        for (const app of hook.apps) {
             const res = scanVueApp(app);
             if (res) return { ...res, source: 'DevTools:AppsLoop' };
        }
        return null;
    }

    // 辅助：扫描单个 Vue App
    function scanVueApp(app) {
        // 1. 尝试从 app._instance 找
        if (app._instance) {
             const res = searchInObject(app._instance.data);
             if (res) return res;
             
             if (app._instance.ctx) {
                 const resCtx = searchInObject(app._instance.ctx);
                 if (resCtx) return resCtx;
             }
             
             // 检查 provide
             if (app._instance.provides) {
                 const res = searchInObject(app._instance.provides);
                 if (res) return res;
             }
        }
        
        // 2. 尝试从 app._container._vnode 找
        if (app._container && app._container._vnode && app._container._vnode.component) {
             const rootComponent = app._container._vnode.component;
             const res = findInComponentTree(rootComponent);
             if (res) return res;
        }

        // 3. 尝试从 app.config.globalProperties 找 Store
        if (app.config && app.config.globalProperties) {
             if (app.config.globalProperties.$store) {
                 const res = searchInState(app.config.globalProperties.$store.state);
                 if (res) return res;
             }
             // 有些项目把 store 挂在其他名字上
             const res = searchInObject(app.config.globalProperties);
             if (res) return res;
        }
        
        return null;
    }

    // --- 策略 G: 针对 Skia/Piso 引擎的特定探测 ---
    function scanPisoEngine() {
        const targets = [
            window.piso, 
            window.engine, 
            window.editor, 
            window.layout,
            window.__PISO_ENGINE__,
            window.design
        ];
        
        for(let t of targets) {
            if (t) {
                try {
                    if (typeof t.getData === 'function') {
                        const data = t.getData();
                        const res = searchInObject(data);
                        if (res) return { ...res, source: 'Piso:getData' };
                    }
                    const res = searchInObject(t);
                    if (res) return { ...res, source: 'Piso:Property' };
                } catch(e) {}
            }
        }
        
        // 尝试在 DOM 上找挂载的编辑器实例
        const editorDom = document.querySelector('.editor-canvas') || document.querySelector('canvas');
        if (editorDom) {
            // 检查常见的挂载属性
            const props = ['__piso__', '_piso', '__editor__', '_editor', '__instance__'];
            for(let p of props) {
                if (editorDom[p]) {
                     const res = searchInObject(editorDom[p]);
                     if (res) return { ...res, source: `PisoDOM:${p}` };
                }
            }
        }
        
        return null;
    }

    // 辅助：组件树递归搜索
    function findInComponentTree(component, depth = 0) {
        if (depth > 15) return null; 
        if (!component) return null;

        if (component.setupState) {
            const res = searchInObject(component.setupState);
            if (res) return res;
        }
        if (component.data) {
            const res = searchInObject(component.data);
            if (res) return res;
        }
        if (component.ctx) {
            const res = searchInObject(component.ctx);
            if (res) return res;
        }
        
        if (component.props) {
            const res = searchInObject(component.props);
            if (res) return res;
        }

        if (component.subTree) {
             const res = findInVNode(component.subTree, depth + 1);
             if (res) return res;
        }
        return null;
    }

    function findInVNode(vnode, depth) {
        if (!vnode) return null;
        if (vnode.component) {
            const res = findInComponentTree(vnode.component, depth);
            if (res) return res;
        }
        if (Array.isArray(vnode.children)) {
            for (const child of vnode.children) {
                if (typeof child === 'object') {
                    const res = findInVNode(child, depth);
                    if (res) return res;
                }
            }
        }
        if (typeof vnode.children === 'object') {
             const res = findInVNode(vnode.children, depth);
             if (res) return res;
        }
        return null;
    }

    // --- 策略 F: 网络请求拦截 (修复版) ---
    function setupNetworkInterceptor() {
        // 1. 拦截 fetch
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const response = await originalFetch.apply(this, args);
            try {
                // 只有成功的 JSON 响应才处理
                const contentType = response.headers.get('content-type');
                if (response.ok && contentType && contentType.includes('application/json')) {
                    const clone = response.clone();
                    clone.json().then(data => {
                        const res = searchInObject(data);
                        if (res) {
                            console.log("[GD-Layer] 通过 Fetch 拦截捕获数据");
                            sendData(res.elements, 'Network:Fetch', { canvas: res.canvas });
                        }
                    }).catch(() => {});
                }
            } catch(e) {}
            return response;
        };

        // 2. 拦截 XHR
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(...args) {
            this._url = args[1]; // 记录请求 URL 方便调试
            return originalOpen.apply(this, args);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            this.addEventListener('load', function() {
                try {
                    const contentType = this.getResponseHeader('content-type');
                    if (this.status >= 200 && this.status < 300 && contentType && contentType.includes('application/json')) {
                         const data = JSON.parse(this.responseText);
                         const res = searchInObject(data);
                         if (res) {
                             console.log(`[GD-Layer] 通过 XHR 拦截捕获数据 (${this._url})`);
                             sendData(res.elements, 'Network:XHR', { canvas: res.canvas });
                         }
                    }
                } catch(e) {}
            });
            return originalSend.apply(this, args);
        };
        
        console.log("[GD-Layer] 网络拦截器已激活");
    }

    // --- 策略 G: Canvas 绘制指令拦截 ---
    function setupCanvasInterceptor() {
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(...args) {
            const ctx = originalGetContext.apply(this, args);
            if (args[0] === '2d' && !ctx._gd_hooked) {
                ctx._gd_hooked = true;
                if (this.__vue__ || this._stage || this.data) {
                    // 已经在 scanGlobals 或 scanDom 覆盖了
                }
            }
            return ctx;
        };
    }

    // 立即启动
    setupNetworkInterceptor();
    setupCanvasInterceptor();

    // --- 策略 H: 模拟用户行为 (UI 自动触发 - 精准定位版 v3) ---
      function autoTriggerLayerPanel() {
          setTimeout(() => {
              _doAutoTrigger();
          }, 1000);
      }

      function _doAutoTrigger() {
          console.log("[GD-Layer] 开始寻找图层按钮...");
          let layerBtn = null;
          
          // 根据最新截图 (2025.1.29) 提供的精确选择器
          const preciseSelector = 'div[data-guide="toggle-layer"]';
          layerBtn = document.querySelector(preciseSelector);
          
          // 2. 结构化选择器 (防止 data-guide 缺失)
          if (!layerBtn) {
              const structSelector = '.dbu-page-indicator__nav_left';
              layerBtn = document.querySelector(structSelector);
          }

          // 3. SVG 类名选择器
          if (!layerBtn) {
               const svg = document.querySelector('svg.gd_design_icon-layers');
               if (svg) {
                   layerBtn = svg.closest('.dbu-page-indicator__nav_left') || svg.parentElement;
               }
          }
          
          // 检查图层面板是否已经打开
          const isPanelOpen = document.querySelector('.layer-list-container, .layer-panel-body, .layer-item');
  
          if (layerBtn && !isPanelOpen) {
              console.log("[GD-Layer] 🤖 自动触发：点击图层按钮 (精准匹配)", layerBtn);
              layerBtn.click();
              layerBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
              layerBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
              
              window._gd_auto_triggered = true;
          } else if (!layerBtn) {
              console.log("[GD-Layer] ⚠️ 依然没找到按钮，请检查 data-guide='toggle-layer' 是否存在");
          } else {
              console.log("[GD-Layer] 图层面板似乎已打开，跳过点击");
          }
      }
    
    // --- 监听来自 Content Script 的指令 ---
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GD_LC_OPEN_LAYER_PANEL') {
            console.log("[GD-Layer] 收到指令：手动展开图层面板");
            autoTriggerLayerPanel();
        }
    });

    // --- 策略 I: IndexedDB 数据库扫描 ---
    function scanIndexedDB() {
        if (!window.indexedDB) return;
        
        indexedDB.databases().then(dbs => {
            dbs.forEach(dbInfo => {
                if (dbInfo.name && (dbInfo.name.includes('gaoding') || dbInfo.name.includes('editor'))) {
                    const req = indexedDB.open(dbInfo.name);
                    req.onsuccess = (e) => {
                        const db = e.target.result;
                        for(let i=0; i<db.objectStoreNames.length; i++) {
                            const storeName = db.objectStoreNames[i];
                            if (storeName.includes('draft') || storeName.includes('project') || storeName.includes('design')) {
                                const tx = db.transaction(storeName, 'readonly');
                                const store = tx.objectStore(storeName);
                                const getAll = store.getAll();
                                getAll.onsuccess = () => {
                                    const records = getAll.result;
                                    if (records && records.length > 0) {
                                        const latest = records[records.length - 1];
                                        const res = searchInObject(latest);
                                        if (res) {
                                             console.log(`[GD-Layer] 通过 IndexedDB (${dbInfo.name}/${storeName}) 捕获数据`);
                                             sendData(res.elements, `IndexedDB:${storeName}`, { canvas: res.canvas });
                                        }
                                    }
                                };
                            }
                        }
                    };
                }
            });
        }).catch(() => {});
    }

    setTimeout(scanIndexedDB, 3000);

    // --- 图片预处理 (解决透明背景问题) ---
    function preprocessImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous'; 
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    resolve(dataUrl);
                } catch (e) {
                    console.warn("[GD-Layer] Canvas 转换失败 (可能是跨域污染)", e);
                    resolve(url);
                }
            };
            img.onerror = (e) => {
                console.warn("[GD-Layer] 图片加载失败", e);
                resolve(url);
            };
            img.src = url;
        });
    }

    // --- 内部 OCR 接口配置 ---
    const GD_OCR_API = 'https://ai-application.gaoding.com/tools/v10/ocr'; 
    
    // 调用内部 OCR 接口
    async function runGaodingOCR(imageUrl) {
        try {
            const payload = { url: imageUrl };
            const response = await fetch(GD_OCR_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json;version=1.0' 
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[GD-Layer] OCR API 错误详情 (Status ${response.status}):`, errText);
                throw new Error(`HTTP error! status: ${response.status} - ${errText.substring(0, 100)}`);
            }
            
            const data = await response.json();
            let text = '';
            
            if (Array.isArray(data.texts)) {
                text = data.texts.join('');
            }
            else if (data.text) text = data.text;
            else if (data.data && data.data.text) text = data.data.text;
            else if (data.result) {
                const list = Array.isArray(data.result) ? data.result : (data.result.items || data.result.lines || []);
                if (Array.isArray(list)) {
                    text = list.map(item => item.text || item.content || item.words || '').join('');
                } else if (typeof data.result === 'string') {
                    text = data.result;
                }
            }
            else if (Array.isArray(data.data)) {
                 text = data.data.map(item => item.text || item.content || '').join('');
            }
            else if (Array.isArray(data)) {
                text = data.map(item => item.text || item.content || '').join('');
            }

            if (!text && data.code === 0 && !data.texts) {
                 // 正常无文字
            } else if (!text && Object.keys(data).length > 0) {
                 // 异常结构，忽略
            }

            return { text: text, confidence: 99 }; 
            
        } catch (e) {
            console.error('[GD-Layer] OCR API 调用失败:', e);
            return { text: '', confidence: 0, error: true, msg: e.message };
        }
    }

    // --- 视觉审核模块 ---
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'GD_LC_RUN_OCR') {
            console.log("[GD-Layer] 开始执行 OCR 审核 (使用内部接口)...");
            
             let result = findEditorData() || scanGlobals() || scanPisoEngine() || scanVue3Deep();
             
             if (!result || !result.elements || result.elements.filter(el => el.type === 'image' && el.url).length === 0) {
                 let imgs = document.querySelectorAll('.editor-canvas img, .design-editor img, [class*="element"] img, .editor-shell img');
                 if (imgs.length === 0) {
                     imgs = document.querySelectorAll('img[src*="blob:"], img[src*="data:"], img[src*="aliyuncs"], img[src*="myqcloud"]');
                 }
                 const domElements = Array.from(imgs).map((img, idx) => ({
                     id: `dom-img-${idx}`,
                     type: 'image',
                     title: `画布图片-${idx+1}`,
                     url: img.src || img.getAttribute('src') || img.dataset.src
                 })).filter(el => el.url && (el.url.startsWith('http') || el.url.startsWith('blob:') || el.url.startsWith('data:')));
                 
                 const uniqueElements = [];
                 const seenUrls = new Set();
                 for (const el of domElements) {
                     if (!seenUrls.has(el.url)) {
                         seenUrls.add(el.url);
                         uniqueElements.push(el);
                     }
                 }
                 if (uniqueElements.length > 0) {
                     result = { elements: uniqueElements };
                     console.log("[GD-Layer] 使用 DOM 兜底获取图片数据", uniqueElements);
                 }
             }

             if (!result || !result.elements) {
                 console.warn("[GD-Layer] OCR 提示: 无图层数据或无图片，视为安全");
                 window.postMessage({ type: 'GD_LC_OCR_RESULT', data: [] }, '*');
                 return;
             }

            const imageLayers = result.elements.filter(el => el.type === 'image' && el.url);
             console.log(`[GD-Layer] 发现 ${imageLayers.length} 个图片图层待检测:`, imageLayers.map(l => l.url));

             if (imageLayers.length === 0) {
                  window.postMessage({ type: 'GD_LC_OCR_RESULT', data: [] }, '*');
                  return;
             }

            const results = [];
            
            for (let i = 0; i < imageLayers.length; i++) {
                const layer = imageLayers[i];
                window.postMessage({ type: 'GD_LC_OCR_PROGRESS', progress: `正在分析图层 ${i+1}/${imageLayers.length}: ${layer.title || '未命名'}` }, '*');
                
                try {
                    let ocrInput = layer.url || layer.rawUrl;
                    
                    if (ocrInput.startsWith('//')) ocrInput = 'https:' + ocrInput;
                    
                    try {
                        const urlObj = new URL(ocrInput);
                        if (ocrInput.includes('dancf.com')) {
                            if (urlObj.searchParams.has('x-oss-process')) {
                                urlObj.searchParams.delete('x-oss-process');
                            }
                            urlObj.searchParams.set('x-oss-process', 'image/resize,w_2000/quality,q_90');
                            ocrInput = urlObj.toString();
                            console.log(`[GD-Layer] 已优化图片参数(限制尺寸<=3000): ${ocrInput}`);
                        }
                    } catch(e) {}

                    console.log(`[GD-Layer] 调用接口识别图层: ${layer.title || layer.id}`);

                    const { text, confidence, error, msg } = await runGaodingOCR(ocrInput);
                    
                    if (error) {
                        console.warn(`[GD-Layer] 接口调用出错 (${msg})，跳过: ${layer.title}`);
                        results.push({
                             id: layer.id,
                             name: layer.title || '图片',
                             hasText: false,
                             error: true,
                             msg: msg
                        });
                        continue;
                    }

                    const cleanText = (text || '').replace(/\s/g, '');
                    
                    if (cleanText.length > 0) {
                         console.log(`[GD-Layer] OCR 命中: ${layer.title} -> ${cleanText}`);
                         results.push({
                            id: layer.id,
                            name: layer.title || '图片',
                            hasText: true,
                            text: cleanText,
                            confidence: 99
                        });
                    } else {
                         console.log(`[GD-Layer] OCR 未检测到文字: ${layer.title}`);
                    }

                } catch (err) {
                    console.error(`[GD-Layer] 图层 ${layer.id} 处理异常:`, err);
                }
            }

            window.postMessage({ type: 'GD_LC_OCR_RESULT', data: results }, '*');
        }
    });
     let lastSource = '';
     let lastCount = 0;
     let noDataCount = 0;
     let fastCheckCount = 0;
     
     const fastCheck = () => {
         if (window._gd_auto_triggered) return;
         
         const btn = document.querySelector('.toggle-layer') || 
                     document.querySelector('[data-guide="toggle-layer"]') ||
                     document.querySelector('.editor-left-panel .toggle-layer');
         
         if (btn) {
             console.log("[GD-Layer] ⚡️ 极速触发：发现按钮，立即点击！");
             autoTriggerLayerPanel();
         } else if (fastCheckCount < 20) { 
             fastCheckCount++;
             requestAnimationFrame(fastCheck);
         }
     };
     
     if (document.readyState === 'complete') {
         fastCheck();
     } else {
         window.addEventListener('load', fastCheck);
     }
     
     const observer = new MutationObserver((mutations) => {
         if (window._gd_auto_triggered) {
             observer.disconnect();
             return;
         }
         
         for (const mutation of mutations) {
             if (mutation.addedNodes.length) {
                 const btn = document.querySelector('.toggle-layer');
                 if (btn) {
                     console.log("[GD-Layer] 👀 观察者触发：DOM 中发现按钮，立即点击！");
                     autoTriggerLayerPanel();
                     observer.disconnect();
                     break;
                 }
             }
         }
     });
     
     observer.observe(document.body, { childList: true, subtree: true });
 
     setInterval(() => {
        let result = null;

        if (!result) {
            result = scanDevtoolsHook();
        }

        if (!result) {
            result = findEditorData();
            if (result) result.source = result.source || 'VueRoot';
        }

        if (!result) {
            result = scanGlobals();
        }
        
        if (!result) {
            result = scanPisoEngine();
        }

        if (!result) {
            result = scanVue3Deep();
        }
        
        if (!result) {
            const domResult = scanDom();
            if (domResult) {
                result = { elements: domResult.data, canvas: {}, source: domResult.source };
            }
        }

        if (!result && noDataCount > 10 && document.readyState === 'complete') {
             console.warn("[GD-Layer] 所有策略失效，发送空数据触发兜底");
             result = { elements: [], source: 'Fallback:Empty' };
        }

        if (result) {
            const elements = result.elements || [];
            const canvas = result.canvas || {};
            const validVueData = elements.filter(el => el.type !== 'mask' && el.visible !== false);
            
            if (lastCount !== validVueData.length || lastSource !== result.source || Math.random() > 0.8) {
                lastCount = validVueData.length;
                lastSource = result.source;
                sendData(validVueData, result.source, { canvas });
                noDataCount = 0; 
                
                if (!window._gd_data_found_panel_opened) {
                    console.log("[GD-Layer] 数据已就绪，尝试自动展开图层列表...");
                    autoTriggerLayerPanel();
                    window._gd_data_found_panel_opened = true;
                }
            }
        } else {
             noDataCount++;
             if (noDataCount > 3 && !window._gd_auto_triggered) {
                autoTriggerLayerPanel();
             }
         }

    }, 2000);
    
})();