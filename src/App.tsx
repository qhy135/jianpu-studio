import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from './components/Editor';
import ScoreView from './components/ScoreView';
import PlayerBar, { type ComparePhase } from './components/PlayerBar';
import HelpModal from './components/HelpModal';
import Inspector, { type EditAction } from './components/Inspector';
import { parse, type NoteEvent, type ParseError, type Song } from './core/parser';
import {
  appendNote, applySlur, collectRange, deleteNotes, insertAfter, insertBefore, noteToken,
  removeSlur, setDegree, setDynamic, setExtend, setFlags, shiftOctave, toggleDot,
} from './core/edit';
import { AudioEngine, type EngineState } from './core/audio';

const EXAMPLES: Record<string, string> = {
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
  // 功能演示：力度、跨小节连音线、反复记号一次看懂
  demo:
    '1=C 4/4 96bpm\n' +
    '|: mf 1 2 3 4 | < (5 6 5 4 | 3 2 1 2) | f 3 4 5 6 | p 1 - - - :| ||',
};

const MENU_MAP: Record<string, string> = {
  'menu:example:twinkle': 'twinkle',
  'menu:example:birthday': 'birthday',
  'menu:example:jasmine': 'jasmine',
  'menu:clear': 'clear',
  'menu:export': 'export',
  'menu:play': 'play',
  'menu:stop': 'stop',
  'menu:bpm:up': 'bpmUp',
  'menu:bpm:down': 'bpmDown',
  'menu:help': 'help',
};

function flattenNotes(song: Song | null): NoteEvent[] {
  if (!song) return [];
  const out: NoteEvent[] = [];
  for (const m of song.measures) {
    for (const e of m) {
      if (e.type === 'note' || e.type === 'rest') out.push(e);
    }
  }
  return out;
}

export default function App() {
  const engine = useMemo(() => new AudioEngine(), []);

  const [text, setText] = useState(EXAMPLES.twinkle);
  const [errors, setErrors] = useState<ParseError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [bpm, setBpm] = useState(100);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [compare, setCompare] = useState<ComparePhase>('off');

  const headerBpmRef = useRef(100);
  const songRef = useRef<Song | null>(null);
  songRef.current = song;

  const allNotes = useMemo(() => flattenNotes(song), [song]);
  const allNotesRef = useRef<NoteEvent[]>([]);
  allNotesRef.current = allNotes;

  const selectedNotes = useMemo(
    () => allNotes.filter((n) => selected.has(n.id)),
    [allNotes, selected],
  );
  const selectedNotesRef = useRef<NoteEvent[]>([]);
  selectedNotesRef.current = selectedNotes;

  const measureOf = useCallback((id: number) => {
    const s = songRef.current;
    if (!s) return 0;
    for (let mi = 0; mi < s.measures.length; mi++) {
      if (s.measures[mi].some((e) => (e.type === 'note' || e.type === 'rest') && e.id === id)) return mi + 1;
    }
    return 0;
  }, []);

  /* —— 解析（300ms 防抖）—— */
  useEffect(() => {
    const timer = setTimeout(() => {
      const r = parse(text);
      setErrors(r.errors);
      setWarnings(r.warnings);
      const base = r.song;
      setSong({ ...base, bpm });
      if (base.bpm !== headerBpmRef.current) {
        headerBpmRef.current = base.bpm;
        setBpm(base.bpm);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, bpm]);

  /* —— 提交一次编辑：立刻重解析，避免对旧坐标二次操作 —— */
  const commit = useCallback((next: string, nextSel?: Set<number>) => {
    const r = parse(next);
    setText(next);
    setErrors(r.errors);
    setWarnings(r.warnings);
    setSong({ ...r.song, bpm });
    if (nextSel) setSelected(nextSel);
  }, [bpm]);

  /* —— 播放 —— */
  const handlePlay = useCallback(() => {
    const s = songRef.current;
    if (!s || !s.timeline.length) return;
    if (engine.state === 'paused') { engine.resume(); return; }
    setCompare('off');
    engine.play(s, { onNote: setActiveId, onState: setEngineState });
  }, [engine]);

  const handlePause = useCallback(() => engine.pause(), [engine]);
  const handleStop = useCallback(() => {
    engine.stop();
    setActiveId(null);
    setCompare('off');
  }, [engine]);

  /* —— A/B 对比试听：A 去掉连音线与力度，B 原样，连着放两遍 —— */
  const handleCompare = useCallback(() => {
    const s = songRef.current;
    if (!s || !s.timeline.length) return;
    engine.stop();
    const plain: Song = {
      ...s,
      timeline: s.timeline.map((e) => ({ ...e, velocity: 0.7, legato: false })),
    };
    setCompare('a');
    engine.play(plain, {
      onNote: setActiveId,
      onState: setEngineState,
      onEnd: () => {
        setCompare('b');
        engine.play(s, {
          onNote: setActiveId,
          onState: setEngineState,
          onEnd: () => setCompare('off'),
        });
      },
    });
  }, [engine]);

  /* —— 速度调节：播放中即时重排 —— */
  const handleBpm = useCallback((v: number) => {
    const nv = Math.max(20, Math.min(240, Number.isFinite(v) ? Math.round(v) : 80));
    const wasPlaying = engine.state === 'playing' || engine.state === 'paused';
    engine.stop();
    setBpm(nv);
    if (wasPlaying) {
      const s = songRef.current;
      if (s) setSong({ ...s, bpm: nv });
      setTimeout(() => {
        const next = songRef.current;
        if (next) engine.play(next, { onNote: setActiveId, onState: setEngineState });
      }, 0);
    }
  }, [engine]);

  const loadExample = useCallback((key: string) => {
    engine.stop();
    setActiveId(null);
    setSelected(new Set());
    setCompare('off');
    const t = EXAMPLES[key] ?? '';
    const r = parse(t);
    headerBpmRef.current = r.song.bpm;
    setText(t);
    setBpm(r.song.bpm);
    setSong({ ...r.song, bpm: r.song.bpm });
    setErrors(r.errors);
    setWarnings(r.warnings);
  }, [engine]);

  const clearAll = useCallback(() => {
    engine.stop();
    setActiveId(null);
    setSelected(new Set());
    setCompare('off');
    setText('');
    setErrors([]);
    setWarnings([]);
    setSong(null);
  }, [engine]);

  /* —— 选中 / 试听 —— */
  const handlePick = useCallback((id: number, additive: boolean) => {
    if (id < 0) { setSelected(new Set()); return; }
    if (additive) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    setSelected(new Set([id]));
    // 单击顺带响一声，所见即所听
    const ev = allNotesRef.current.find((n) => n.id === id);
    if (ev && ev.type === 'note' && ev.midi != null) {
      engine.previewNote(ev.midi, ev.velocity, Math.max(0.28, Math.min(1.2, ev.dur * (60 / bpm))));
    }
  }, [engine, bpm]);

  const handleAddNote = useCallback((afterId: number | null) => {
    const list = allNotesRef.current;
    if (afterId === null) {
      commit(appendNote(text, '1'), new Set([list.length]));
      return;
    }
    const ref = list.find((n) => n.id === afterId);
    if (!ref) return;
    const token = noteToken({ degree: 1, octave: 0, flags: ref.flags, dotted: ref.dotted });
    commit(insertAfter(text, ref, token), new Set([afterId + 1]));
  }, [text, commit]);

  /* —— 属性面板动作 —— */
  const handleAction = useCallback((a: EditAction) => {
    const list = allNotesRef.current;
    const sel = selectedNotesRef.current;
    if (a.kind === 'clearSel') { setSelected(new Set()); return; }
    if (a.kind === 'selectAll') { setSelected(new Set(list.map((n) => n.id))); return; }
    if (sel.length === 0) return;

    switch (a.kind) {
      case 'preview': {
        const evs = sel.map((n) => ({
          midi: n.type === 'rest' ? null : n.midi ?? null,
          dur: n.dur,
          velocity: n.velocity,
          legato: Boolean(n.slurId) && !n.isTieContinue && n.slurPos !== 'end',
        }));
        engine.previewEvents(evs, bpm);
        return;
      }
      case 'degree': commit(setDegree(text, sel, a.value)); return;
      case 'octave': commit(shiftOctave(text, sel, a.delta)); return;
      case 'flags': commit(setFlags(text, sel, a.value)); return;
      case 'dot': commit(toggleDot(text, sel)); return;
      case 'extend': commit(setExtend(text, sel, Math.max(0, (sel[0].extend || 0) + a.delta))); return;
      case 'dyn': commit(setDynamic(text, sel, a.label)); return;
      case 'slur': {
        const range = collectRange(list, selected);
        if (range.length < 2) return;
        commit(applySlur(text, range));
        return;
      }
      case 'unslur': commit(removeSlur(text, list, selected)); return;
      case 'delete': commit(deleteNotes(text, sel), new Set()); return;
      case 'insertBefore': {
        const ref = sel[0];
        const token = noteToken({ degree: 1, octave: 0, flags: ref.flags, dotted: ref.dotted });
        // 新音插在首音之前，会拿到首音的 id，后续音符顺延
        commit(insertBefore(text, ref, token), new Set([ref.id]));
        return;
      }
      case 'insertAfter': {
        const ref = sel[sel.length - 1];
        const token = noteToken({ degree: 1, octave: 0, flags: ref.flags, dotted: ref.dotted });
        commit(insertAfter(text, ref, token), new Set([ref.id + 1]));
        return;
      }
      case 'barline': {
        const ref = sel[sel.length - 1];
        commit(insertAfter(text, ref, '|'));
        return;
      }
      default: return;
    }
  }, [text, commit, engine, bpm, selected]);

  /* —— 菜单动作表（始终取最新）—— */
  const actionsRef = useRef<Record<string, () => void>>({});
  actionsRef.current = {
    twinkle: () => loadExample('twinkle'),
    birthday: () => loadExample('birthday'),
    jasmine: () => loadExample('jasmine'),
    clear: clearAll,
    export: () => { if (window.api) void window.api.saveText(text); },
    play: () => (engine.state === 'playing' ? engine.pause() : handlePlay()),
    stop: handleStop,
    bpmUp: () => handleBpm(bpm + 5),
    bpmDown: () => handleBpm(bpm - 5),
    help: () => setHelpOpen(true),
  };

  /* —— 原生菜单事件 —— */
  useEffect(() => {
    const api = window.api;
    if (!api) return;
    api.onMenu((channel: string) => {
      const key = MENU_MAP[channel];
      if (key && actionsRef.current[key]) actionsRef.current[key]();
    });
  }, []);

  /* —— 快捷键：焦点不在输入框里时，直接改谱 —— */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (helpOpen) return;
      const el = document.activeElement;
      const tag = el ? (el as HTMLElement).tagName : '';
      const typing = tag === 'TEXTAREA' || tag === 'INPUT';

      if (e.key === 'Escape') {
        if (selected.size > 0) { setSelected(new Set()); return; }
        if (!typing) handleStop();
        else setHelpOpen(false);
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); setHelpOpen((v) => !v); return; }
      if (typing || selectedNotesRef.current.length === 0) return;

      const act = (a: EditAction) => { e.preventDefault(); handleAction(a); };

      if (/^[0-7]$/.test(e.key)) { act({ kind: 'degree', value: Number(e.key) }); return; }
      switch (e.key) {
        case 'ArrowUp': act({ kind: 'octave', delta: 1 }); return;
        case 'ArrowDown': act({ kind: 'octave', delta: -1 }); return;
        case '.': act({ kind: 'dot' }); return;
        case '=': case '+': act({ kind: 'extend', delta: 1 }); return;
        case '-': case '_': act({ kind: 'extend', delta: -1 }); return;
        case 'Delete': case 'Backspace': act({ kind: 'delete' }); return;
        case 's': case 'S': {
          e.preventDefault();
          const selNow = selectedNotesRef.current;
          if (selNow.some((n) => n.slurId !== undefined)) handleAction({ kind: 'unslur' });
          else if (selNow.length >= 2) handleAction({ kind: 'slur' });
          return;
        }
        case 'n': case 'N': act({ kind: 'insertAfter' }); return;
        case 'ArrowLeft': case 'ArrowRight': {
          e.preventDefault();
          const list = allNotesRef.current;
          const cur = selectedNotesRef.current[0];
          if (!list.length || !cur) return;
          const idx = list.findIndex((n) => n.id === cur.id);
          const ni = Math.max(0, Math.min(list.length - 1, idx + (e.key === 'ArrowRight' ? 1 : -1)));
          setSelected(new Set([list[ni].id]));
          return;
        }
        default: return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleAction, handleStop, helpOpen, selected.size]);

  /* —— 卸载时释放音频资源 —— */
  useEffect(() => () => engine.dispose(), [engine]);

  const playable = !!song && song.timeline.length > 0;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="logo">♫</span>
          <span className="title">简谱工坊</span>
          <span className="sub">JianPu Studio</span>
        </div>
        <div className="toolbar-actions">
          <span className="tip">点音符即选中并试听 · Shift 点可多选 · 数字键改音高</span>
          <button className="btn ghost" onClick={() => setHelpOpen(true)}>语法与快捷键</button>
        </div>
      </header>

      <main className="layout">
        <Editor
          value={text}
          onChange={setText}
          errors={errors}
          onExample={(k) => loadExample(k)}
          onClear={clearAll}
        />
        <section className="panel score-panel">
          <div className="panel-head"><span className="label">读谱 · 点选编辑</span></div>
          <ScoreView
            song={song}
            activeId={activeId}
            warnings={warnings}
            selected={selected}
            onPick={handlePick}
            onAddNote={handleAddNote}
          />
          <Inspector
            song={song}
            selectedNotes={selectedNotes}
            measureOf={measureOf}
            onAction={handleAction}
          />
          <PlayerBar
            state={engineState}
            bpm={bpm}
            disabled={!playable}
            compare={compare}
            onPlay={handlePlay}
            onPause={handlePause}
            onStop={handleStop}
            onCompare={handleCompare}
            onBpm={handleBpm}
          />
        </section>
      </main>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
