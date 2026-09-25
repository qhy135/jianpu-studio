/* 渲染进程冒烟测试：真实加载打包产物，校验渲染 + 交互
 * 运行：env -u ELECTRON_RUN_AS_NODE <electron.exe> scripts/smoke.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

const errors = [];

const DEMO =
  '1=C 4/4 96bpm\n' +
  '|: mf 1 2 3 4 | < (5 6 5 4 | 3 2 1 2) | f 3 4 5 6 | p 1 - - - :| ||';

const BAD = '4/4\n1 2 3 | 5 6 7 1\' | 1 1 1';
const SLUR_TIE = '4/4\n(1 1) 2 3';
const PLAIN = '4/4\n1 2 3 4 | 5 6 7 1\'';

function finish(win, extra) {
  const payload = Object.assign({ errors }, extra || {});
  console.log('SMOKE_RESULT ' + JSON.stringify(payload, null, 2));
  if (win && !win.isDestroyed()) win.destroy();
  app.quit();
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../electron/preload.js'),
    },
  });

  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 3) errors.push('console.error: ' + message);
  });
  win.webContents.on('did-fail-load', (event, code, desc) => {
    errors.push('did-fail-load: ' + desc + ' (code ' + code + ')');
  });

  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  } catch (e) {
    errors.push('loadFile 失败: ' + e.message);
    return finish(win);
  }

  await new Promise((r) => setTimeout(r, 1800));

  const script = `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const setText = (t) => {
      const ta = document.querySelector('.editor');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, t);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const clickNote = (idx, shift) => {
      const n = document.querySelectorAll('.note')[idx];
      if (!n) return false;
      n.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: !!shift }));
      return true;
    };
    const clickByText = (sel, txt) => {
      const el = Array.from(document.querySelectorAll(sel)).find((e) => e.textContent.trim() === txt);
      if (!el) return false;
      el.click();
      return true;
    };
    const snap = () => ({
      notes: document.querySelectorAll('.note').length,
      measures: document.querySelectorAll('.measure').length,
      badMeasures: document.querySelectorAll('.measure.bad').length,
      slurArcs: document.querySelectorAll('.slur-arc').length,
      tieGroups: document.querySelectorAll('.slur.tie').length,
      dynLabels: Array.from(document.querySelectorAll('.n-dyn')).map((e) => e.textContent),
      repeatBars: document.querySelectorAll('.bar.repeat').length,
      warningItems: Array.from(document.querySelectorAll('.warnings .w-item')).map((e) => e.textContent),
      infoText: document.querySelector('.score-info') ? document.querySelector('.score-info').textContent.trim() : null,
    });
    const ui = () => ({
      inspectorEmpty: !!document.querySelector('.inspector.empty'),
      selected: document.querySelectorAll('.note.sel').length,
      insTitle: document.querySelector('.ins-title') ? document.querySelector('.ins-title').textContent : null,
      insWhere: document.querySelector('.ins-where') ? document.querySelector('.ins-where').textContent : null,
      hasCompareBtn: !!document.querySelector('.btn.compare'),
      paletteBtns: document.querySelectorAll('.pal-btn').length,
      addSlots: document.querySelectorAll('.add-slot').length,
    });

    const initial = snap();
    setText(${JSON.stringify(DEMO)});
    await sleep(900);
    const demo = snap();
    setText(${JSON.stringify(SLUR_TIE)});
    await sleep(900);
    const tie = snap();
    setText(${JSON.stringify(BAD)});
    await sleep(900);
    const bad = snap();

    /* ---- 交互 1：点选音符 ---- */
    setText(${JSON.stringify(PLAIN)});
    await sleep(900);
    const uiBeforePick = ui();
    clickNote(2, false);
    await sleep(400);
    const uiAfterPick = ui();

    /* ---- 交互 2：属性面板改音高 ---- */
    const clickedFive = clickByText('.ins-btn', '5');
    await sleep(900);
    const afterDegree = {
      clickedFive,
      text: document.querySelector('.editor').value,
      selected: document.querySelectorAll('.note.sel').length,
    };

    /* ---- 交互 3：Shift 多选 + 跨小节连音线 ---- */
    setText(${JSON.stringify(PLAIN)});
    await sleep(900);
    clickNote(2, false);
    await sleep(200);
    clickNote(5, true);
    await sleep(400);
    const multi = ui();
    const clickedSlur = clickByText('.btn', '加连音线');
    await sleep(1000);
    const afterSlur = {
      clickedSlur,
      text: document.querySelector('.editor').value,
      slurArcs: document.querySelectorAll('.slur-arc').length,
      warnings: Array.from(document.querySelectorAll('.warnings .w-item')).map((e) => e.textContent),
      errors: Array.from(document.querySelectorAll('.errors .err')).map((e) => e.textContent),
    };

    /* ---- 交互 4：小节末尾的 + 加音符 ---- */
    setText(${JSON.stringify(PLAIN)});
    await sleep(900);
    const slots = document.querySelectorAll('.add-slot');
    if (slots[0]) slots[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(900);
    const afterAdd = {
      text: document.querySelector('.editor').value,
      notes: document.querySelectorAll('.note').length,
    };

    return { initial, demo, tie, bad, uiBeforePick, uiAfterPick, afterDegree, multi, afterSlur, afterAdd };
  })()`;

  let result;
  try {
    result = await win.webContents.executeJavaScript(script);
  } catch (e) {
    errors.push('executeJavaScript 失败: ' + e.message);
    return finish(win);
  }

  finish(win, result);
});

setTimeout(() => {
  errors.push('超时：30 秒内未完成');
  finish(null);
}, 30000).unref?.();
