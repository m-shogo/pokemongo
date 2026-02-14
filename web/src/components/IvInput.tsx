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
  { key: 'raid',     label: 'レイド',     icon: '\u2694\uFE0F', dust: 2500, minIv: 10 },
  { key: 'egg',      label: 'タマゴ',     icon: '\uD83E\uDD5A', dust: null,  minIv: 10 },
  { key: 'research', label: 'リサーチ',   icon: '\uD83D\uDCDD', dust: 1000, minIv: 10 },
  { key: 'wild',     label: '野生',       icon: '\uD83C\uDF3F', dust: null,  minIv: 0 },
] as const;

/** チームリーダー評価 (星) */
const APPRAISALS = [
  { stars: 0, label: '\u2015',   min: 0,  max: 22 },
  { stars: 1, label: '\u2605',   min: 23, max: 29 },
  { stars: 2, label: '\u2605\u2605',  min: 30, max: 36 },
  { stars: 3, label: '\u2605\u2605\u2605', min: 37, max: 44 },
  { stars: 4, label: '\u2605\u2605\u2605\u2605', min: 45, max: 45 },
] as const;

export function IvInput({ value, onChange, onCalculate, canCalculate }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

  const handleSource = (source: typeof CATCH_SOURCES[number]) => {
    set({
      dust: source.dust ?? value.dust,
      lucky: false,
      purified: false,
      shadow: false,
    });
  };

  const handleAppraisal = (appraisal: typeof APPRAISALS[number]) => {
    if (appraisal.stars === 4) {
      set({ atk: 15, def: 15, sta: 15 });
    } else if (appraisal.stars === 0) {
      set({ atk: null, def: null, sta: null });
    }
    // 星1-3: IV個別値はクリアして手動入力に委ねる（合計値の範囲はバリデーションで使える）
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
              key={s.key}
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
              style={{ flex: 1, justifyContent: 'center', fontSize: a.stars >= 3 ? '0.65rem' : '0.8rem' }}
            >
              {a.label}
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

      {/* タイプ選択 */}
      <div>
        <div className="section-label">TYPE</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`chip${value.lucky ? ' active' : ''}`}
            onClick={() => set({ lucky: !value.lucky, purified: false, shadow: false })}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            \u2728 キラ
          </button>
          <button
            className={`chip${value.purified ? ' active' : ''}`}
            onClick={() => set({ purified: !value.purified, lucky: false, shadow: false })}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            \uD83D\uDC9C リトレーン
          </button>
          <button
            className={`chip${value.shadow ? ' active' : ''}`}
            onClick={() => set({ shadow: !value.shadow, lucky: false, purified: false })}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            \uD83D\uDDA4 シャドウ
          </button>
        </div>
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
