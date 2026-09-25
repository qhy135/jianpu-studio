/* TypeScript 版解析器单测（编译产物校验） */
const JP = require('./parser.cjs.js');
const assert = require('assert');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  OK   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n         ' + e.message); }
}
const eq = (a, b, m) => assert.strictEqual(a, b, m || ('expected ' + b + ', got ' + a));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, 'expected ~' + b + ', got ' + a);
const ok = (v, m) => assert.ok(v, m || 'expected truthy');

console.log('\n== 基础 ==');
t('空谱不可播放', () => eq(JP.parse('').ok, false));
t('单个音符', () => { const r = JP.parse('1'); eq(r.ok, true); eq(r.song.noteCount, 1); eq(r.song.timeline[0].dur, 1); eq(r.song.timeline[0].midi, 60); });
t('休止符', () => { const r = JP.parse('0 1'); eq(r.song.timeline[0].midi, null); eq(r.song.timeline[1].midi, 60); });
t('八度叠加', () => { eq(JP.noteMidi(1, 1, 60), 72); eq(JP.noteMidi(1, -1, 60), 48); eq(JP.noteMidi(7, 0, 60), 71); });
t('时值', () => { const r = JP.parse('1 1_ 1__'); eq(r.song.timeline[0].dur, 1); eq(r.song.timeline[1].dur, 0.5); eq(r.song.timeline[2].dur, 0.25); });
t('附点', () => { const r = JP.parse('1. 5_.'); eq(r.song.timeline[0].dur, 1.5); eq(r.song.timeline[1].dur, 0.75); });
t('增时线', () => { const r = JP.parse('5 - - 3'); eq(r.song.timeline[0].dur, 3); eq(r.song.timeline[1].start, 3); });
t('增时线缺音符报错', () => eq(JP.parse('- 1').errors.length >= 1, true));
t('小节线分组与终止线', () => {
  const r = JP.parse('1 2 | 3 4 ||');
  eq(r.song.measures.length, 2);
  eq(r.song.measures[0].length, 2, '第 1 小节仅含两个音符');
  eq(r.song.measures[1].length, 2);
  eq(r.song.measureMeta[1].final, true, '终止线应标记在最后一小节');
  eq(r.song.measureMeta[0].final, false);
});
t('非法字符容错', () => { const r = JP.parse('1 2 x 3 4'); eq(r.ok, true); eq(r.errors.length, 1); eq(r.song.noteCount, 4); });

console.log('\n== 头部 ==');
t('默认值', () => { const r = JP.parse('1 2 3'); eq(r.song.keyRaw, 'C'); eq(r.song.timeSig.num, 4); eq(r.song.bpm, 80); });
t('调号', () => { eq(JP.parse('1=G 1').song.keyRaw, 'G'); eq(JP.parse('1=bB 1').song.keyRootMidi, 58); eq(JP.parse('1=#F 1').song.keyRootMidi, 66); });
t('调号影响音高', () => eq(JP.parse('1=G 1').song.timeline[0].midi, 67));
t('拍号', () => { eq(JP.parse('3/4 1').song.timeSig.num, 3); eq(JP.parse('3/4 1').song.timeSig.den, 4); });
t('速度三种写法', () => { eq(JP.parse('100bpm 1').song.bpm, 100); eq(JP.parse('♩=90 1').song.bpm, 90); eq(JP.parse('速度=120 1').song.bpm, 120); });
t('注释忽略', () => eq(JP.parse('1 2 % 注释\n3 4').song.noteCount, 4));

console.log('\n== 频率 ==');
t('A4 = 440', () => near(JP.freqFromMidi(69), 440, 0.001));
t('C4 ≈ 261.63', () => near(JP.freqFromMidi(60), 261.6256, 0.01));
t('八度翻倍', () => near(JP.freqFromMidi(72), 523.251, 0.01));

console.log('\n== 连音线 / 延音线 ==');
t('连音线分组', () => {
  const r = JP.parse('(1 2 3) 4');
  const ns = r.song.measures[0].filter((e) => e.type === 'note' || e.type === 'rest');
  eq(r.errors.length, 0);
  eq(ns.length, 4);
  eq(ns[0].slurId, ns[1].slurId);
  eq(ns[1].slurId, ns[2].slurId);
  eq(ns[0].slurPos, 'start'); eq(ns[1].slurPos, 'mid'); eq(ns[2].slurPos, 'end');
  eq(ns[3].slurId, undefined);
  ok(!ns[0].isTieContinue, '不同音高不应合并');
  eq(r.song.timeline.length, 4, '连音线各音仍分别发声');
});
t('延音线合并时长', () => {
  const r = JP.parse('(1 1) 2');
  const ns = r.song.measures[0].filter((e) => e.type === 'note' || e.type === 'rest');
  eq(r.errors.length, 0);
  ok(ns[1].isTieContinue, '第二个音应标记为延音延续');
  eq(ns[0].dur, 2, '首音时长应合并为 2 拍');
  eq(r.song.timeline.length, 2, '延音线整体只发声一次');
  eq(r.song.timeline[0].dur, 2);
  eq(r.song.timeline[1].start, 2);
});

console.log('\n== 力度记号 ==');
t('阶梯力度生效', () => {
  const r = JP.parse('p 1 2 f 3 4');
  const vs = r.song.timeline.map((e) => Number(e.velocity.toFixed(3)));
  eq(vs[0], 0.45); eq(vs[1], 0.45);
  eq(vs[2], 0.85); eq(vs[3], 0.85);
});
t('力度标记渲染文本', () => {
  const r = JP.parse('mf 1 2');
  const ns = r.song.measures[0].filter((e) => e.type === 'note');
  eq(ns[0].dynLabel, 'mf');
  eq(ns[1].dynLabel, undefined);
});
t('渐强插值递增', () => {
  const r = JP.parse('< 1 2 3');
  const vs = r.song.timeline.map((e) => e.velocity);
  ok(vs[0] < vs[1] && vs[1] < vs[2], '渐强音量应递增，实际 ' + JSON.stringify(vs));
});
t('渐弱插值递减', () => {
  const r = JP.parse('> 1 2 3');
  const vs = r.song.timeline.map((e) => e.velocity);
  ok(vs[0] > vs[1] && vs[1] > vs[2], '渐弱音量应递减，实际 ' + JSON.stringify(vs));
});
t('默认力度 0.7', () => eq(JP.parse('1 2').song.timeline[0].velocity, 0.7));

console.log('\n== 小节拍数校验 ==');
t('不完整小节产生提醒', () => {
  const r = JP.parse('4/4\n1 2 3 | 1 2 3 4');
  eq(r.song.measureMeta.length, 2);
  eq(r.warnings.length, 1);
  ok(r.warnings[0].indexOf('第 1 小节') >= 0, '提醒应指向第 1 小节');
});
t('完整小节无提醒', () => eq(JP.parse("4/4\n1 2 3 4 | 5 6 7 1'").warnings.length, 0));
t('3/4 拍以 3 拍为准', () => {
  const r = JP.parse('3/4\n1 2 3 | 1 2');
  eq(r.warnings.length, 1);
  ok(r.warnings[0].indexOf('应为 3 拍') >= 0);
});

console.log('\n== 反复记号 ==');
t('反复段落播放两次', () => {
  const r = JP.parse("4/4\n|: 1 2 3 4 | 5 6 7 1' :|");
  eq(r.errors.length, 0);
  eq(r.song.measures.length, 2);
  eq(r.song.hasRepeat, true);
  // 2 小节 × 4 个音 × 演奏两遍 = 16 次发声
  eq(r.song.timeline.length, 16);
  eq(r.song.playCount, 16);
});
t('反复第二次回到起点', () => {
  const r = JP.parse('4/4\n|: 1 2 3 4 :|');
  eq(r.song.timeline.length, 8);
  eq(r.song.timeline[4].start, 4);
  eq(r.song.timeline[0].sourceId, r.song.timeline[4].sourceId, '反复时 sourceId 应相同以便高亮');
});
t('Fine 终止反复展开', () => {
  const r = JP.parse("4/4\n|: 1 2 3 4 | Fine 5 6 7 1' :|");
  eq(r.song.measures.length, 2);
  eq(r.song.timeline.length, 8, 'Fine 处停止，不回到段首');
});
t('D.C. 回到开头', () => {
  const r = JP.parse("4/4\n1 2 3 4 | 5 6 7 1' D.C.");
  eq(r.song.hasRepeat, true);
  eq(r.song.timeline.length, 16, '演奏两遍');
});

console.log('\n== 内置示例 ==');
const EXAMPLES = {
  twinkle:
    '1=C 4/4 100bpm\n' +
    '1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - |\n' +
    '5 5 4 4 | 3 3 2 - | 5 5 4 4 | 3 3 2 - |\n' +
    '1 1 5 5 | 6 6 5 - | 4 4 3 3 | 2 2 1 - ||',
  birthday:
    "1=C 3/4 90bpm\n" +
    "5 5 6 | 5 1' 7 | 5 5 6 | 5 2' 1' |\n" +
    "5 5 5' | 3' 1' 7 | 6 4' 4' | 3' 1' 2' |\n" +
    "1' - - ||",
  jasmine:
    "1=D 2/4 72bpm\n" +
    "3 3 | 5 6 | 1' 1' | 6 5 |\n" +
    "5 5 | 6 5 | 3 3 | 5 3 |\n" +
    "2 2 | 3 5 | 3 2 | 1 - ||",
  demo:
    '1=C 4/4 96bpm\n' +
    '|: mf 1 2 3 4 | < (5 6 5 4 | 3 2 1 2) | f 3 4 5 6 | p 1 - - - :| ||',
};
for (const [name, txt] of Object.entries(EXAMPLES)) {
  t(`示例「${name}」零错误零拍数提醒`, () => {
    const r = JP.parse(txt);
    eq(r.ok, true);
    eq(r.errors.length, 0, '错误：' + JSON.stringify(r.errors));
    eq(r.warnings.length, 0, '拍数提醒：' + JSON.stringify(r.warnings));
  });
}
t('小星星结构正确', () => {
  const r = JP.parse(EXAMPLES.twinkle);
  eq(r.song.noteCount, 42);
  eq(r.song.measures.length, 12);
});
t('功能演示含反复、力度与跨小节连音线', () => {
  const r = JP.parse(EXAMPLES.demo);
  eq(r.song.hasRepeat, true);
  eq(r.song.measures.length, 5);
  const vs = r.song.timeline.map((e) => e.velocity);
  ok(Math.max(...vs) - Math.min(...vs) > 0.2, '力度应有明显差异');
  // 跨小节连音线：第 2、3 小节的 8 个音同属一组
  const slurred = [];
  for (const m of r.song.measures) {
    for (const e of m) if ((e.type === 'note' || e.type === 'rest') && e.slurId !== undefined) slurred.push(e);
  }
  eq(slurred.length, 8, '5 6 5 4 | 3 2 1 2 应同属一条连音线');
  eq(new Set(slurred.map((e) => e.slurId)).size, 1, '应只有一条连音线');
  ok(r.song.timeline.filter((e) => e.legato).length >= 7, '组内大部分音应为连奏');
});

console.log('\n----------------------------------------');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
