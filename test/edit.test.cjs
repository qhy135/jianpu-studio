/* 可视化编辑（文本回写）单测 */
const JP = require('./edit.cjs.js');
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  OK   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n         ' + e.message); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, m || ('expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)));
const ok = (v, m) => assert.ok(v, m || 'expected truthy');

const SRC = '1=C 4/4 100bpm\n1 2 3 4 | 5 6 7 1\'\n';

/** 取全部音符（按源顺序） */
const notes = (txt) => {
  const out = [];
  for (const m of JP.parse(txt).song.measures) {
    for (const e of m) if (e.type === 'note' || e.type === 'rest') out.push(e);
  }
  return out;
};
const pick = (txt, ids) => notes(txt).filter((n) => ids.includes(n.id));
const clean = (txt) => { const r = JP.parse(txt); return r.errors.length === 0 && r.warnings.length === 0; };

console.log('\n== 单项属性 ==');
t('改音高', () => {
  const out = JP.setDegree(SRC, pick(SRC, [1]), 5);
  eq(out, '1=C 4/4 100bpm\n1 5 3 4 | 5 6 7 1\'\n');
  ok(clean(out));
});
t('改音高保留八度与时值', () => {
  const src = '1=C 4/4\n2\'_ 3';
  const out = JP.setDegree(src, pick(src, [0]), 6);
  eq(out, '1=C 4/4\n6\'_ 3');
});
t('改成休止符会去掉八度点', () => {
  const src = '1=C 4/4\n5\' 3';
  const out = JP.setDegree(src, pick(src, [0]), 0);
  eq(out, '1=C 4/4\n0 3');
});
t('升高 / 降低八度', () => {
  eq(JP.shiftOctave(SRC, pick(SRC, [0]), 1), '1=C 4/4 100bpm\n1\' 2 3 4 | 5 6 7 1\'\n');
  eq(JP.shiftOctave('1=C\n1 2', pick('1=C\n1 2', [0]), -1), '1=C\n1, 2');
});
t('八度上下限不越界', () => {
  const src = '1=C\n1\'\' 2';
  eq(JP.shiftOctave(src, pick(src, [0]), 1), '1=C\n1\'\' 2');
});
t('时值：四分 / 八分 / 十六分', () => {
  eq(JP.setFlags(SRC, pick(SRC, [0]), 1), '1=C 4/4 100bpm\n1_ 2 3 4 | 5 6 7 1\'\n');
  eq(JP.setFlags(SRC, pick(SRC, [0]), 2), '1=C 4/4 100bpm\n1__ 2 3 4 | 5 6 7 1\'\n');
});
t('附点开关', () => {
  const on = JP.toggleDot(SRC, pick(SRC, [0]));
  eq(on, '1=C 4/4 100bpm\n1. 2 3 4 | 5 6 7 1\'\n');
  eq(JP.toggleDot(on, pick(on, [0])), SRC, '再点一次应还原');
});
t('增时线加减', () => {
  const src = '1=C 4/4\n1 2 3 4';
  eq(JP.setExtend(src, pick(src, [1]), 1), '1=C 4/4\n1 2 - 3 4');
  eq(JP.setExtend(src, pick(src, [1]), 3), '1=C 4/4\n1 2 - - - 3 4');
  const withExt = '1=C 4/4\n1 2 - - 3 4';
  eq(JP.setExtend(withExt, pick(withExt, [1]), 0), '1=C 4/4\n1 2 3 4', '清零应删掉增时线');
});

console.log('\n== 插入 / 删除 ==');
t('在音符后插入', () => {
  const out = JP.insertAfter(SRC, pick(SRC, [1])[0], '5');
  eq(out, '1=C 4/4 100bpm\n1 2 5 3 4 | 5 6 7 1\'\n');
  eq(JP.parse(out).errors.length, 0);
  eq(notes(out).length, 9);
});
t('在音符前插入', () => {
  const out = JP.insertBefore(SRC, pick(SRC, [0])[0], '5');
  eq(out, '1=C 4/4 100bpm\n5 1 2 3 4 | 5 6 7 1\'\n');
});
t('插入不会掉进连音线里', () => {
  const src = '1=C 4/4\n(1 2) 3';
  const out = JP.insertAfter(src, pick(src, [1])[0], '5');
  eq(out, '1=C 4/4\n(1 2) 5 3', '应插到右括号之后');
});
t('前插不会钻进左括号里', () => {
  const src = '1=C 4/4\n(1 2) 3';
  const out = JP.insertBefore(src, pick(src, [0])[0], '5');
  eq(out, '1=C 4/4\n5 (1 2) 3');
});
t('末尾追加（跳过终止线）', () => {
  const src = '1=C 4/4\n1 2 3 4 ||';
  eq(JP.appendNote(src, '5'), '1=C 4/4\n1 2 3 4 5 ||');
});
t('删除音符并清掉多余空格', () => {
  const out = JP.deleteNotes(SRC, pick(SRC, [1, 2]));
  eq(out, '1=C 4/4 100bpm\n1 4 | 5 6 7 1\'\n');
});

console.log('\n== 连音线 ==');
t('给连续音符加连音线', () => {
  const out = JP.applySlur(SRC, pick(SRC, [1, 2]));
  eq(out, '1=C 4/4 100bpm\n1 (2 3) 4 | 5 6 7 1\'\n');
  const ns = notes(out);
  eq(ns[1].slurId, ns[2].slurId);
  eq(ns[1].slurPos, 'start');
  eq(ns[2].slurPos, 'end');
  ok(clean(out));
});
t('连音线可以跨小节（本次重点）', () => {
  const out = JP.applySlur(SRC, pick(SRC, [2, 3, 4, 5]));
  eq(out, '1=C 4/4 100bpm\n1 2 (3 4 | 5 6) 7 1\'\n');
  const r = JP.parse(out);
  eq(r.errors.length, 0, '不应有解析错误');
  eq(r.warnings.length, 0, '跨小节不应破坏拍数校验');
  const ns = notes(out);
  const sid = ns[2].slurId;
  ok(sid !== undefined, '第 3 个音应带连音线');
  eq(ns[3].slurId, sid); eq(ns[4].slurId, sid); eq(ns[5].slurId, sid);
  eq(ns[6].slurId, undefined, '第 7 个音不在连音线内');
  eq(ns[2].slurPos, 'start'); eq(ns[5].slurPos, 'end');
});
t('跨小节连音线产生连奏标记', () => {
  const out = JP.applySlur(SRC, pick(SRC, [2, 3, 4, 5]));
  const tl = JP.parse(out).song.timeline;
  const ins = tl.filter((e) => e.legato);
  eq(ins.length, 3, '组内前三个音为连奏，最后一个不是');
});
t('同音高跨小节自动变延音线', () => {
  const src = '1=C 4/4\n1 2 3 4 | 5 5 7 1';
  const out = JP.applySlur(src, pick(src, [4, 5]));
  const r = JP.parse(out);
  eq(r.song.timeline.length, 7, '两个 5 合并成一次发声');
  eq(r.song.timeline[4].dur, 2, '合并后为 2 拍');
});
t('取消连音线', () => {
  const src = '1=C 4/4\n1 (2 3) 4';
  const out = JP.removeSlur(src, notes(src), new Set([1, 2]));
  eq(out, '1=C 4/4\n1 2 3 4');
  eq(notes(out)[1].slurId, undefined);
});
t('取消跨小节连音线', () => {
  const src = '1=C 4/4 100bpm\n1 2 (3 4 | 5 6) 7 1\'';
  const out = JP.removeSlur(src, notes(src), new Set([3]));
  eq(out, '1=C 4/4 100bpm\n1 2 3 4 | 5 6 7 1\'');
});
t('重新加连音线不会嵌套括号', () => {
  const src = '1=C 4/4\n(1 2 3) 4 | 5 6 7 1\'';
  const out = JP.applySlur(src, pick(src, [1, 2, 3]));
  eq(out, '1=C 4/4\n1 (2 3 4) | 5 6 7 1\'');
  ok(clean(out), '不应产生解析错误或拍数提醒');
  eq(notes(out)[1].slurId, notes(out)[3].slurId);
  eq(notes(out)[0].slurId, undefined, '第 1 个音应已脱离连音线');
});
t('区间规整：多选中间漏选也按连续区间处理', () => {
  const all = notes(SRC);
  const range = JP.collectRange(all, new Set([1, 4]));
  eq(range.length, 4, '应补齐成 1..4 共四个音');
});

console.log('\n== 力度 ==');
t('新增力度记号', () => {
  const out = JP.setDynamic(SRC, pick(SRC, [2]), 'f');
  eq(out, '1=C 4/4 100bpm\n1 2 f 3 4 | 5 6 7 1\'\n');
  eq(notes(out)[2].velocity, 0.85);
});
t('修改已有力度记号', () => {
  const src = '1=C 4/4\nmf 1 2 3';
  const out = JP.setDynamic(src, pick(src, [0]), 'ff');
  eq(out, '1=C 4/4\nff 1 2 3');
  eq(notes(out)[1].velocity, 0.95, '力度应延续到后续音符');
});
t('清除力度记号', () => {
  const src = '1=C 4/4\nmf 1 2 3';
  const out = JP.setDynamic(src, pick(src, [0]), '');
  eq(out, '1=C 4/4\n1 2 3');
  eq(notes(out)[0].velocity, 0.7, '回到默认力度');
});

console.log('\n== 连奏效果（可听见） ==');
t('连音线内前几个音标记为 legato', () => {
  const r = JP.parse('1=C 4/4\n(1 2 3) 4');
  const lg = r.song.timeline.map((e) => e.legato);
  eq(JSON.stringify(lg), JSON.stringify([true, true, false, false]));
});
t('无连音线时全部为断奏', () => {
  const r = JP.parse('1=C 4/4\n1 2 3 4');
  ok(r.song.timeline.every((e) => e.legato === false));
});
t('延音线只发一次声，且按持续音处理', () => {
  const r = JP.parse('1=C 4/4\n(1 1) 2');
  eq(r.song.timeline.length, 2, '两个 1 合并成一次发声');
  eq(r.song.timeline[0].dur, 2);
  eq(r.song.timeline[0].legato, true, '延音线的长音应当持续饱满');
  eq(r.song.timeline[1].legato, false);
});

console.log('\n== 反复编辑后仍自洽 ==');
t('一通乱改之后依然零错误（改的都不影响拍数）', () => {
  let txt = '1=C 4/4 100bpm\n1 2 3 4 | 5 6 7 1\'';
  txt = JP.applySlur(txt, pick(txt, [0, 1, 2, 3]));
  txt = JP.setDegree(txt, pick(txt, [3]), 6);
  txt = JP.shiftOctave(txt, pick(txt, [5]), 1);
  txt = JP.setDynamic(txt, pick(txt, [6]), 'mf');
  const r = JP.parse(txt);
  eq(r.errors.length, 0, JSON.stringify(r.errors));
  eq(r.warnings.length, 0, JSON.stringify(r.warnings));
  eq(r.song.noteCount, 8);
  eq(r.song.timeline.filter((e) => e.legato).length, 3);
});
t('改时值后拍数提醒会如实更新', () => {
  let txt = '1=C 4/4\n1 2 3 4';
  txt = JP.setFlags(txt, pick(txt, [3]), 1);
  const r = JP.parse(txt);
  eq(r.song.measureMeta[0].beats, 3.5);
  eq(r.warnings.length, 1);
  ok(/第 1 小节/.test(r.warnings[0]));
});

console.log('\n== 边界情况 ==');
t('CRLF 换行（Windows 记事本）不会错位', () => {
  const src = '1=C 4/4\r\n1 2 3 4\r\n5 6 7 1\'\r\n';
  const out = JP.setDegree(src, pick(src, [2]), 6);
  eq(out, '1=C 4/4\r\n1 2 6 4\r\n5 6 7 1\'\r\n');
  eq(JP.parse(out).errors.length, 0);
});
t('CRLF 下加跨小节连音线', () => {
  const src = '1=C 4/4\r\n1 2 3 4 |\r\n5 6 7 1\'\r\n';
  const out = JP.applySlur(src, pick(src, [2, 3, 4, 5]));
  eq(out, '1=C 4/4\r\n1 2 (3 4 |\r\n5 6) 7 1\'\r\n');
  const r = JP.parse(out);
  eq(r.errors.length, 0, JSON.stringify(r.errors));
  eq(r.warnings.length, 0, JSON.stringify(r.warnings));
  eq(notes(out)[2].slurId, notes(out)[5].slurId, '跨过 CRLF 与小节线仍同一条连音线');
});
t('制表符分隔也能正确改写', () => {
  const src = '1=C 4/4\n1\t2\t3\t4';
  const out = JP.setDegree(src, pick(src, [1]), 5);
  eq(out, '1=C 4/4\n1\t5\t3\t4');
});
t('无头部、首音在文本最开头', () => {
  const src = '1 2 3 4';
  const out = JP.applySlur(src, pick(src, [1, 2]));
  eq(out, '1 (2 3) 4');
  eq(JP.parse(out).errors.length, 0);
});
t('跨小节线（换行断开）也能连', () => {
  const src = '1=C 4/4\n1 2 3 4 |\n5 6 7 1\'';
  const out = JP.applySlur(src, pick(src, [3, 4]));
  eq(out, '1=C 4/4\n1 2 3 (4 |\n5) 6 7 1\'');
  const r = JP.parse(out);
  eq(r.errors.length, 0, JSON.stringify(r.errors));
  eq(r.warnings.length, 0, JSON.stringify(r.warnings));
  eq(r.song.measures.length, 2);
  eq(notes(out)[3].slurId, notes(out)[4].slurId);
});
t('连音线跨越反复起线会被就地收口，不报错', () => {
  const src = '1=C 4/4\n1 2 3 4 |: 5 6 7 1\'';
  const out = JP.applySlur(src, pick(src, [2, 3, 4, 5]));
  const r = JP.parse(out);
  eq(r.errors.length, 0, JSON.stringify(r.errors));
  eq(notes(out)[2].slurId, notes(out)[3].slurId, '反复起线之前的音仍在同一条连音线内');
});
t('给小节末尾的音加增时线', () => {
  const src = '1=C 4/4\n1 2 3 4 | 5 6 7 1\'';
  const out = JP.setExtend(src, pick(src, [3]), 1);
  eq(out, '1=C 4/4\n1 2 3 4 - | 5 6 7 1\'');
  eq(JP.parse(out).warnings.length, 1, '加了延长后拍数自然超标，应如实提醒');
});
t('删掉唯一的音符不报错', () => {
  const src = '1=C 4/4\n1';
  const out = JP.deleteNotes(src, pick(src, [0]));
  eq(JP.parse(out).errors.length, 0);
  eq(JP.parse(out).ok, false);
});
t('休止符也能加进连音线而不崩', () => {
  const src = '1=C 4/4\n1 0 2 3';
  const out = JP.applySlur(src, pick(src, [0, 1, 2]));
  eq(out, '1=C 4/4\n(1 0 2) 3');
  eq(JP.parse(out).errors.length, 0);
});
t('连续多次编辑幂等（加完再取消回到原样）', () => {
  const src = '1=C 4/4\n1 2 3 4 | 5 6 7 1\'';
  const slurred = JP.applySlur(src, pick(src, [1, 2, 3]));
  const back = JP.removeSlur(slurred, notes(slurred), new Set([2]));
  eq(back, src, '取消后应与原文完全一致');
});

console.log('\n----------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
