import { useRef } from 'react';
import type { ParseError } from '../core/parser';

export type ExampleKey = 'twinkle' | 'birthday' | 'jasmine' | 'demo';

interface EditorProps {
  value: string;
  onChange: (v: string) => void;
  errors: ParseError[];
  onExample: (key: ExampleKey) => void;
  onClear: () => void;
}

const EXAMPLE_LABELS: Array<{ key: ExampleKey; label: string }> = [
  { key: 'twinkle', label: '小星星' },
  { key: 'birthday', label: '生日快乐' },
  { key: 'jasmine', label: '茉莉花' },
  { key: 'demo', label: '功能演示' },
];

interface Pad { text: string; label: string; title?: string; tight?: boolean }

/** 快捷输入条：点了就往光标处插，不必背语法 */
const PALETTE: Array<{ name: string; items: Pad[] }> = [
  {
    name: '音高',
    items: [
      { text: '1', label: '1' }, { text: '2', label: '2' }, { text: '3', label: '3' },
      { text: '4', label: '4' }, { text: '5', label: '5' }, { text: '6', label: '6' }, { text: '7', label: '7' },
      { text: '0', label: '0', title: '休止符' },
    ],
  },
  {
    name: '八度',
    items: [
      { text: '\'', label: '′ 高八度', title: '写在数字右上角', tight: true },
      { text: ',', label: '‚ 低八度', title: '写在数字右下角', tight: true },
    ],
  },
  {
    name: '时值',
    items: [
      { text: '_', label: '八分 ＿', title: '数字下方一条线', tight: true },
      { text: '__', label: '十六分 ＿＿', title: '数字下方两条线', tight: true },
      { text: '.', label: '附点 ·', title: '延长一半', tight: true },
      { text: '-', label: '— 延长', title: '每加一条延长一拍' },
    ],
  },
  {
    name: '力度',
    items: [
      { text: 'p', label: 'p 弱' }, { text: 'mp', label: 'mp' }, { text: 'mf', label: 'mf' },
      { text: 'f', label: 'f 强' }, { text: 'ff', label: 'ff' },
      { text: '<', label: '< 渐强' }, { text: '>', label: '> 渐弱' },
    ],
  },
  {
    name: '连音线',
    items: [
      { text: '(', label: '( 开始' },
      { text: ')', label: ') 结束' },
    ],
  },
  {
    name: '小节 / 反复',
    items: [
      { text: '|', label: '| 小节线' },
      { text: '|:', label: '|: 反复起' },
      { text: ':|', label: ':| 反复止' },
      { text: '||', label: '|| 终止线' },
      { text: 'Fine', label: 'Fine' },
      { text: 'D.C.', label: 'D.C.' },
    ],
  },
];

export default function Editor({ value, onChange, errors, onExample, onClear }: EditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const caretRef = useRef<number | null>(null);

  const insert = (p: Pad) => {
    const start = caretRef.current ?? value.length;
    const chunk = p.tight ? p.text : (start > 0 && !/\s/.test(value[start - 1] || '') ? ' ' : '') + p.text + ' ';
    const next = value.slice(0, start) + chunk + value.slice(start);
    caretRef.current = start + chunk.length;
    onChange(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) { el.focus(); el.setSelectionRange(caretRef.current ?? 0, caretRef.current ?? 0); }
    });
  };

  const syncCaret = () => {
    const ta = taRef.current;
    if (ta) caretRef.current = ta.selectionStart;
  };

  return (
    <section className="panel editor-panel">
      <div className="panel-head">
        <span className="label">写谱</span>
        <div className="example-group">
          <span className="label dim">示例：</span>
          {EXAMPLE_LABELS.map((e) => (
            <button className="btn sm" key={e.key} onClick={() => onExample(e.key)}>
              {e.label}
            </button>
          ))}
          <button className="btn sm ghost" onClick={onClear}>清空</button>
        </div>
      </div>

      <div className="palette">
        {PALETTE.map((grp) => (
          <div className="pal-group" key={grp.name}>
            <span className="pal-name">{grp.name}</span>
            {grp.items.map((it) => (
              <button
                className="pal-btn"
                key={it.text + it.label}
                title={it.title || it.text}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(it)}
              >{it.label}</button>
            ))}
          </div>
        ))}
      </div>

      <textarea
        ref={taRef}
        className="editor"
        spellCheck={false}
        value={value}
        onSelect={syncCaret}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onChange={(e) => {
          caretRef.current = e.target.selectionStart;
          onChange(e.target.value);
        }}
        placeholder={'在这里输入简谱，例如：\n1=C 4/4 100bpm\n1 1 5 5 6 6 5 - | 4 4 3 3 2 2 1 - ||'}
      />

      {errors.length > 0 && (
        <div className="errors">
          {errors.slice(0, 8).map((err, i) => (
            <div className="err" key={i}>
              第 {err.line} 行{err.col ? ` 第 ${err.col} 列` : ''}：「{err.raw}」 {err.msg}
            </div>
          ))}
          {errors.length > 8 && <div className="err more">…另有 {errors.length - 8} 处问题</div>}
        </div>
      )}

      <div className="hint">
        也可以直接点谱面上的音符来改音高 / 时值 / 力度 / 连音线，不必手敲语法。<br />
        % 开头为注释 · 头部可写 1=G、3/4、96bpm
      </div>
    </section>
  );
}
