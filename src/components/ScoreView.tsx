import type { MeasureMeta, NoteEvent, ScoreEvent, Song } from '../core/parser';

const repeat = (c: string, n: number) => new Array(Math.max(0, n)).fill(c).join('');
const dots = (n: number) => repeat('●', n);

const DIRECTIVE_LABEL: Record<string, string> = {
  fine: 'Fine',
  dc: 'D.C.',
  ds: 'D.S.',
  segno: '§',
};

const DEGREE_NAME: Record<number, string> = { 1: 'do', 2: 're', 3: 'mi', 4: 'fa', 5: 'sol', 6: 'la', 7: 'si', 0: '休止' };
const DUR_NAME = ['四分音符', '八分音符', '十六分音符'];

function noteTitle(ev: NoteEvent): string {
  if (ev.type === 'rest') return `休止符 · ${DUR_NAME[Math.min(ev.flags, 2)]}`;
  const oct = ev.octave > 0 ? `高 ${ev.octave} 个八度` : ev.octave < 0 ? `低 ${-ev.octave} 个八度` : '';
  return `${DEGREE_NAME[ev.degree] ?? ev.degree}${oct ? ' · ' + oct : ''} · ${DUR_NAME[Math.min(ev.flags, 2)]}`
    + (ev.dotted ? ' · 附点' : '')
    + (ev.extend ? ` · 延长 ${ev.extend} 拍` : '')
    + (ev.slurId !== undefined ? (ev.isTieContinue ? ' · 延音线' : ' · 连音线') : '');
}

interface NoteProps {
  ev: NoteEvent;
  active: boolean;
  selected: boolean;
  onPick: (id: number, additive: boolean) => void;
}

function Note({ ev, active, selected, onPick }: NoteProps) {
  const cls = [
    'note',
    active ? 'active' : '',
    selected ? 'sel' : '',
    ev.isTieContinue ? 'tie-cont' : '',
    ev.slurPos ? 'slur-' + ev.slurPos : '',
  ].filter(Boolean).join(' ');

  return (
    <span
      className={cls}
      data-id={ev.id}
      title={noteTitle(ev)}
      onClick={(e) => { e.stopPropagation(); onPick(ev.id, e.shiftKey || e.ctrlKey || e.metaKey); }}
    >
      <span className="n-top">{ev.octave > 0 ? dots(ev.octave) : ''}</span>
      <span className="n-mid">
        <span className="n-digit">{ev.degree}</span>
        {ev.extend > 0 && <span className="n-extend">{repeat('─', ev.extend)}</span>}
        {ev.dotted && <span className="n-dot">·</span>}
      </span>
      <span className="n-bot">
        {ev.flags > 0 && <span className="n-lines">{repeat('＿', Math.min(ev.flags, 2))}</span>}
        {ev.octave < 0 && <span className="n-low">{dots(-ev.octave)}</span>}
      </span>
      {ev.dynLabel && <span className="n-dyn">{ev.dynLabel}</span>}
    </span>
  );
}

type RenderItem =
  | { kind: 'single'; ev: ScoreEvent }
  | { kind: 'slur'; events: NoteEvent[]; isTie: boolean };

function buildRenderItems(events: ScoreEvent[]): RenderItem[] {
  const items: RenderItem[] = [];
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    if ((ev.type === 'note' || ev.type === 'rest') && ev.slurId !== undefined) {
      const sid = ev.slurId;
      const group: NoteEvent[] = [];
      let j = i;
      while (j < events.length) {
        const e2 = events[j];
        if ((e2.type === 'note' || e2.type === 'rest') && e2.slurId === sid) {
          group.push(e2);
          j++;
        } else break;
      }
      const isTie = group.some((n) => n.isTieContinue);
      items.push({ kind: 'slur', events: group, isTie });
      i = j;
      continue;
    }
    items.push({ kind: 'single', ev });
    i++;
  }
  return items;
}

function ClosingBar({ mm }: { mm?: MeasureMeta }) {
  const repEnd = !!mm && mm.repeatEnd;
  const final = !!mm && mm.final;
  const cls = ['bar', repEnd ? 'repeat' : '', final ? 'final' : ''].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {repEnd && <span className="rep-dots">:</span>}
      {final ? '‖' : '|'}
    </span>
  );
}

function OpeningRepeatBar() {
  return (
    <span className="bar repeat">
      |<span className="rep-dots">:</span>
    </span>
  );
}

interface ScoreViewProps {
  song: Song | null;
  activeId: number | null;
  warnings: string[];
  selected: Set<number>;
  onPick: (id: number, additive: boolean) => void;
  onAddNote: (afterId: number | null) => void;
}

export default function ScoreView({ song, activeId, warnings, selected, onPick, onAddNote }: ScoreViewProps) {
  if (!song) {
    return (
      <div className="score-wrap">
        <div className="empty">
          暂无谱面 —— 在左侧输入简谱，或载入一个示例
        </div>
      </div>
    );
  }

  const lastNoteId = (evs: ScoreEvent[]): number | null => {
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (e.type === 'note' || e.type === 'rest') return e.id;
    }
    return null;
  };

  return (
    <div className="score-wrap">
      <div className="score-info">
        1={song.keyRaw}　{song.timeSig.num}/{song.timeSig.den}　♩={song.bpm}
        <span className="meta">
          　{song.noteCount} 音 · {song.totalBeats} 拍{song.hasRepeat ? ` · 含反复共 ${song.playCount} 次发声` : ''}
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="warnings">
          <div className="w-title">小节拍数提醒（{warnings.length}）</div>
          {warnings.slice(0, 10).map((w, i) => <div className="w-item" key={i}>{w}</div>)}
          {warnings.length > 10 && <div className="w-item more">…另有 {warnings.length - 10} 处</div>}
        </div>
      )}

      <div className="score" onClick={() => onPick(-1, false)}>
        {song.measures.map((measure, mi) => {
          const mm = song.measureMeta[mi];
          const bad = !!mm && mm.beats > 0 && Math.abs(mm.beats - mm.expected) > 1e-6;
          const title = `第 ${mi + 1} 小节：${mm ? mm.beats : 0} 拍${bad ? `（应为 ${mm.expected} 拍）` : ''}`;
          const items = buildRenderItems(measure);
          const tailId = lastNoteId(measure);
          return (
            <span className={bad ? 'measure bad' : 'measure'} key={mi} title={title}>
              {mm && mm.repeatStart && <OpeningRepeatBar />}
              {items.map((item, ii) => {
                if (item.kind === 'single') {
                  const ev = item.ev;
                  if (ev.type === 'bar') return <ClosingBar mm={mm} key={ii} />;
                  if (ev.type === 'directive') {
                    return <span className="directive" key={ii}>{DIRECTIVE_LABEL[ev.kind] ?? ev.text}</span>;
                  }
                  return <Note ev={ev} active={activeId === ev.id} selected={selected.has(ev.id)} onPick={onPick} key={ii} />;
                }
                return (
                  <span className={item.isTie ? 'slur tie' : 'slur'} key={ii}>
                    <span className="slur-arc" />
                    {item.events.map((evt) => (
                      <Note ev={evt} active={activeId === evt.id} selected={selected.has(evt.id)} onPick={onPick} key={evt.id} />
                    ))}
                  </span>
                );
              })}
              <span
                className="add-slot"
                title="在这个小节末尾加一个音符"
                onClick={(e) => { e.stopPropagation(); onAddNote(tailId); }}
              >+</span>
              <ClosingBar mm={mm} />
            </span>
          );
        })}
        <span
          className="add-slot big"
          title="在曲子末尾加一个音符"
          onClick={(e) => { e.stopPropagation(); onAddNote(null); }}
        >+</span>
      </div>
    </div>
  );
}
