interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>简谱语法说明</span>
          <button className="btn sm ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="modal-body">
          <h4>推荐用法：直接在谱面上点着改（不必背语法）</h4>
          <table className="syntax">
            <tbody>
              <tr><td>点一下音符</td><td>选中它，同时响一声；下方出现属性面板</td></tr>
              <tr><td>Shift + 点</td><td>多选（可跨小节），用来连成一整条连音线</td></tr>
              <tr><td>属性面板</td><td>改音高、八度、时值、附点、延长、力度；加 / 取消连音线；前面插音、后面插音、删除、试听所选</td></tr>
              <tr><td>小节末尾的 <code>+</code></td><td>在该小节末尾加一个音符（沿用前一个音的时值）</td></tr>
              <tr><td>左侧快捷输入条</td><td>不会语法也能写谱：点了就往光标处插</td></tr>
            </tbody>
          </table>

          <h4>选中音符后的快捷键</h4>
          <table className="syntax">
            <tbody>
              <tr><td><code>1</code>–<code>7</code> / <code>0</code></td><td>改音高 / 改休止符</td></tr>
              <tr><td><code>↑</code> <code>↓</code></td><td>升 / 降八度</td></tr>
              <tr><td><code>.</code></td><td>附点开关</td></tr>
              <tr><td><code>-</code> / <code>=</code></td><td>延长减一拍 / 加一拍</td></tr>
              <tr><td><code>←</code> <code>→</code></td><td>移到上一个 / 下一个音</td></tr>
              <tr><td><code>S</code></td><td>连音线开关（多选后按即为加连音线）</td></tr>
              <tr><td><code>N</code></td><td>在所选之后插入一个音</td></tr>
              <tr><td><code>Delete</code></td><td>删除所选</td></tr>
              <tr><td><code>Esc</code></td><td>取消选择（无选中时停止播放）</td></tr>
            </tbody>
          </table>
          <p className="note-text">光标在文本框里时，以上快捷键不生效 —— 那时敲的是谱面内容。</p>

          <h4>怎么听出圆滑线的效果</h4>
          <p className="note-text">
            点播放器上的 <b>A/B 对比试听</b>：连着放两遍，第一遍去掉所有连音线与力度（每个音断开、音量一致），
            第二遍按谱面原样播放。圆滑线内的音会用连奏发音 —— 起音柔和、延音饱满、音符之间不留缝隙，
            与断奏的干脆收尾差别明显。
          </p>

          <h4>语法速查（手写时用）</h4>
          <table className="syntax">
            <thead>
              <tr><th>符号</th><th>含义</th><th>示例</th></tr>
            </thead>
            <tbody>
              <tr><td><code>1 2 3 4 5 6 7</code></td><td>七个基本音级，默认四分音符（1 拍）</td><td><code>1 2 3</code></td></tr>
              <tr><td><code>0</code></td><td>休止符，同样支持时值与八度记号</td><td><code>0 0_</code></td></tr>
              <tr><td><code>'</code> / <code>,</code></td><td>后缀，升 / 降八度（可叠加），对应数字上/下方小圆点</td><td><code>1'</code> <code>6,</code> <code>5''</code></td></tr>
              <tr><td><code>_</code> / <code>__</code></td><td>后缀，八分 / 十六分音符（数字下方 1 / 2 条下划线）</td><td><code>5_</code> <code>1__</code></td></tr>
              <tr><td><code>-</code></td><td>增时线（独立记号），把前一音符延长一拍</td><td><code>5 - -</code></td></tr>
              <tr><td><code>.</code></td><td>附点（后缀），使基础时值 ×1.5</td><td><code>1.</code> <code>5_.</code></td></tr>
              <tr><td><code>|</code> / <code>||</code></td><td>小节线 / 终止线（双竖线）</td><td><code>1 2 3 |</code></td></tr>
              <tr><td><code>%</code></td><td>注释，本行其后的内容被忽略</td><td><code>% 备注</code></td></tr>
            </tbody>
          </table>

          <h4>连音线与延音线</h4>
          <table className="syntax">
            <tbody>
              <tr>
                <td><code>( )</code> 包住不同音高的音</td>
                <td><b>圆滑线（连音线）</b>：演唱/演奏连贯，乐谱上方画弧线，各音仍分别发声</td>
              </tr>
              <tr>
                <td><code>( )</code> 包住相同音高的音</td>
                <td><b>延音线</b>：自动合并为一个长音，弧线更粗，只发声一次</td>
              </tr>
            </tbody>
          </table>
          <p className="note-text">
            示例：<code>(1 2 3)</code> 是圆滑线；<code>(1 1)</code> 是延音线（合并为 2 拍）。
            <b>可以跨小节</b>：<code>(3 4 | 5 6)</code> 会把弧线一直画过小节线。
          </p>

          <h4>力度记号</h4>
          <table className="syntax">
            <tbody>
              <tr><td><code>ppp pp p mp mf f ff fff</code></td><td>阶梯力度，从该处起生效，显示在音符下方</td></tr>
              <tr><td><code>&lt;</code> / <code>cresc</code>（或 <code>cresc.</code>）</td><td>渐强：到下一个力度记号之间线性渐强</td></tr>
              <tr><td><code>&gt;</code> / <code>dim</code>（或 <code>dim.</code>）</td><td>渐弱：到下一个力度记号之间线性渐弱</td></tr>
            </tbody>
          </table>
          <p className="note-text">示例：<code>mf 1 2 &lt; 3 4 f 5 6</code> —— 1、2 为中强，3、4 渐强，5、6 为强。</p>

          <h4>反复记号</h4>
          <table className="syntax">
            <tbody>
              <tr><td><code>|:</code> … <code>:|</code></td><td>反复记号：两者之间整段<b>演奏两遍</b></td></tr>
              <tr><td><code>Fine</code></td><td>到此结束（放在反复段内可避免回头）</td></tr>
              <tr><td><code>D.C.</code></td><td>从头反复（Da Capo）</td></tr>
              <tr><td><code>D.S.</code> / <code>§</code></td><td>从记号处反复（<code>§</code> 标记反复起点）</td></tr>
            </tbody>
          </table>
          <p className="note-text">示例：<code>|: mf 1 2 3 4 | (5 6 5 4) :|</code> 两小节各奏两遍。</p>

          <h4>小节拍数校验</h4>
          <p className="note-text">
            按拍号核对每小节时值（如 4/4 每小节应为 4 拍、3/4 为 3 拍、6/8 为 3 拍）。
            不吻合的小节会在下方标出橙色虚线并列出提醒，鼠标悬停可见该小节实际拍数。
          </p>

          <h4>头部设置（可省略，放在曲谱最前面）</h4>
          <table className="syntax">
            <tbody>
              <tr><td><code>1=C</code>（<code>1=G</code> <code>1=bB</code> <code>1=#F</code>…）</td><td>调号，默认 1=C</td></tr>
              <tr><td><code>4/4</code>（<code>3/4</code> <code>2/4</code> <code>6/8</code>）</td><td>拍号，默认 4/4</td></tr>
              <tr><td><code>100bpm</code>（<code>♩=100</code> <code>速度=100</code>）</td><td>速度，默认 80</td></tr>
            </tbody>
          </table>

          <p className="note-text">音符之间用空格分隔即可（也支持 <code>5-</code> 这样连着写）。</p>
          <p className="note-text">全局快捷键：<code>F1</code> 打开本说明 · <code>Esc</code> 停止播放 / 取消选择 · <code>Ctrl+S</code> 导出谱面。</p>
          <p className="note-text dim">当前版本暂不支持：跳房子（1. 2. 结尾）、歌词、多声部。</p>
        </div>
      </div>
    </div>
  );
}
