import type { EngineState } from '../core/audio';

export type ComparePhase = 'off' | 'a' | 'b';

interface PlayerBarProps {
  state: EngineState;
  bpm: number;
  disabled: boolean;
  compare: ComparePhase;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onCompare: () => void;
  onBpm: (v: number) => void;
}

const COMPARE_TEXT: Record<ComparePhase, string> = {
  off: 'A/B 对比试听',
  a: '正在播 A：无效果',
  b: '正在播 B：有效果',
};

export default function PlayerBar({
  state, bpm, disabled, compare, onPlay, onPause, onStop, onCompare, onBpm,
}: PlayerBarProps) {
  const playing = state === 'playing';
  const paused = state === 'paused';
  const busy = playing || paused;

  return (
    <div className="controls">
      <button className="btn primary" onClick={onPlay} disabled={disabled || playing}>
        {paused ? '▶ 继续' : '▶ 播放'}
      </button>
      <button className="btn" onClick={onPause} disabled={!playing}>⏸ 暂停</button>
      <button className="btn" onClick={onStop} disabled={!busy}>⏹ 停止</button>

      <button
        className={compare === 'off' ? 'btn compare' : 'btn compare on'}
        onClick={onCompare}
        disabled={disabled}
        title="连播两遍：第一遍去掉所有连音线与力度，第二遍原样播放 —— 直接听出差别"
      >
        {COMPARE_TEXT[compare]}
      </button>

      <span className="bpm-box">
        <label htmlFor="bpm">速度</label>
        <button className="btn sm" title="减速 5" onClick={() => onBpm(bpm - 5)}>−</button>
        <input
          id="bpm"
          type="number"
          min={20}
          max={240}
          value={bpm}
          onChange={(e) => onBpm(parseInt(e.target.value, 10))}
        />
        <button className="btn sm" title="加速 5" onClick={() => onBpm(bpm + 5)}>+</button>
        <span className="unit">bpm</span>
      </span>

      <span className="state-tag">{playing ? '演奏中' : paused ? '已暂停' : '就绪'}</span>
    </div>
  );
}
