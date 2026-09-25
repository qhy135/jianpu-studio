/* ============================================================
 * 可视化编辑：把「点选音符 → 改属性」翻译成对源文本的精确改写
 * 全部为纯函数，输入原始文本 + 解析出的音符，输出新文本
 * ============================================================ */
import type { NoteEvent } from './parser';

const rep = (c: string, n: number) => new Array(Math.max(0, n | 0)).fill(c).join('');
const isSpace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

/** 音符记号的规范文本（不含增时线） */
export function noteToken(n: Pick<NoteEvent, 'degree' | 'octave' | 'flags' | 'dotted'>): string {
  const dur = rep('_', Math.min(n.flags, 2)) + (n.dotted ? '.' : '');
  if (n.degree === 0) return '0' + dur; // 休止符不带八度点
  const oct = n.octave > 0 ? rep('\'', n.octave) : rep(',', -n.octave);
  return `${n.degree}${oct}${dur}`;
}

interface Edit {
  start: number;
  end: number;
  insert: string;
}

/** 按位置从后往前应用，保证前面的下标不会被后面的改动影响 */
export function applyEdits(text: string, edits: Edit[]): string {
  const list = edits
    .filter((e) => e.end >= e.start)
    .slice()
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of list) {
    const s = Math.max(0, Math.min(out.length, e.start));
    const t = Math.max(s, Math.min(out.length, e.end));
    out = out.slice(0, s) + e.insert + out.slice(t);
  }
  return out;
}

/** 删除一个括号，并顺带清掉它紧邻的多余空格 */
function parenEdit(text: string, pos: number): Edit {
  if (text[pos] === '(') {
    const len = text[pos + 1] === ' ' ? 2 : 1;
    return { start: pos, end: pos + len, insert: '' };
  }
  const before = pos > 0 && text[pos - 1] === ' ' ? 1 : 0;
  return { start: pos - before, end: pos + 1, insert: '' };
}

const sepBefore = (text: string, pos: number) => (pos > 0 && !isSpace(text[pos - 1]) ? ' ' : '');
const sepAfter = (text: string, pos: number) => (pos < text.length && !isSpace(text[pos]) ? ' ' : '');

/**
 * 定位插入点：若音符后面紧跟着右括号（说明它是连音线的最后一个音），
 * 就插到括号之后，避免新音被圈进连音线里。
 */
function anchorAfter(text: string, at: number): number {
  let q = at;
  while (q < text.length && text[q] === ' ') q++;
  return text[q] === ')' ? q + 1 : at;
}

/* ------------------------------------------------------------------ */
/* 单项属性                                                             */
/* ------------------------------------------------------------------ */

export function setDegree(text: string, notes: NoteEvent[], degree: number): string {
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos,
      end: n.srcPos + n.srcLen,
      insert: noteToken({ degree, octave: degree === 0 ? 0 : n.octave, flags: n.flags, dotted: n.dotted }),
    })),
  );
}

export function shiftOctave(text: string, notes: NoteEvent[], delta: number): string {
  return applyEdits(
    text,
    notes
      .filter((n) => n.degree !== 0)
      .map((n) => {
        const oct = Math.max(-2, Math.min(2, n.octave + delta));
        return { start: n.srcPos, end: n.srcPos + n.srcLen, insert: noteToken({ ...n, octave: oct }) };
      }),
  );
}

export function setFlags(text: string, notes: NoteEvent[], flags: number): string {
  const f = Math.max(0, Math.min(2, flags));
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos,
      end: n.srcPos + n.srcLen,
      insert: noteToken({ ...n, flags: f }),
    })),
  );
}

export function toggleDot(text: string, notes: NoteEvent[]): string {
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos,
      end: n.srcPos + n.srcLen,
      insert: noteToken({ ...n, dotted: !n.dotted }),
    })),
  );
}

/** 设置增时线数量（0 = 清除） */
export function setExtend(text: string, notes: NoteEvent[], count: number): string {
  const c = Math.max(0, Math.min(8, Math.round(count)));
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos + n.srcLen,
      end: n.srcEnd,
      insert: c > 0 ? rep(' -', c) : '',
    })),
  );
}

export function deleteNotes(text: string, notes: NoteEvent[]): string {
  return applyEdits(
    text,
    notes.map((n) => {
      let end = n.srcEnd;
      while (end < text.length && (text[end] === ' ' || text[end] === '\t')) end++;
      return { start: n.srcPos, end, insert: '' };
    }),
  );
}

/** 在指定音符之后插入记号（音符/小节线/反复记号等均可） */
export function insertAfter(text: string, note: NoteEvent, token = '1'): string {
  const at = anchorAfter(text, note.srcEnd);
  return applyEdits(text, [
    { start: at, end: at, insert: sepBefore(text, at) + token + sepAfter(text, at) },
  ]);
}

/** 在指定音符之前插入记号 */
export function insertBefore(text: string, note: NoteEvent, token = '1'): string {
  let at = note.srcPos;
  // 若前面紧邻左括号，插到括号之前，避免新音被圈进连音线
  let p = at - 1;
  while (p >= 0 && text[p] === ' ') p--;
  if (text[p] === '(') at = p;
  return applyEdits(text, [{ start: at, end: at, insert: token + sepAfter(text, at) }]);
}

/** 在整份谱面末尾追加一个音符 */
export function appendNote(text: string, token = '1'): string {
  let at = text.length;
  while (at > 0 && (text[at - 1] === ' ' || text[at - 1] === '\n' || text[at - 1] === '\t')) at--;
  // 末尾若有终止线 || ，插到它前面
  if (text.slice(Math.max(0, at - 2), at) === '||') at -= 2;
  else if (text[at - 1] === '|') at -= 1;
  while (at > 0 && (text[at - 1] === ' ' || text[at - 1] === '\n' || text[at - 1] === '\t')) at--;
  return applyEdits(text, [{ start: at, end: at, insert: sepBefore(text, at) + token }]);
}

/** 力度记号：label 为空表示清除 */
export function setDynamic(text: string, notes: NoteEvent[], label: string): string {
  const edits: Edit[] = [];
  for (const n of notes) {
    if (n.dynPos !== undefined && n.dynLen !== undefined) {
      if (label) {
        edits.push({ start: n.dynPos, end: n.dynPos + n.dynLen, insert: label });
      } else {
        const extra = text[n.dynPos + n.dynLen] === ' ' ? 1 : 0;
        edits.push({ start: n.dynPos, end: n.dynPos + n.dynLen + extra, insert: '' });
      }
    } else if (label) {
      edits.push({
        start: n.srcPos,
        end: n.srcPos,
        insert: sepBefore(text, n.srcPos) + label + ' ',
      });
    }
  }
  return applyEdits(text, edits);
}

/* ------------------------------------------------------------------ */
/* 连音线 / 延音线                                                      */
/* ------------------------------------------------------------------ */

/**
 * 给选中的音符加连音线（跨小节也没问题 —— 直接跨越小节线包起来）。
 * 同音高的一组会自动被解析器识别为延音线。
 */
export function applySlur(text: string, notes: NoteEvent[]): string {
  if (notes.length < 2) return text;
  const sorted = notes.slice().sort((a, b) => a.srcPos - b.srcPos);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = first.srcPos;
  const end = last.srcEnd;
  const edits: Edit[] = [];

  // 1. 清掉区间内部已有的括号，避免嵌套
  for (let p = start; p < end; p++) {
    if (text[p] === '(' || text[p] === ')') edits.push(parenEdit(text, p));
  }
  // 2. 清掉与本区间相交、但落在区间外的括号（首音所属连音线的左括号 / 尾音的右括号）
  if (first.slurOpenPos !== undefined && first.slurOpenPos < start) edits.push(parenEdit(text, first.slurOpenPos));
  if (last.slurClosePos !== undefined && last.slurClosePos >= end) edits.push(parenEdit(text, last.slurClosePos));

  // 3. 重新在两端补括号
  edits.push({ start, end: start, insert: sepBefore(text, start) + '(' });
  edits.push({ start: end, end, insert: ')' + sepAfter(text, end) });
  return applyEdits(text, edits);
}

/** 取消选中音符所在的连音线（整组一起解除） */
export function removeSlur(text: string, all: NoteEvent[], selectedIds: Set<number>): string {
  const groups = new Map<number, NoteEvent[]>();
  for (const n of all) {
    if (n.slurId === undefined || !selectedIds.has(n.id)) continue;
    const g = groups.get(n.slurId) ?? [];
    g.push(n);
    groups.set(n.slurId, g);
  }
  const edits: Edit[] = [];
  const used = new Set<number>();
  for (const g of groups.values()) {
    const open = g.find((n) => n.slurOpenPos !== undefined)?.slurOpenPos;
    const close = g.find((n) => n.slurClosePos !== undefined)?.slurClosePos;
    if (open !== undefined && !used.has(open)) { used.add(open); edits.push(parenEdit(text, open)); }
    if (close !== undefined && !used.has(close)) { used.add(close); edits.push(parenEdit(text, close)); }
  }
  return applyEdits(text, edits);
}

/** 选中区间内所有音符（按文本顺序）；用于把多选规整成连续区间 */
export function collectRange(all: NoteEvent[], ids: Set<number>): NoteEvent[] {
  const hit = all.filter((n) => ids.has(n.id));
  if (hit.length === 0) return [];
  const minId = Math.min(...hit.map((n) => n.id));
  const maxId = Math.max(...hit.map((n) => n.id));
  return all.filter((n) => n.id >= minId && n.id <= maxId);
}
