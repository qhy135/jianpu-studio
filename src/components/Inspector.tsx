import type { ReactNode } from 'react';
import type { NoteEvent, Song } from '../core/parser';

export type EditAction =
  | { kind: 'degree'; value: number }
  | { kind: 'octave'; delta: number }
  | { kind: 'flags'; value: number }
  | { kind: 'dot' }
  | { kind: 'extend'; delta: number }
  | { kind: 'dyn'; label: string }
  | { kind: 'slur' }
  | { kind: 'unslur' }
  | { kind: 'delete' }
  | { kind: 'insertBefore' }
  | { kind: 'insertAfter' }
  | { kind: 'barline' }
  | { kind: 'selectAll' }
  | { kind: 'clearSel' }
  | { kind: 'preview' };

interface RowProps {
  label: string;
  children: ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <div className="ins-row">
      <span className="ins-label">{label}</span>
      <div className="ins-btns">{children}</div>
    </div>
  );
}

const DYN_OPTIONS: Array<{ label: string; text: string }> = [
  { label: '', text: '无' },
  { label: 'p', text: 'p 弱' },
  { label: 'mp', text: 'mp' },
  { label: 'mf', text: 'mf' },
  { label: 'f', text: 'f 强' },
  { label: 'ff', text: 'ff' },
  { label: '<', text: '< 渐强' },
  { label: '>', text: '> 渐弱' },
];

interface InspectorProps {
  song: Song | null;
  selectedNotes: NoteEvent[];
  measureOf: (id: number) => number;   // 音符 id → 第几小节（1 起）
  onAction: (a: EditAction) => void;
}

export default function Inspector({ song, selectedNotes, measureOf, onAction }: InspectorProps) {
  const n = selectedNotes.length;
  const empty = n === 0;

  const first = selectedNotes[0];
  const inSlur = selectedNotes.some((x) => x.slurId !== undefined);
  const isTie = selectedNotes.length > 1 && selectedNotes.every((x) => x.degree === first.degree && x.octave === first.octave);

  const where = empty
    ? ''
    : n === 1
      ? `第 ${measureOf(first.id)} 小节 · ${first.type === 'rest' ? '休止符' : '音符 ' + first.degree}`
      : `${n} 个音（第 ${measureOf(selectedNotes[0].id)}–${measureOf(selectedNotes[n - 1].id)} 小节）`;

  const dis = (cond: boolean) => (cond ? ' ins-btn' : ' ins-btn disabled');

  return (
    <div className={empty ? 'inspector empty' : 'inspector'}>
      <div className="ins-head">
        <span className="ins-title">{empty ? '未选中音符' : `已选中 ${n} 个音`}</span>
        <span className="ins-where">{empty ? '点击谱面上的音符即可编辑，Shift + 点击可多选' : where}</span>
        {!empty && (
          <div className="ins-head-actions">
            {n >= 2 && (
              <button className="btn sm primary" onClick={() => onAction({ kind: 'slur' })}>
                {isTie ? '连成延音线' : '加连音线'}
              </button>
            )}
            {inSlur && (
              <button className="btn sm" onClick={() => onAction({ kind: 'unslur' })}>取消连音线</button>
            )}
            <button className="btn sm ghost" onClick={() => onAction({ kind: 'preview' })}>试听所选</button>
            <button className="btn sm ghost" onClick={() => onAction({ kind: 'clearSel' })}>取消选择</button>
          </div>
        )}
        {empty && song && song.noteCount > 0 && (
          <div className="ins-head-actions">
            <button className="btn sm" onClick={() => onAction({ kind: 'selectAll' })}>全选所有音符</button>
          </div>
        )}
      </div>

      {!empty && (
        <div className="ins-body">
          <Row label="音高">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button key={d} className={dis(false)} onClick={() => onAction({ kind: 'degree', value: d })}>{d}</button>
            ))}
            <button className={dis(false)} onClick={() => onAction({ kind: 'degree', value: 0 })}>0 休止</button>
            <span className="ins-sep" />
            <button className={dis(false)} onClick={() => onAction({ kind: 'octave', delta: 1 })} title="升高八度">↑八度</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'octave', delta: -1 })} title="降低八度">↓八度</button>
          </Row>

          <Row label="时值">
            <button className={dis(false)} onClick={() => onAction({ kind: 'flags', value: 0 })}>四分</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'flags', value: 1 })}>八分</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'flags', value: 2 })}>十六分</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'dot' })}>附点 ·</button>
            <span className="ins-sep" />
            <button className={dis(false)} onClick={() => onAction({ kind: 'extend', delta: 1 })} title="加一拍延长">延长 +</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'extend', delta: -1 })} title="减一拍延长">延长 −</button>
          </Row>

          <Row label="力度">
            {DYN_OPTIONS.map((o) => (
              <button
                key={o.label || 'none'}
                className={dis(false)}
                onClick={() => onAction({ kind: 'dyn', label: o.label })}
              >{o.text}</button>
            ))}
          </Row>

          <Row label="编辑">
            <button className={dis(false)} onClick={() => onAction({ kind: 'insertBefore' })}>前面插音</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'insertAfter' })}>后面插音</button>
            <button className={dis(false)} onClick={() => onAction({ kind: 'barline' })}>后加小节线</button>
            <button className="ins-btn danger" onClick={() => onAction({ kind: 'delete' })}>删除所选</button>
          </Row>
        </div>
      )}
    </div>
  );
}
