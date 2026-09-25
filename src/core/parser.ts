/* ============================================================
 * 简谱解析器（TypeScript）
 * 支持：音符 / 休止 / 八度 / 时值 / 附点 / 增时线 / 连音线与延音线 /
 *       力度记号（含渐强渐弱）/ 反复记号与反复指令 / 小节拍数校验
 * ============================================================ */

export interface ParseError {
  line: number;
  col?: number;
  raw: string;
  msg: string;
}

export interface NoteEvent {
  type: 'note' | 'rest';
  degree: number;
  octave: number;
  flags: number;       // 下划线数量：0 四分 / 1 八分 / 2 十六分
  dotted: boolean;
  dur: number;         // 单位 = 拍（四分音符 = 1）
  extend: number;      // 增时线数量
  raw: string;
  id: number;          // 源 id（稳定，用于渲染与高亮）
  startInMeasure: number;
  midi?: number;
  velocity: number;    // 力度 0–1
  dynLabel?: string;   // 力度标记文本（渲染用）
  slurId?: number;     // 连音线 / 延音线分组
  slurPos?: 'start' | 'mid' | 'end';
  isTieContinue?: boolean; // 延音线的后续音（不单独发声）
  // —— 可视化编辑回写所需的「原始文本坐标」——
  srcPos: number;      // 音符记号本身的起始下标
  srcLen: number;      // 音符记号本身的长度（不含增时线）
  srcEnd: number;      // 含尾部增时线在内的结束下标（开区间右端）
  slurOpenPos?: number;  // 所属连音线左括号的下标
  slurClosePos?: number; // 所属连音线右括号的下标
  dynPos?: number;       // 作用于该音的力度记号下标
  dynLen?: number;       // 力度记号长度
}

export interface BarEvent {
  type: 'bar';
  final: boolean;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  raw: string;
}

export interface DirectiveEvent {
  type: 'directive';
  text: string;
  kind: 'fine' | 'dc' | 'ds' | 'segno';
  raw: string;
}

export type ScoreEvent = NoteEvent | BarEvent | DirectiveEvent;

export interface MeasureMeta {
  index: number;
  beats: number;       // 实际拍数
  expected: number;    // 应有拍数
  repeatStart: boolean;
  repeatEnd: boolean;
  final: boolean;
}

export interface TimelineItem {
  id: number;          // 播放序列 id
  sourceId: number;    // 对应源音符 id（高亮用）
  start: number;       // 拍
  dur: number;         // 拍
  midi: number | null;
  velocity: number;
  legato: boolean;     // 处于连音线内且非末尾 → 连奏（发声更连贯）
}

export interface Song {
  keyRaw: string;
  keyRootMidi: number;
  timeSig: { num: number; den: number };
  bpm: number;
  measures: ScoreEvent[][];
  measureMeta: MeasureMeta[];
  timeline: TimelineItem[];
  noteCount: number;        // 发声音符数
  playCount: number;        // 播放序列长度（含反复）
  totalBeats: number;
  hasRepeat: boolean;
}

export interface ParseResult {
  ok: boolean;
  errors: ParseError[];
  warnings: string[];
  song: Song;
}

/** 调号 → 中音 1(do) 的 MIDI 音高（十二平均律，中音区习惯定位） */
export const KEY_ROOT: Record<string, number> = {
  C: 60, 'C#': 61, Db: 61,
  D: 62, 'D#': 63, Eb: 63,
  E: 64,
  F: 65, 'F#': 66, Gb: 54,
  G: 67, 'G#': 68, Ab: 56,
  A: 69, 'A#': 70, Bb: 58,
  B: 59, Cb: 59,
};

/** 音阶内各音级相对 do 的半音数 */
const SEMI: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };

/** 阶梯力度记号 → 音量 */
const DYNAMICS_STEP: Record<string, number> = {
  ppp: 0.22, pp: 0.32, p: 0.45, mp: 0.58, mf: 0.7, f: 0.85, ff: 0.95, fff: 1.0,
};
/** 力度标记显示文本 */
const DYNAMICS_LABEL: Record<string, string> = {
  ppp: 'ppp', pp: 'pp', p: 'p', mp: 'mp', mf: 'mf', f: 'f', ff: 'ff', fff: 'fff',
  cresc: 'cresc.', dim: 'dim.',
};

const DEFAULT_VELOCITY = 0.7;
const MAX_PLAY_MEASURES = 400; // 防止反复记号导致无限展开

export function normalizeKey(s: string): string {
  if (!s) return 'C';
  const v = String(s).trim();
  let acc = '';
  let letter = '';
  if (v.charAt(0) === 'b' || v.charAt(0) === '#') {
    acc = v.charAt(0);
    letter = v.charAt(1);
  } else {
    letter = v.charAt(0);
    if (v.charAt(1) === 'b' || v.charAt(1) === '#') acc = v.charAt(1);
  }
  letter = (letter || 'C').toUpperCase();
  if (acc === 'b') return letter + 'b';
  if (acc === '#') return letter + '#';
  return letter;
}

export function keyRootMidi(key: string): number {
  return KEY_ROOT[normalizeKey(key)] ?? 60;
}

export function noteMidi(degree: number, octave: number, keyMidi: number): number {
  return keyMidi + (octave || 0) * 12 + (SEMI[degree] || 0);
}

export function freqFromMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function displayKey(raw: string): string {
  const n = normalizeKey(raw);
  if (n.length === 2) {
    if (n.charAt(1) === 'b') return 'b' + n.charAt(0);
    if (n.charAt(1) === '#') return '#' + n.charAt(0);
  }
  return n;
}

interface Header {
  key: string;
  timeSig: { num: number; den: number };
  bpm: number;
  bodyStart: number;   // 正文在原始文本中的起始下标
}

/**
 * 解析头部，并返回正文起始下标（而非拼接后的文本），
 * 以便后续词法分析能记录每个记号在「原始文本」中的绝对位置 —— 可视化编辑要靠它回写。
 */
function parseHeader(text: string): Header {
  let key = 'C';
  let timeSig = { num: 4, den: 4 };
  let bpm = 80;
  let bodyStart = text.length;
  let offset = 0;

  for (const rawLine of text.split('\n')) {
    const lineStart = offset;
    offset += rawLine.length + 1; // +1 为换行符

    const c = rawLine.indexOf('%');
    const limit = c >= 0 ? c : rawLine.length;
    let p = 0;
    let matched = true;

    while (matched) {
      matched = false;
      while (p < limit && /\s/.test(rawLine[p])) p++;
      const rest = rawLine.slice(p, limit);
      let m: RegExpExecArray | null;
      if ((m = /^1\s*=\s*([b#]?[A-Ga-g])/.exec(rest))) {
        key = m[1]; p += m[0].length; matched = true; continue;
      }
      if ((m = /^(\d{1,2})\s*\/\s*(\d{1,2})/.exec(rest))) {
        timeSig = { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
        p += m[0].length; matched = true; continue;
      }
      if ((m = /^(\d{1,3})\s*bpm/i.exec(rest))) {
        bpm = parseInt(m[1], 10); p += m[0].length; matched = true; continue;
      }
      if ((m = /^♩\s*=\s*(\d{1,3})/.exec(rest))) {
        bpm = parseInt(m[1], 10); p += m[0].length; matched = true; continue;
      }
      if ((m = /^速度\s*=\s*(\d{1,3})/.exec(rest))) {
        bpm = parseInt(m[1], 10); p += m[0].length; matched = true; continue;
      }
    }

    // 该行头部之后还有内容 → 正文从这里开始
    if (p < rawLine.length && rawLine.slice(p).trim() !== '') {
      bodyStart = lineStart + p;
      break;
    }
  }
  return { key, timeSig, bpm, bodyStart };
}

interface TokenBase {
  raw: string;
  line: number;
  col: number;
  pos: number;   // 在原始文本中的绝对下标
}

type Token = TokenBase & (
  | { type: 'note' }
  | { type: 'bar' }
  | { type: 'finalbar' }
  | { type: 'repeatStart' }
  | { type: 'repeatEnd' }
  | { type: 'extend' }
  | { type: 'slurOpen' }
  | { type: 'slurClose' }
  | { type: 'dynamic'; value: string }
  | { type: 'directive'; value: string }
  | { type: 'error' }
);

function tokenize(text: string, baseOffset: number): Token[] {
  const tokens: Token[] = [];
  let i = 0, line = 1, col = 1;
  const len = text.length;
  const abs = (idx: number) => baseOffset + idx;

  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (i >= len) return;
      if (text[i] === '\n') { line++; col = 1; }
      else col++;
      i++;
    }
  };

  while (i < len) {
    const ch = text[i];
    const sLine = line, sCol = col, sPos = abs(i);
    if (ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t') { adv(); continue; }
    if (ch === '%') { while (i < len && text[i] !== '\n') adv(); continue; }

    // 反复终止线 :| 或 :||
    if (ch === ':') {
      let raw = ':'; adv();
      if (text[i] === '|') {
        raw += '|'; adv();
        if (text[i] === '|') { raw += '|'; adv(); }
        tokens.push({ type: 'repeatEnd', raw, line: sLine, col: sCol, pos: sPos });
        continue;
      }
      tokens.push({ type: 'error', raw, line: sLine, col: sCol, pos: sPos });
      continue;
    }

    if (ch === '|') {
      let raw = '|'; adv();
      if (text[i] === ':') { raw += ':'; adv(); tokens.push({ type: 'repeatStart', raw, line: sLine, col: sCol, pos: sPos }); continue; }
      if (text[i] === '|' || text[i] === ']') { raw += text[i]; adv(); tokens.push({ type: 'finalbar', raw, line: sLine, col: sCol, pos: sPos }); continue; }
      tokens.push({ type: 'bar', raw, line: sLine, col: sCol, pos: sPos });
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'slurOpen', raw: '(', line: sLine, col: sCol, pos: sPos }); adv(); continue; }
    if (ch === ')') { tokens.push({ type: 'slurClose', raw: ')', line: sLine, col: sCol, pos: sPos }); adv(); continue; }
    if (ch === '<' || ch === '>') {
      tokens.push({ type: 'dynamic', raw: ch, value: ch === '<' ? 'cresc' : 'dim', line: sLine, col: sCol, pos: sPos });
      adv(); continue;
    }
    if (ch === '§') { tokens.push({ type: 'directive', raw: '§', value: 'segno', line: sLine, col: sCol, pos: sPos }); adv(); continue; }

    if (ch === '-') { tokens.push({ type: 'extend', raw: '-', line: sLine, col: sCol, pos: sPos }); adv(); continue; }

    if (ch >= '0' && ch <= '7') {
      let raw = ch; adv();
      while (text[i] === '\'' || text[i] === ',') { raw += text[i]; adv(); }
      while (text[i] === '_') { raw += text[i]; adv(); }
      if (text[i] === '.') { raw += text[i]; adv(); }
      tokens.push({ type: 'note', raw, line: sLine, col: sCol, pos: sPos });
      continue;
    }

    // 字母序列：可能是力度记号或反复指令
    if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z.]+/.exec(text.slice(i));
      const word = m ? m[0] : ch;
      // 去掉全部句点，使 D.C. / D.S. / cresc. 等写法都能识别
      const key = word.replace(/\./g, '').toLowerCase();
      if (DYNAMICS_STEP[key] !== undefined || key === 'cresc' || key === 'dim' || key === 'crescendo' || key === 'diminuendo') {
        const v = key === 'crescendo' ? 'cresc' : key === 'diminuendo' ? 'dim' : key;
        tokens.push({ type: 'dynamic', raw: word, value: v, line: sLine, col: sCol, pos: sPos });
        adv(word.length);
        continue;
      }
      if (key === 'fine' || key === 'dc' || key === 'ds' || key === 'segno') {
        tokens.push({ type: 'directive', raw: word, value: key, line: sLine, col: sCol, pos: sPos });
        adv(word.length);
        continue;
      }
      let raw = ch; adv();
      while (i < len && !/[\s|%():]/.test(text[i])) { raw += text[i]; adv(); }
      tokens.push({ type: 'error', raw, line: sLine, col: sCol, pos: sPos });
      continue;
    }

    let raw = ch; adv();
    while (i < len && !/[\s|%():]/.test(text[i])) { raw += text[i]; adv(); }
    tokens.push({ type: 'error', raw, line: sLine, col: sCol, pos: sPos });
  }
  return tokens;
}

function parseNoteToken(raw: string) {
  const degree = parseInt(raw.charAt(0), 10);
  let octave = 0, j = 1;
  while (raw.charAt(j) === '\'' || raw.charAt(j) === ',') {
    octave += raw.charAt(j) === '\'' ? 1 : -1;
    j++;
  }
  let flags = 0;
  while (raw.charAt(j) === '_') { flags++; j++; }
  const dotted = raw.charAt(j) === '.';
  const base = flags === 0 ? 1 : flags === 1 ? 0.5 : 0.25;
  const dur = base * (dotted ? 1.5 : 1);
  return { degree, octave, flags, dotted, dur };
}

interface DynMark {
  noteIndex: number;   // 作用于第几个源音符
  kind: 'set' | 'cresc' | 'dim';
  level: number;
  baseLevel: number;   // 渐变起始力度
  label: string;
}

export function parse(text: string): ParseResult {
  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const hdr = parseHeader(text);
  const tokens = tokenize(text.slice(hdr.bodyStart), hdr.bodyStart);
  const keyMidi = keyRootMidi(hdr.key);

  const measures: ScoreEvent[][] = [[]];
  const meta: MeasureMeta[] = [{ index: 0, beats: 0, expected: 0, repeatStart: false, repeatEnd: false, final: false }];
  let cur = measures[0];
  let curMeta = meta[0];
  let prevNote: NoteEvent | null = null;
  let id = 0;

  const sourceNotes: NoteEvent[] = [];
  const dynMarks: DynMark[] = [];
  let pendingDynamic:
    | { kind: 'set' | 'cresc' | 'dim'; level: number; label: string; baseLevel: number; pos: number; len: number }
    | null = null;

  let slurId = 0;
  let currentSlur: number | null = null;
  let slurMembers: NoteEvent[] = [];
  let slurOpenPos = -1;   // 当前未闭合连音线的左括号位置

  const measureFlags: Array<{ repeatStart: boolean; repeatEnd: boolean; fine: boolean; segno: boolean }> = [
    { repeatStart: false, repeatEnd: false, fine: false, segno: false },
  ];
  let hasDC = false, hasDS = false;

  function finalizeSlur(closePos = -1) {
    if (currentSlur === null || slurMembers.length === 0) {
      currentSlur = null; slurMembers = []; slurOpenPos = -1; return;
    }
    const list = slurMembers;
    const sid = currentSlur;
    const playable = list.filter((n) => n.type === 'note');
    const samePitch = playable.length > 1 &&
      playable.every((n) => n.degree === playable[0].degree && n.octave === playable[0].octave);
    list.forEach((n, idx) => {
      n.slurId = sid;
      n.slurPos = idx === 0 ? 'start' : idx === list.length - 1 ? 'end' : 'mid';
      n.slurOpenPos = slurOpenPos >= 0 ? slurOpenPos : undefined;
      n.slurClosePos = closePos >= 0 ? closePos : undefined;
      if (samePitch && idx > 0) n.isTieContinue = true;
    });
    if (samePitch) {
      for (let k = 1; k < list.length; k++) {
        list[0].dur += list[k].dur;
        list[0].extend = Math.max(0, Math.round(list[0].dur - 1));
      }
    }
    currentSlur = null; slurMembers = []; slurOpenPos = -1;
  }

  function hasContent(m: ScoreEvent[]): boolean {
    return m.some((e) => e.type === 'note' || e.type === 'rest');
  }

  function newMeasure() {
    measures.push([]);
    cur = measures[measures.length - 1];
    meta.push({ index: meta.length, beats: 0, expected: 0, repeatStart: false, repeatEnd: false, final: false });
    curMeta = meta[meta.length - 1];
    measureFlags.push({ repeatStart: false, repeatEnd: false, fine: false, segno: false });
    prevNote = null; // 增时线不跨小节
  }

  /** 标记某小节为反复起点 / 终点 / 终止 */
  function markLast(key: 'repeatStart' | 'repeatEnd' | 'final', fallbackPrev: boolean) {
    const withContent = hasContent(cur);
    if (withContent || !fallbackPrev || measures.length === 1) {
      const mm = meta[meta.length - 1];
      mm[key] = true;
      return;
    }
    // 当前小节是空的（例如 :| 之后紧接 ||），把标记交给前一小节
    const mm = meta[meta.length - 2];
    if (mm) mm[key] = true;
  }

  for (const tk of tokens) {
    if (tk.type === 'note') {
      const p = parseNoteToken(tk.raw);
      const isRest = p.degree === 0;
      const ev: NoteEvent = {
        type: isRest ? 'rest' : 'note',
        degree: p.degree, octave: p.octave, flags: p.flags, dotted: p.dotted,
        dur: p.dur, extend: 0, raw: tk.raw, id, startInMeasure: curMeta.beats,
        velocity: DEFAULT_VELOCITY,
        srcPos: tk.pos, srcLen: tk.raw.length, srcEnd: tk.pos + tk.raw.length,
      };
      if (!isRest) ev.midi = noteMidi(p.degree, p.octave, keyMidi);
      cur.push(ev);
      curMeta.beats += p.dur;
      sourceNotes.push(ev);
      id++;
      prevNote = ev;
      if (pendingDynamic) {
        dynMarks.push({
          noteIndex: sourceNotes.length - 1,
          kind: pendingDynamic.kind,
          level: pendingDynamic.level,
          baseLevel: pendingDynamic.baseLevel,
          label: pendingDynamic.label,
        });
        ev.dynLabel = pendingDynamic.label;
        ev.dynPos = pendingDynamic.pos;
        ev.dynLen = pendingDynamic.len;
        pendingDynamic = null;
      }
      if (currentSlur !== null) slurMembers.push(ev);
    } else if (tk.type === 'extend') {
      if (!prevNote) {
        errors.push({ line: tk.line, col: tk.col, raw: tk.raw, msg: '增时线 "-" 之前没有音符' });
      } else {
        prevNote.dur += 1;
        prevNote.extend += 1;
        curMeta.beats += 1;
        // 增时线是音符时值的一部分，纳入可编辑区间
        prevNote.srcEnd = Math.max(prevNote.srcEnd, tk.pos + tk.raw.length);
      }
    } else if (tk.type === 'bar') {
      // 连音线 / 延音线允许跨小节，只在 ) 处收口
      newMeasure();
    } else if (tk.type === 'finalbar') {
      finalizeSlur();
      markLast('final', true);
      if (hasContent(cur)) newMeasure();
    } else if (tk.type === 'repeatStart') {
      finalizeSlur();
      // 反复记号标记在「紧随其后的小节」开头；若当前小节已有内容则先开新小节
      if (hasContent(cur)) newMeasure();
      markLast('repeatStart', false);
      measureFlags[measureFlags.length - 1].repeatStart = true;
    } else if (tk.type === 'repeatEnd') {
      finalizeSlur();
      markLast('repeatEnd', false);
      measureFlags[measureFlags.length - 1].repeatEnd = true;
      newMeasure();
    } else if (tk.type === 'slurOpen') {
      finalizeSlur();
      currentSlur = slurId++;
      slurMembers = [];
      slurOpenPos = tk.pos;
    } else if (tk.type === 'slurClose') {
      finalizeSlur(tk.pos);
    } else if (tk.type === 'dynamic') {
      const key = tk.value;
      const last = dynMarks.length ? dynMarks[dynMarks.length - 1] : null;
      const lastLevel = last
        ? (last.kind === 'set' ? last.level : last.baseLevel)
        : DEFAULT_VELOCITY;
      if (key === 'cresc' || key === 'dim') {
        pendingDynamic = {
          kind: key === 'cresc' ? 'cresc' : 'dim',
          level: key === 'cresc' ? Math.min(1, lastLevel + 0.3) : Math.max(0.15, lastLevel - 0.3),
          baseLevel: lastLevel,
          label: DYNAMICS_LABEL[key] ?? (key === 'cresc' ? 'cresc.' : 'dim.'),
          pos: tk.pos, len: tk.raw.length,
        };
      } else {
        const lv = DYNAMICS_STEP[key] ?? DEFAULT_VELOCITY;
        pendingDynamic = { kind: 'set', level: lv, baseLevel: lv, label: DYNAMICS_LABEL[key] ?? key, pos: tk.pos, len: tk.raw.length };
      }
    } else if (tk.type === 'directive') {
      const v = tk.value;
      const flags = measureFlags[measureFlags.length - 1];
      if (v === 'fine') flags.fine = true;
      else if (v === 'dc') hasDC = true;
      else if (v === 'ds') hasDS = true;
      else if (v === 'segno') flags.segno = true;
      const kindMap: Record<string, DirectiveEvent['kind']> = { fine: 'fine', dc: 'dc', ds: 'ds', segno: 'segno' };
      cur.push({ type: 'directive', kind: kindMap[v], text: v, raw: tk.raw });
    } else if (tk.type === 'error') {
      errors.push({ line: tk.line, col: tk.col, raw: tk.raw, msg: '无法识别的字符或记号' });
    }
  }
  finalizeSlur();

  // 移除所有空小节（连续小节线、结尾多余标记等产生的空壳）
  for (let i = measures.length - 1; i >= 0; i--) {
    if (measures[i].length === 0 && measures.length > 1) {
      measures.splice(i, 1);
      meta.splice(i, 1);
      measureFlags.splice(i, 1);
    }
  }
  meta.forEach((m, idx) => { m.index = idx; });

  // —— 结算每个音符的力度（支持渐强/渐弱线性插值）——
  const lastIdx = sourceNotes.length - 1;
  for (let k = 0; k < sourceNotes.length; k++) {
    let apply: DynMark | null = null;
    for (const m of dynMarks) { if (m.noteIndex <= k) apply = m; else break; }
    if (!apply) { sourceNotes[k].velocity = DEFAULT_VELOCITY; continue; }
    if (apply.kind === 'set') { sourceNotes[k].velocity = apply.level; continue; }
    let endIdx = lastIdx;
    for (const m of dynMarks) { if (m.noteIndex > apply.noteIndex) { endIdx = m.noteIndex - 1; break; } }
    const span = Math.max(1, endIdx - apply.noteIndex);
    const t = Math.min(1, (k - apply.noteIndex) / span);
    sourceNotes[k].velocity = apply.baseLevel + (apply.level - apply.baseLevel) * t;
  }

  // —— 小节拍数校验 ——
  const expectedBeats = hdr.timeSig.num * (4 / hdr.timeSig.den);
  for (let mi = 0; mi < measures.length; mi++) {
    const mm = meta[mi];
    mm.expected = expectedBeats;
    if (Math.abs(mm.beats - expectedBeats) > 1e-6 && mm.beats > 0) {
      const diff = mm.beats - expectedBeats;
      warnings.push(
        `第 ${mi + 1} 小节为 ${trimNum(mm.beats)} 拍，应为 ${trimNum(expectedBeats)} 拍（${diff > 0 ? '多' : '少'} ${trimNum(Math.abs(diff))} 拍）`
      );
    }
  }

  // —— 反复记号展开播放顺序 ——
  const playOrder: number[] = [];
  {
    const repeatUsed = new Set<number>();
    const segnoIndex = measureFlags.findIndex((f) => f.segno);
    let i = 0, dcDone = false, dsDone = false, guard = 0;
    let anchor = -1;
    while (i < measures.length && playOrder.length < MAX_PLAY_MEASURES && guard++ < MAX_PLAY_MEASURES * 2) {
      playOrder.push(i);
      const flags = measureFlags[i];
      if (flags.fine) break;
      if (flags.repeatStart) anchor = i;
      if (flags.repeatEnd && anchor >= 0 && !repeatUsed.has(anchor)) {
        repeatUsed.add(anchor);
        i = anchor;
        continue;
      }
      i++;
      if (i >= measures.length) {
        if (hasDS && !dsDone && segnoIndex >= 0) { dsDone = true; i = segnoIndex; continue; }
        if (hasDC && !dcDone) { dcDone = true; i = 0; continue; }
        break;
      }
    }
  }
  const hasRepeat =
    playOrder.length > measures.length ||
    hasDC || hasDS ||
    measureFlags.some((f) => f.repeatStart || f.repeatEnd);

  // —— 生成播放时间轴 ——
  const timeline: TimelineItem[] = [];
  let beat = 0;
  let playId = 0;
  let noteCount = 0;
  for (const mi of playOrder) {
    for (const ev of measures[mi]) {
      if (ev.type !== 'note' && ev.type !== 'rest') continue;
      if (ev.isTieContinue) continue; // 延音线后续音不单独发声
      // 处于圆滑线内（且不是最后一个音）→ 连奏；否则断奏，听感上区分明显
      // 注意：slurId 从 0 开始，必须判 undefined 而不是判真值
      const legato = ev.slurId !== undefined && !ev.isTieContinue && ev.slurPos !== 'end';
      timeline.push({
        id: playId++,
        sourceId: ev.id,
        start: beat + ev.startInMeasure,
        dur: ev.dur,
        midi: ev.type === 'rest' ? null : ev.midi ?? null,
        velocity: ev.velocity,
        legato,
      });
      if (ev.type === 'note') noteCount++;
    }
    beat += meta[mi].beats;
  }

  const song: Song = {
    keyRaw: displayKey(hdr.key),
    keyRootMidi: keyMidi,
    timeSig: hdr.timeSig,
    bpm: hdr.bpm,
    measures,
    measureMeta: meta,
    timeline,
    noteCount,
    playCount: timeline.length,
    totalBeats: beat,
    hasRepeat,
  };

  return { ok: timeline.length > 0, errors, warnings, song };
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
