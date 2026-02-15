import type { IvInput as IvInputType } from '../lib/types';

interface Props {
  value: IvInputType;
  onChange: (v: IvInputType) => void;
}

/** チームリーダー評価 (星) */
const APPRAISALS = [
  { stars: 0, label: '\u2015',   min: 0,  max: 22 },
  { stars: 1, label: '\u2605',   min: 23, max: 29 },
  { stars: 2, label: '\u2605\u2605',  min: 30, max: 36 },
  { stars: 3, label: '\u2605\u2605\u2605', min: 37, max: 44 },
  { stars: 4, label: '\u2605\u2605\u2605\u2605', min: 45, max: 45 },
] as const;

export function IvInput({ value, onChange }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

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
