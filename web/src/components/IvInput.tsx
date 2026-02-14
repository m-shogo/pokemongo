import type { IvInput as IvInputType } from '../lib/types';
import { DUST_TO_LEVEL } from '../data/cpm';

interface Props {
  value: IvInputType;
  onChange: (v: IvInputType) => void;
  onCalculate: () => void;
  canCalculate: boolean;
}

const dustOptions = DUST_TO_LEVEL.map((d) => d.dust);

/** 入手方法プリセット */
const CATCH_SOURCES = [
  { label: 'レイド', icon: '!', dust: 2500, minIv: 10 },
  { label: 'タマゴ', icon: '?', dust: null, minIv: 10 },
  { label: 'リサーチ', icon: '*', dust: 1000, minIv: 10 },
  { label: '野生', icon: '~', dust: null, minIv: 0 },
] as const;

/** チームリーダー評価 (星) */
const APPRAISALS = [
  { stars: 0, label: '0', min: 0, max: 22 },
  { stars: 1, label: '1', min: 23, max: 29 },
  { stars: 2, label: '2', min: 30, max: 36 },
  { stars: 3, label: '3', min: 37, max: 44 },
  { stars: 4, label: '4', min: 45, max: 45 },
] as const;

export function IvInput({ value, onChange, onCalculate, canCalculate }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

  const handleSource = (source: typeof CATCH_SOURCES[number]) => {
    set({
      dust: source.dust ?? value.dust,
      lucky: false,
      purified: false,
    });
  };

  const handleAppraisal = (appraisal: typeof APPRAISALS[number]) => {
    if (appraisal.stars === 4) {
      set({ atk: 15, def: 15, sta: 15 });
    } else if (appraisal.stars === 0) {
      set({ atk: null, def: null, sta: null });
    }
  };

  const ivTotal = (value.atk ?? 0) + (value.def ?? 0) + (value.sta ?? 0);
  const currentStars = value.atk === 15 && value.def === 15 && value.sta === 15 ? 4
    : ivTotal >= 37 ? 3
    : ivTotal >= 30 ? 2
    : ivTotal >= 23 ? 1 : 0;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* 入手方法 */}
      <div>
        <div className="section-label">HOW YOU GOT IT</div>
        <div className="source-grid">
          {CATCH_SOURCES.map((s) => (
            <button
              key={s.label}
              className="source-btn"
              onClick={() => handleSource(s)}
            >
              <span className="source-icon">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* CP / HP / すな */}
      <div>
        <div className="section-label">STATUS</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <input
              type="number"
              inputMode="numeric"
              className="field-input"
              placeholder="CP"
              value={value.cp ?? ''}
              onChange={(e) => set({ cp: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <input
              type="number"
              inputMode="numeric"
              className="field-input"
              placeholder="HP"
              value={value.hp ?? ''}
              onChange={(e) => set({ hp: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <select
              className="field-input"
              value={value.dust ?? ''}
              onChange={(e) => set({ dust: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">すな</option>
              {dustOptions.map((d) => (
                <option key={d} value={d}>{d.toLocaleString()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* チームリーダー評価 */}
      <div>
        <div className="section-label">APPRAISAL</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {APPRAISALS.map((a) => (
            <button
              key={a.stars}
              className={`chip${currentStars === a.stars ? ' active' : ''}`}
              onClick={() => handleAppraisal(a)}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {a.stars === 0 ? '-' : Array.from({ length: a.stars }, () => '*').join('')}
            </button>
          ))}
        </div>

        {/* IV スライダー */}
        <div style={{ display: 'flex', gap: 12 }}>
          <IvSlider label="ATK" value={value.atk} onChange={(v) => set({ atk: v })} />
          <IvSlider label="DEF" value={value.def} onChange={(v) => set({ def: v })} />
          <IvSlider label="HP" value={value.sta} onChange={(v) => set({ sta: v })} />
        </div>
      </div>

      {/* オプション */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={`chip${value.lucky ? ' active' : ''}`}
          onClick={() => set({ lucky: !value.lucky })}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          キラ
        </button>
        <button
          className={`chip${value.purified ? ' active' : ''}`}
          onClick={() => set({ purified: !value.purified })}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          リトレーン
        </button>
        <button
          className={`chip${false ? ' active' : ''}`}
          onClick={() => set({ lucky: false, purified: false })}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          シャドウ
        </button>
      </div>

      {/* 計算ボタン */}
      <button
        className="btn-primary"
        onClick={onCalculate}
        disabled={!canCalculate}
      >
        チェックする
      </button>
    </div>
  );
}

function IvSlider({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  const color = value === null ? 'var(--text-dim)'
    : value === 15 ? 'var(--iv-perfect)'
    : value >= 13 ? 'var(--iv-high)'
    : value >= 8 ? 'var(--iv-mid)'
    : 'var(--iv-low)';

  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: '1.4rem',
        fontWeight: 700,
        color,
        margin: '2px 0 6px',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value ?? '-'}
      </div>
      <input
        type="range"
        min={0}
        max={15}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        onClick={() => onChange(null)}
        style={{
          marginTop: 4,
          fontSize: '0.65rem',
          background: 'none',
          border: 'none',
          color: 'var(--text-dim)',
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 2,
        }}
      >
        不明
      </button>
    </div>
  );
}
