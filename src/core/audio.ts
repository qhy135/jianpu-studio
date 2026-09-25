/* ============================================================
 * 音频引擎（TypeScript）
 * Web Audio 合成：双振荡器 + ADSR 包络，lookahead 调度，支持暂停/续播
 * ============================================================ */
import { freqFromMidi, type Song } from './parser';

export type EngineState = 'idle' | 'playing' | 'paused';

interface ScheduledEvent {
  sourceId: number;   // 对应源音符 id（渲染高亮用）
  start: number;      // 秒
  dur: number;        // 秒
  midi: number | null;
  velocity: number;   // 力度 0–1
  legato: boolean;    // 连奏（圆滑线内）→ 延长并叠入下一音；否则断奏，留出缝隙
}

export interface PlayOptions {
  onNote?: (id: number | null) => void;
  onState?: (state: EngineState) => void;
  onEnd?: () => void;   // 自然播完（非手动停止）时回调，用于 A/B 对比连播
}

const TICK_MS = 40;
const LOOKAHEAD = 0.25;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private events: ScheduledEvent[] = [];
  private nextIndex = 0;
  private startTime = 0;
  private pausePosition = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeNodes: Array<{ o1: OscillatorNode; o2: OscillatorNode }> = [];
  private onNote: ((id: number | null) => void) | null = null;
  private onState: ((s: EngineState) => void) | null = null;
  private onEnd: (() => void) | null = null;

  state: EngineState = 'idle';

  private ensureCtx(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('当前环境不支持 Web Audio');
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private setState(s: EngineState): void {
    this.state = s;
    if (this.onState) this.onState(s);
  }

  private buildEvents(song: Pick<Song, 'timeline' | 'bpm'>): ScheduledEvent[] {
    const spb = 60 / song.bpm;
    return song.timeline.map((e) => ({
      sourceId: e.sourceId,
      start: e.start * spb,
      dur: e.dur * spb,
      midi: e.midi,
      velocity: typeof e.velocity === 'number' ? e.velocity : 0.7,
      legato: Boolean(e.legato),
    }));
  }

  play(song: Pick<Song, 'timeline' | 'bpm'>, opts: PlayOptions = {}): void {
    this.onNote = opts.onNote ?? null;
    this.onState = opts.onState ?? null;
    this.onEnd = opts.onEnd ?? null;
    this.ensureCtx();
    this.stopNodes(true);
    this.events = this.buildEvents(song);
    this.nextIndex = 0;
    this.pausePosition = 0;
    this.startTime = (this.ctx as AudioContext).currentTime + 0.12;
    this.setState('playing');
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD;

    // 调度窗口内的音符
    while (this.nextIndex < this.events.length) {
      const e = this.events[this.nextIndex];
      const absStart = this.startTime + e.start;
      if (absStart > horizon) break;
      if (e.midi != null) this.schedule(e.midi, absStart, e.dur, e.velocity, e.legato);
      this.nextIndex++;
    }

    // 高亮当前音符（用源 id，保证反复段落能对应到同一组 DOM 节点）
    let active: number | null = null;
    for (const ev of this.events) {
      const as = this.startTime + ev.start;
      if (as > now) break;
      if (now < as + ev.dur) { active = ev.sourceId; break; }
    }
    if (this.onNote) this.onNote(active);

    // 结束判定
    if (this.nextIndex >= this.events.length) {
      const last = this.events[this.events.length - 1];
      const lastEnd = last ? this.startTime + last.start + last.dur : this.startTime;
      if (now >= lastEnd + 0.05) {
        const cb = this.onEnd;
        this.onEnd = null;
        this.stopNodes(true);
        this.setState('idle');
        if (cb) cb();
      }
    }
  }

  /**
   * 发音。legato 与否在包络上做实质区分，用户能直接听出圆滑线的效果：
   *  - 连奏：起音柔和(28ms)、延音保持 88%、尾音拖长并「叠入」下一个音，音符之间没有缝隙
   *  - 断奏：起音干脆(12ms)、只发到时值的 86%、快速收尾(70ms)，音符之间有明显呼吸口
   */
  private schedule(midi: number, t0: number, dur: number, velocity: number, legato: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const vel = Math.max(0.05, Math.min(1, velocity));
    const gain = ctx.createGain();
    const o1 = ctx.createOscillator();
    o1.type = legato ? 'sine' : 'triangle'; // 连奏音色更圆润，断奏带棱角
    o1.frequency.value = freqFromMidi(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freqFromMidi(midi) * 2;
    const g2 = ctx.createGain();
    g2.gain.value = legato ? 0.26 : 0.18;

    o1.connect(gain);
    o2.connect(g2);
    g2.connect(gain);
    gain.connect(this.master);

    const a = legato ? 0.028 : 0.012;               // 起音时间
    const rel = legato ? 0.16 : 0.07;               // 收尾时间
    const susLevel = legato ? 0.88 : 0.6;           // 延音电平（连奏保持得更满）
    // 连奏稍微越过本音末尾，与下一音重叠；断奏缩短，留出缝隙
    const overlap = legato ? Math.min(0.14, dur * 0.3) : 0;
    const soundDur = legato ? dur + overlap : Math.max(0.05, dur * 0.86);
    const sus = Math.max(a + 0.01, soundDur * 0.45);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vel, t0 + a);
    gain.gain.exponentialRampToValueAtTime(vel * susLevel, t0 + sus);
    gain.gain.setValueAtTime(vel * susLevel, t0 + soundDur);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + soundDur + rel);
    o1.start(t0); o2.start(t0);
    o1.stop(t0 + soundDur + rel + 0.05);
    o2.stop(t0 + soundDur + rel + 0.05);

    this.activeNodes.push({ o1, o2 });
  }

  /** 单音试听：点谱面上的音符时立刻响一声 */
  previewNote(midi: number, velocity = 0.75, durSec = 0.55): void {
    this.ensureCtx();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.02;
    const finalMidi = midi;
    this.schedule(finalMidi, t0, Math.max(0.12, durSec), velocity, false);
  }

  /** 试听一小段：把选中的音符连起来放一遍，用来确认连音线/力度效果 */
  previewEvents(events: Array<{ midi: number | null; dur: number; velocity: number; legato: boolean }>, bpm: number): void {
    this.ensureCtx();
    if (!this.ctx) return;
    const spb = 60 / Math.max(20, bpm);
    const t0 = this.ctx.currentTime + 0.05;
    let acc = 0;
    for (const e of events) {
      if (e.midi != null) this.schedule(e.midi, t0 + acc, e.dur * spb, e.velocity, e.legato);
      acc += e.dur * spb;
    }
  }

  private stopNodes(_silent: boolean): void {
    this.onEnd = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    for (const n of this.activeNodes) {
      try { n.o1.stop(); } catch { /* 已停止 */ }
      try { n.o2.stop(); } catch { /* 已停止 */ }
    }
    this.activeNodes = [];
    if (this.onNote) this.onNote(null);
  }

  pause(): void {
    if (this.state !== 'playing' || !this.ctx) return;
    const elapsed = this.ctx.currentTime - this.startTime;
    this.pausePosition = Math.max(0, elapsed);
    let idx = -1;
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i].start + this.events[i].dur > this.pausePosition - 0.001) { idx = i; break; }
    }
    this.nextIndex = idx < 0 ? this.events.length : idx;
    this.stopNodes(true);
    this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.ensureCtx();
    this.startTime = (this.ctx as AudioContext).currentTime + 0.08 - this.pausePosition;
    this.setState('playing');
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.stopNodes(true);
    this.setState('idle');
  }

  dispose(): void {
    this.stopNodes(true);
    if (this.ctx) { void this.ctx.close(); this.ctx = null; }
  }
}
