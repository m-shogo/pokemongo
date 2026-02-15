import type { IvInput as IvInputType } from '../lib/types';

interface Props {
  value: IvInputType;
  onChange: (v: IvInputType) => void;
}

export function IvInput({ value, onChange }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="section-label">IV</div>
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
