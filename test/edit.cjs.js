"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// test/edit.entry.ts
var edit_entry_exports = {};
__export(edit_entry_exports, {
  KEY_ROOT: () => KEY_ROOT,
  appendNote: () => appendNote,
  applyEdits: () => applyEdits,
  applySlur: () => applySlur,
  collectRange: () => collectRange,
  deleteNotes: () => deleteNotes,
  displayKey: () => displayKey,
  freqFromMidi: () => freqFromMidi,
  insertAfter: () => insertAfter,
  insertBefore: () => insertBefore,
  keyRootMidi: () => keyRootMidi,
  normalizeKey: () => normalizeKey,
  noteMidi: () => noteMidi,
  noteToken: () => noteToken,
  parse: () => parse,
  removeSlur: () => removeSlur,
  setDegree: () => setDegree,
  setDynamic: () => setDynamic,
  setExtend: () => setExtend,
  setFlags: () => setFlags,
  shiftOctave: () => shiftOctave,
  toggleDot: () => toggleDot
});
module.exports = __toCommonJS(edit_entry_exports);

// src/core/parser.ts
var KEY_ROOT = {
  C: 60,
  "C#": 61,
  Db: 61,
  D: 62,
  "D#": 63,
  Eb: 63,
  E: 64,
  F: 65,
  "F#": 66,
  Gb: 54,
  G: 67,
  "G#": 68,
  Ab: 56,
  A: 69,
  "A#": 70,
  Bb: 58,
  B: 59,
  Cb: 59
};
var SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 };
var DYNAMICS_STEP = {
  ppp: 0.22,
  pp: 0.32,
  p: 0.45,
  mp: 0.58,
  mf: 0.7,
  f: 0.85,
  ff: 0.95,
  fff: 1
};
var DYNAMICS_LABEL = {
  ppp: "ppp",
  pp: "pp",
  p: "p",
  mp: "mp",
  mf: "mf",
  f: "f",
  ff: "ff",
  fff: "fff",
  cresc: "cresc.",
  dim: "dim."
};
var DEFAULT_VELOCITY = 0.7;
var MAX_PLAY_MEASURES = 400;
function normalizeKey(s) {
  if (!s) return "C";
  const v = String(s).trim();
  let acc = "";
  let letter = "";
  if (v.charAt(0) === "b" || v.charAt(0) === "#") {
    acc = v.charAt(0);
    letter = v.charAt(1);
  } else {
    letter = v.charAt(0);
    if (v.charAt(1) === "b" || v.charAt(1) === "#") acc = v.charAt(1);
  }
  letter = (letter || "C").toUpperCase();
  if (acc === "b") return letter + "b";
  if (acc === "#") return letter + "#";
  return letter;
}
function keyRootMidi(key) {
  return KEY_ROOT[normalizeKey(key)] ?? 60;
}
function noteMidi(degree, octave, keyMidi) {
  return keyMidi + (octave || 0) * 12 + (SEMI[degree] || 0);
}
function freqFromMidi(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
function displayKey(raw) {
  const n = normalizeKey(raw);
  if (n.length === 2) {
    if (n.charAt(1) === "b") return "b" + n.charAt(0);
    if (n.charAt(1) === "#") return "#" + n.charAt(0);
  }
  return n;
}
function parseHeader(text) {
  let key = "C";
  let timeSig = { num: 4, den: 4 };
  let bpm = 80;
  let bodyStart = text.length;
  let offset = 0;
  for (const rawLine of text.split("\n")) {
    const lineStart = offset;
    offset += rawLine.length + 1;
    const c = rawLine.indexOf("%");
    const limit = c >= 0 ? c : rawLine.length;
    let p = 0;
    let matched = true;
    while (matched) {
      matched = false;
      while (p < limit && /\s/.test(rawLine[p])) p++;
      const rest = rawLine.slice(p, limit);
      let m;
      if (m = /^1\s*=\s*([b#]?[A-Ga-g])/.exec(rest)) {
        key = m[1];
        p += m[0].length;
        matched = true;
        continue;
      }
      if (m = /^(\d{1,2})\s*\/\s*(\d{1,2})/.exec(rest)) {
        timeSig = { num: parseInt(m[1], 10), den: parseInt(m[2], 10) };
        p += m[0].length;
        matched = true;
        continue;
      }
      if (m = /^(\d{1,3})\s*bpm/i.exec(rest)) {
        bpm = parseInt(m[1], 10);
        p += m[0].length;
        matched = true;
        continue;
      }
      if (m = /^♩\s*=\s*(\d{1,3})/.exec(rest)) {
        bpm = parseInt(m[1], 10);
        p += m[0].length;
        matched = true;
        continue;
      }
      if (m = /^速度\s*=\s*(\d{1,3})/.exec(rest)) {
        bpm = parseInt(m[1], 10);
        p += m[0].length;
        matched = true;
        continue;
      }
    }
    if (p < rawLine.length && rawLine.slice(p).trim() !== "") {
      bodyStart = lineStart + p;
      break;
    }
  }
  return { key, timeSig, bpm, bodyStart };
}
function tokenize(text, baseOffset) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  const len = text.length;
  const abs = (idx) => baseOffset + idx;
  const adv = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (i >= len) return;
      if (text[i] === "\n") {
        line++;
        col = 1;
      } else col++;
      i++;
    }
  };
  while (i < len) {
    const ch = text[i];
    const sLine = line, sCol = col, sPos = abs(i);
    if (ch === "\n" || ch === "\r" || ch === " " || ch === "	") {
      adv();
      continue;
    }
    if (ch === "%") {
      while (i < len && text[i] !== "\n") adv();
      continue;
    }
    if (ch === ":") {
      let raw2 = ":";
      adv();
      if (text[i] === "|") {
        raw2 += "|";
        adv();
        if (text[i] === "|") {
          raw2 += "|";
          adv();
        }
        tokens.push({ type: "repeatEnd", raw: raw2, line: sLine, col: sCol, pos: sPos });
        continue;
      }
      tokens.push({ type: "error", raw: raw2, line: sLine, col: sCol, pos: sPos });
      continue;
    }
    if (ch === "|") {
      let raw2 = "|";
      adv();
      if (text[i] === ":") {
        raw2 += ":";
        adv();
        tokens.push({ type: "repeatStart", raw: raw2, line: sLine, col: sCol, pos: sPos });
        continue;
      }
      if (text[i] === "|" || text[i] === "]") {
        raw2 += text[i];
        adv();
        tokens.push({ type: "finalbar", raw: raw2, line: sLine, col: sCol, pos: sPos });
        continue;
      }
      tokens.push({ type: "bar", raw: raw2, line: sLine, col: sCol, pos: sPos });
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "slurOpen", raw: "(", line: sLine, col: sCol, pos: sPos });
      adv();
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "slurClose", raw: ")", line: sLine, col: sCol, pos: sPos });
      adv();
      continue;
    }
    if (ch === "<" || ch === ">") {
      tokens.push({ type: "dynamic", raw: ch, value: ch === "<" ? "cresc" : "dim", line: sLine, col: sCol, pos: sPos });
      adv();
      continue;
    }
    if (ch === "\xA7") {
      tokens.push({ type: "directive", raw: "\xA7", value: "segno", line: sLine, col: sCol, pos: sPos });
      adv();
      continue;
    }
    if (ch === "-") {
      tokens.push({ type: "extend", raw: "-", line: sLine, col: sCol, pos: sPos });
      adv();
      continue;
    }
    if (ch >= "0" && ch <= "7") {
      let raw2 = ch;
      adv();
      while (text[i] === "'" || text[i] === ",") {
        raw2 += text[i];
        adv();
      }
      while (text[i] === "_") {
        raw2 += text[i];
        adv();
      }
      if (text[i] === ".") {
        raw2 += text[i];
        adv();
      }
      tokens.push({ type: "note", raw: raw2, line: sLine, col: sCol, pos: sPos });
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const m = /^[A-Za-z.]+/.exec(text.slice(i));
      const word = m ? m[0] : ch;
      const key = word.replace(/\./g, "").toLowerCase();
      if (DYNAMICS_STEP[key] !== void 0 || key === "cresc" || key === "dim" || key === "crescendo" || key === "diminuendo") {
        const v = key === "crescendo" ? "cresc" : key === "diminuendo" ? "dim" : key;
        tokens.push({ type: "dynamic", raw: word, value: v, line: sLine, col: sCol, pos: sPos });
        adv(word.length);
        continue;
      }
      if (key === "fine" || key === "dc" || key === "ds" || key === "segno") {
        tokens.push({ type: "directive", raw: word, value: key, line: sLine, col: sCol, pos: sPos });
        adv(word.length);
        continue;
      }
      let raw2 = ch;
      adv();
      while (i < len && !/[\s|%():]/.test(text[i])) {
        raw2 += text[i];
        adv();
      }
      tokens.push({ type: "error", raw: raw2, line: sLine, col: sCol, pos: sPos });
      continue;
    }
    let raw = ch;
    adv();
    while (i < len && !/[\s|%():]/.test(text[i])) {
      raw += text[i];
      adv();
    }
    tokens.push({ type: "error", raw, line: sLine, col: sCol, pos: sPos });
  }
  return tokens;
}
function parseNoteToken(raw) {
  const degree = parseInt(raw.charAt(0), 10);
  let octave = 0, j = 1;
  while (raw.charAt(j) === "'" || raw.charAt(j) === ",") {
    octave += raw.charAt(j) === "'" ? 1 : -1;
    j++;
  }
  let flags = 0;
  while (raw.charAt(j) === "_") {
    flags++;
    j++;
  }
  const dotted = raw.charAt(j) === ".";
  const base = flags === 0 ? 1 : flags === 1 ? 0.5 : 0.25;
  const dur = base * (dotted ? 1.5 : 1);
  return { degree, octave, flags, dotted, dur };
}
function parse(text) {
  const errors = [];
  const warnings = [];
  const hdr = parseHeader(text);
  const tokens = tokenize(text.slice(hdr.bodyStart), hdr.bodyStart);
  const keyMidi = keyRootMidi(hdr.key);
  const measures = [[]];
  const meta = [{ index: 0, beats: 0, expected: 0, repeatStart: false, repeatEnd: false, final: false }];
  let cur = measures[0];
  let curMeta = meta[0];
  let prevNote = null;
  let id = 0;
  const sourceNotes = [];
  const dynMarks = [];
  let pendingDynamic = null;
  let slurId = 0;
  let currentSlur = null;
  let slurMembers = [];
  let slurOpenPos = -1;
  const measureFlags = [
    { repeatStart: false, repeatEnd: false, fine: false, segno: false }
  ];
  let hasDC = false, hasDS = false;
  function finalizeSlur(closePos = -1) {
    if (currentSlur === null || slurMembers.length === 0) {
      currentSlur = null;
      slurMembers = [];
      slurOpenPos = -1;
      return;
    }
    const list = slurMembers;
    const sid = currentSlur;
    const playable = list.filter((n) => n.type === "note");
    const samePitch = playable.length > 1 && playable.every((n) => n.degree === playable[0].degree && n.octave === playable[0].octave);
    list.forEach((n, idx) => {
      n.slurId = sid;
      n.slurPos = idx === 0 ? "start" : idx === list.length - 1 ? "end" : "mid";
      n.slurOpenPos = slurOpenPos >= 0 ? slurOpenPos : void 0;
      n.slurClosePos = closePos >= 0 ? closePos : void 0;
      if (samePitch && idx > 0) n.isTieContinue = true;
    });
    if (samePitch) {
      for (let k = 1; k < list.length; k++) {
        list[0].dur += list[k].dur;
        list[0].extend = Math.max(0, Math.round(list[0].dur - 1));
      }
    }
    currentSlur = null;
    slurMembers = [];
    slurOpenPos = -1;
  }
  function hasContent(m) {
    return m.some((e) => e.type === "note" || e.type === "rest");
  }
  function newMeasure() {
    measures.push([]);
    cur = measures[measures.length - 1];
    meta.push({ index: meta.length, beats: 0, expected: 0, repeatStart: false, repeatEnd: false, final: false });
    curMeta = meta[meta.length - 1];
    measureFlags.push({ repeatStart: false, repeatEnd: false, fine: false, segno: false });
    prevNote = null;
  }
  function markLast(key, fallbackPrev) {
    const withContent = hasContent(cur);
    if (withContent || !fallbackPrev || measures.length === 1) {
      const mm2 = meta[meta.length - 1];
      mm2[key] = true;
      return;
    }
    const mm = meta[meta.length - 2];
    if (mm) mm[key] = true;
  }
  for (const tk of tokens) {
    if (tk.type === "note") {
      const p = parseNoteToken(tk.raw);
      const isRest = p.degree === 0;
      const ev = {
        type: isRest ? "rest" : "note",
        degree: p.degree,
        octave: p.octave,
        flags: p.flags,
        dotted: p.dotted,
        dur: p.dur,
        extend: 0,
        raw: tk.raw,
        id,
        startInMeasure: curMeta.beats,
        velocity: DEFAULT_VELOCITY,
        srcPos: tk.pos,
        srcLen: tk.raw.length,
        srcEnd: tk.pos + tk.raw.length
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
          label: pendingDynamic.label
        });
        ev.dynLabel = pendingDynamic.label;
        ev.dynPos = pendingDynamic.pos;
        ev.dynLen = pendingDynamic.len;
        pendingDynamic = null;
      }
      if (currentSlur !== null) slurMembers.push(ev);
    } else if (tk.type === "extend") {
      if (!prevNote) {
        errors.push({ line: tk.line, col: tk.col, raw: tk.raw, msg: '\u589E\u65F6\u7EBF "-" \u4E4B\u524D\u6CA1\u6709\u97F3\u7B26' });
      } else {
        prevNote.dur += 1;
        prevNote.extend += 1;
        curMeta.beats += 1;
        prevNote.srcEnd = Math.max(prevNote.srcEnd, tk.pos + tk.raw.length);
      }
    } else if (tk.type === "bar") {
      newMeasure();
    } else if (tk.type === "finalbar") {
      finalizeSlur();
      markLast("final", true);
      if (hasContent(cur)) newMeasure();
    } else if (tk.type === "repeatStart") {
      finalizeSlur();
      if (hasContent(cur)) newMeasure();
      markLast("repeatStart", false);
      measureFlags[measureFlags.length - 1].repeatStart = true;
    } else if (tk.type === "repeatEnd") {
      finalizeSlur();
      markLast("repeatEnd", false);
      measureFlags[measureFlags.length - 1].repeatEnd = true;
      newMeasure();
    } else if (tk.type === "slurOpen") {
      finalizeSlur();
      currentSlur = slurId++;
      slurMembers = [];
      slurOpenPos = tk.pos;
    } else if (tk.type === "slurClose") {
      finalizeSlur(tk.pos);
    } else if (tk.type === "dynamic") {
      const key = tk.value;
      const last = dynMarks.length ? dynMarks[dynMarks.length - 1] : null;
      const lastLevel = last ? last.kind === "set" ? last.level : last.baseLevel : DEFAULT_VELOCITY;
      if (key === "cresc" || key === "dim") {
        pendingDynamic = {
          kind: key === "cresc" ? "cresc" : "dim",
          level: key === "cresc" ? Math.min(1, lastLevel + 0.3) : Math.max(0.15, lastLevel - 0.3),
          baseLevel: lastLevel,
          label: DYNAMICS_LABEL[key] ?? (key === "cresc" ? "cresc." : "dim."),
          pos: tk.pos,
          len: tk.raw.length
        };
      } else {
        const lv = DYNAMICS_STEP[key] ?? DEFAULT_VELOCITY;
        pendingDynamic = { kind: "set", level: lv, baseLevel: lv, label: DYNAMICS_LABEL[key] ?? key, pos: tk.pos, len: tk.raw.length };
      }
    } else if (tk.type === "directive") {
      const v = tk.value;
      const flags = measureFlags[measureFlags.length - 1];
      if (v === "fine") flags.fine = true;
      else if (v === "dc") hasDC = true;
      else if (v === "ds") hasDS = true;
      else if (v === "segno") flags.segno = true;
      const kindMap = { fine: "fine", dc: "dc", ds: "ds", segno: "segno" };
      cur.push({ type: "directive", kind: kindMap[v], text: v, raw: tk.raw });
    } else if (tk.type === "error") {
      errors.push({ line: tk.line, col: tk.col, raw: tk.raw, msg: "\u65E0\u6CD5\u8BC6\u522B\u7684\u5B57\u7B26\u6216\u8BB0\u53F7" });
    }
  }
  finalizeSlur();
  for (let i = measures.length - 1; i >= 0; i--) {
    if (measures[i].length === 0 && measures.length > 1) {
      measures.splice(i, 1);
      meta.splice(i, 1);
      measureFlags.splice(i, 1);
    }
  }
  meta.forEach((m, idx) => {
    m.index = idx;
  });
  const lastIdx = sourceNotes.length - 1;
  for (let k = 0; k < sourceNotes.length; k++) {
    let apply = null;
    for (const m of dynMarks) {
      if (m.noteIndex <= k) apply = m;
      else break;
    }
    if (!apply) {
      sourceNotes[k].velocity = DEFAULT_VELOCITY;
      continue;
    }
    if (apply.kind === "set") {
      sourceNotes[k].velocity = apply.level;
      continue;
    }
    let endIdx = lastIdx;
    for (const m of dynMarks) {
      if (m.noteIndex > apply.noteIndex) {
        endIdx = m.noteIndex - 1;
        break;
      }
    }
    const span = Math.max(1, endIdx - apply.noteIndex);
    const t = Math.min(1, (k - apply.noteIndex) / span);
    sourceNotes[k].velocity = apply.baseLevel + (apply.level - apply.baseLevel) * t;
  }
  const expectedBeats = hdr.timeSig.num * (4 / hdr.timeSig.den);
  for (let mi = 0; mi < measures.length; mi++) {
    const mm = meta[mi];
    mm.expected = expectedBeats;
    if (Math.abs(mm.beats - expectedBeats) > 1e-6 && mm.beats > 0) {
      const diff = mm.beats - expectedBeats;
      warnings.push(
        `\u7B2C ${mi + 1} \u5C0F\u8282\u4E3A ${trimNum(mm.beats)} \u62CD\uFF0C\u5E94\u4E3A ${trimNum(expectedBeats)} \u62CD\uFF08${diff > 0 ? "\u591A" : "\u5C11"} ${trimNum(Math.abs(diff))} \u62CD\uFF09`
      );
    }
  }
  const playOrder = [];
  {
    const repeatUsed = /* @__PURE__ */ new Set();
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
        if (hasDS && !dsDone && segnoIndex >= 0) {
          dsDone = true;
          i = segnoIndex;
          continue;
        }
        if (hasDC && !dcDone) {
          dcDone = true;
          i = 0;
          continue;
        }
        break;
      }
    }
  }
  const hasRepeat = playOrder.length > measures.length || hasDC || hasDS || measureFlags.some((f) => f.repeatStart || f.repeatEnd);
  const timeline = [];
  let beat = 0;
  let playId = 0;
  let noteCount = 0;
  for (const mi of playOrder) {
    for (const ev of measures[mi]) {
      if (ev.type !== "note" && ev.type !== "rest") continue;
      if (ev.isTieContinue) continue;
      const legato = ev.slurId !== void 0 && !ev.isTieContinue && ev.slurPos !== "end";
      timeline.push({
        id: playId++,
        sourceId: ev.id,
        start: beat + ev.startInMeasure,
        dur: ev.dur,
        midi: ev.type === "rest" ? null : ev.midi ?? null,
        velocity: ev.velocity,
        legato
      });
      if (ev.type === "note") noteCount++;
    }
    beat += meta[mi].beats;
  }
  const song = {
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
    hasRepeat
  };
  return { ok: timeline.length > 0, errors, warnings, song };
}
function trimNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// src/core/edit.ts
var rep = (c, n) => new Array(Math.max(0, n | 0)).fill(c).join("");
var isSpace = (c) => c === " " || c === "	" || c === "\n" || c === "\r";
function noteToken(n) {
  const dur = rep("_", Math.min(n.flags, 2)) + (n.dotted ? "." : "");
  if (n.degree === 0) return "0" + dur;
  const oct = n.octave > 0 ? rep("'", n.octave) : rep(",", -n.octave);
  return `${n.degree}${oct}${dur}`;
}
function applyEdits(text, edits) {
  const list = edits.filter((e) => e.end >= e.start).slice().sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  for (const e of list) {
    const s = Math.max(0, Math.min(out.length, e.start));
    const t = Math.max(s, Math.min(out.length, e.end));
    out = out.slice(0, s) + e.insert + out.slice(t);
  }
  return out;
}
function parenEdit(text, pos) {
  if (text[pos] === "(") {
    const len = text[pos + 1] === " " ? 2 : 1;
    return { start: pos, end: pos + len, insert: "" };
  }
  const before = pos > 0 && text[pos - 1] === " " ? 1 : 0;
  return { start: pos - before, end: pos + 1, insert: "" };
}
var sepBefore = (text, pos) => pos > 0 && !isSpace(text[pos - 1]) ? " " : "";
var sepAfter = (text, pos) => pos < text.length && !isSpace(text[pos]) ? " " : "";
function anchorAfter(text, at) {
  let q = at;
  while (q < text.length && text[q] === " ") q++;
  return text[q] === ")" ? q + 1 : at;
}
function setDegree(text, notes, degree) {
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos,
      end: n.srcPos + n.srcLen,
      insert: noteToken({ degree, octave: degree === 0 ? 0 : n.octave, flags: n.flags, dotted: n.dotted })
    }))
  );
}
function shiftOctave(text, notes, delta) {
  return applyEdits(
    text,
    notes.filter((n) => n.degree !== 0).map((n) => {
      const oct = Math.max(-2, Math.min(2, n.octave + delta));
      return { start: n.srcPos, end: n.srcPos + n.srcLen, insert: noteToken({ ...n, octave: oct }) };
    })
  );
}
function setFlags(text, notes, flags) {
  const f = Math.max(0, Math.min(2, flags));
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos,
      end: n.srcPos + n.srcLen,
      insert: noteToken({ ...n, flags: f })
    }))
  );
}
function toggleDot(text, notes) {
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos,
      end: n.srcPos + n.srcLen,
      insert: noteToken({ ...n, dotted: !n.dotted })
    }))
  );
}
function setExtend(text, notes, count) {
  const c = Math.max(0, Math.min(8, Math.round(count)));
  return applyEdits(
    text,
    notes.map((n) => ({
      start: n.srcPos + n.srcLen,
      end: n.srcEnd,
      insert: c > 0 ? rep(" -", c) : ""
    }))
  );
}
function deleteNotes(text, notes) {
  return applyEdits(
    text,
    notes.map((n) => {
      let end = n.srcEnd;
      while (end < text.length && (text[end] === " " || text[end] === "	")) end++;
      return { start: n.srcPos, end, insert: "" };
    })
  );
}
function insertAfter(text, note, token = "1") {
  const at = anchorAfter(text, note.srcEnd);
  return applyEdits(text, [
    { start: at, end: at, insert: sepBefore(text, at) + token + sepAfter(text, at) }
  ]);
}
function insertBefore(text, note, token = "1") {
  let at = note.srcPos;
  let p = at - 1;
  while (p >= 0 && text[p] === " ") p--;
  if (text[p] === "(") at = p;
  return applyEdits(text, [{ start: at, end: at, insert: token + sepAfter(text, at) }]);
}
function appendNote(text, token = "1") {
  let at = text.length;
  while (at > 0 && (text[at - 1] === " " || text[at - 1] === "\n" || text[at - 1] === "	")) at--;
  if (text.slice(Math.max(0, at - 2), at) === "||") at -= 2;
  else if (text[at - 1] === "|") at -= 1;
  while (at > 0 && (text[at - 1] === " " || text[at - 1] === "\n" || text[at - 1] === "	")) at--;
  return applyEdits(text, [{ start: at, end: at, insert: sepBefore(text, at) + token }]);
}
function setDynamic(text, notes, label) {
  const edits = [];
  for (const n of notes) {
    if (n.dynPos !== void 0 && n.dynLen !== void 0) {
      if (label) {
        edits.push({ start: n.dynPos, end: n.dynPos + n.dynLen, insert: label });
      } else {
        const extra = text[n.dynPos + n.dynLen] === " " ? 1 : 0;
        edits.push({ start: n.dynPos, end: n.dynPos + n.dynLen + extra, insert: "" });
      }
    } else if (label) {
      edits.push({
        start: n.srcPos,
        end: n.srcPos,
        insert: sepBefore(text, n.srcPos) + label + " "
      });
    }
  }
  return applyEdits(text, edits);
}
function applySlur(text, notes) {
  if (notes.length < 2) return text;
  const sorted = notes.slice().sort((a, b) => a.srcPos - b.srcPos);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const start = first.srcPos;
  const end = last.srcEnd;
  const edits = [];
  for (let p = start; p < end; p++) {
    if (text[p] === "(" || text[p] === ")") edits.push(parenEdit(text, p));
  }
  if (first.slurOpenPos !== void 0 && first.slurOpenPos < start) edits.push(parenEdit(text, first.slurOpenPos));
  if (last.slurClosePos !== void 0 && last.slurClosePos >= end) edits.push(parenEdit(text, last.slurClosePos));
  edits.push({ start, end: start, insert: sepBefore(text, start) + "(" });
  edits.push({ start: end, end, insert: ")" + sepAfter(text, end) });
  return applyEdits(text, edits);
}
function removeSlur(text, all, selectedIds) {
  const groups = /* @__PURE__ */ new Map();
  for (const n of all) {
    if (n.slurId === void 0 || !selectedIds.has(n.id)) continue;
    const g = groups.get(n.slurId) ?? [];
    g.push(n);
    groups.set(n.slurId, g);
  }
  const edits = [];
  const used = /* @__PURE__ */ new Set();
  for (const g of groups.values()) {
    const open = g.find((n) => n.slurOpenPos !== void 0)?.slurOpenPos;
    const close = g.find((n) => n.slurClosePos !== void 0)?.slurClosePos;
    if (open !== void 0 && !used.has(open)) {
      used.add(open);
      edits.push(parenEdit(text, open));
    }
    if (close !== void 0 && !used.has(close)) {
      used.add(close);
      edits.push(parenEdit(text, close));
    }
  }
  return applyEdits(text, edits);
}
function collectRange(all, ids) {
  const hit = all.filter((n) => ids.has(n.id));
  if (hit.length === 0) return [];
  const minId = Math.min(...hit.map((n) => n.id));
  const maxId = Math.max(...hit.map((n) => n.id));
  return all.filter((n) => n.id >= minId && n.id <= maxId);
}
