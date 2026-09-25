/* ============================================================
 * Electron 主进程
 * 负责：窗口、原生菜单、单例锁、窗口尺寸记忆、与渲染进程通信
 * ============================================================ */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

// —— 单例锁：重复打开时聚焦已有窗口 ——
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let mainWindow = null;
const boundsFile = () => path.join(app.getPath('userData'), 'window-bounds.json');

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); }
  catch (e) { return null; }
}
function saveBounds(win) {
  try { fs.writeFileSync(boundsFile(), JSON.stringify(win.getBounds())); }
  catch (e) { /* 忽略写入失败 */ }
}

function createWindow() {
  const saved = loadBounds();
  mainWindow = new BrowserWindow({
    width: (saved && saved.width) || 1240,
    height: (saved && saved.height) || 800,
    x: saved && saved.x !== undefined ? saved.x : undefined,
    y: saved && saved.y !== undefined ? saved.y : undefined,
    minWidth: 900,
    minHeight: 600,
    title: '简谱工坊',
    backgroundColor: '#eeeae0',
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
  });

  const distIndex = path.join(__dirname, '../dist/index.html');

  if (isDev) {
    // 优先连开发服务器（热更新）；连不上则回退到已构建的 dist，保证双击即用
    mainWindow
      .loadURL('http://localhost:5173')
      .catch(() => mainWindow.loadFile(distIndex));
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      if (code !== -3 && url && url.indexOf('localhost:5173') >= 0) {
        mainWindow.loadFile(distIndex);
      }
    });
  } else {
    mainWindow.loadFile(distIndex);
  }

  mainWindow.on('close', () => saveBounds(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* —— 原生菜单 —— */
function buildMenu() {
  const send = (channel) => {
    if (mainWindow) mainWindow.webContents.send(channel);
  };

  const examples = [
    { label: '小星星', click: () => send('menu:example:twinkle') },
    { label: '生日快乐', click: () => send('menu:example:birthday') },
    { label: '茉莉花', click: () => send('menu:example:jasmine') },
  ];

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建 / 清空', accelerator: 'CmdOrCtrl+N', click: () => send('menu:clear') },
        { type: 'separator' },
        { label: '载入示例', submenu: examples },
        { type: 'separator' },
        { label: '导出当前谱面为文本…', accelerator: 'CmdOrCtrl+S', click: () => send('menu:export') },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '播放',
      submenu: [
        { label: '播放 / 暂停', accelerator: 'Space', click: () => send('menu:play') },
        { label: '停止', accelerator: 'Esc', click: () => send('menu:stop') },
        { type: 'separator' },
        { label: '减速 5 bpm', accelerator: 'CmdOrCtrl+Left', click: () => send('menu:bpm:down') },
        { label: '加速 5 bpm', accelerator: 'CmdOrCtrl+Right', click: () => send('menu:bpm:up') },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏切换', role: 'togglefullscreen' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '简谱语法说明', accelerator: 'F1', click: () => send('menu:help') },
        { type: 'separator' },
        {
          label: '关于 简谱工坊',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '简谱工坊 JianPu Studio',
              detail: '版本 1.0.0\n写谱 · 读谱 · 播放\n\n零依赖桌面应用，离线可用。',
              buttons: ['好的'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* —— 渲染进程请求保存文本 —— */
ipcMain.handle('save-text', async (event, text) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const res = await dialog.showSaveDialog(win, {
    title: '导出谱面',
    defaultPath: path.join(app.getPath('documents'), '我的谱面.txt'),
    filters: [{ name: '文本文件', extensions: ['txt'] }],
  });
  if (res.canceled || !res.filePath) return false;
  try {
    fs.writeFileSync(res.filePath, String(text), 'utf8');
    return true;
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', title: '保存失败', message: String(e && e.message ? e.message : e), buttons: ['好的'] });
    return false;
  }
});

/* —— 生命周期 —— */
app.whenReady().then(() => {
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
