/* ============================================================
 * 预加载脚本：在隔离上下文中向渲染进程暴露受限 API
 * ============================================================ */
const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNELS = [
  'menu:example:twinkle',
  'menu:example:birthday',
  'menu:example:jasmine',
  'menu:clear',
  'menu:export',
  'menu:play',
  'menu:stop',
  'menu:bpm:up',
  'menu:bpm:down',
  'menu:help',
];

contextBridge.exposeInMainWorld('api', {
  /** 监听原生菜单事件，handler 收到 channel 字符串 */
  onMenu(handler) {
    for (const ch of MENU_CHANNELS) {
      ipcRenderer.on(ch, () => handler(ch));
    }
  },
  /** 保存文本到本机文件（返回是否成功） */
  async saveText(text) {
    return ipcRenderer.invoke('save-text', text);
  },
});
