import type { IvInput as IvInputType } from '../lib/types';
import { DUST_TO_LEVEL } from '../data/cpm';

interface Props {
  value: IvInputType;
  onChange: (v: IvInputType) => void;
  onCalculate: () => void;
  canCalculate: boolean;
}

const dustOptions = DUST_TO_LEVEL.map((d) => d.dust);

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '8px 10px',
  fontSize: '1rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--accent)',
  borderRadius: 6,
  marginTop: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
};

function NumInput({ label, value, onChange, placeholder, min, max }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  placeholder?: string; min?: number; max?: number;
}) {
  return (
    <div style={{ flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        placeholder={placeholder ?? ''}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        style={fieldStyle}
      />
    </div>
  );
}

export function IvInput({ value, onChange, onCalculate, canCalculate }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

  return (
    <div style={{ marginBottom: 16 }}>
      {/* CP / HP / すな */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <NumInput label="CP" value={value.cp} onChange={(v) => set({ cp: v })} />
        <NumInput label="HP" value={value.hp} onChange={(v) => set({ hp: v })} />
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>ほしのすな</label>
          <select
            value={value.dust ?? ''}
            onChange={(e) => set({ dust: e.target.value ? Number(e.target.value) : null })}
            style={fieldStyle}
          >
            <option value="">--</option>
            {dustOptions.map((d) => <option key={d} value={d}>{d.toLocaleString()}</option>)}
          </select>
        </div>
      </div>

      {/* IV ゲージ (手入力) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <IvSlider label="こうげき" value={value.atk} onChange={(v) => set({ atk: v })} />
        <IvSlider label="ぼうぎょ" value={value.def} onChange={(v) => set({ def: v })} />
        <IvSlider label="HP" value={value.sta} onChange={(v) => set({ sta: v })} />
      </div>

      {/* オプション */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: '0.9rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={value.lucky}
            onChange={(e) => set({ lucky: e.target.checked })}
          />
          キラ
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={value.purified}
            onChange={(e) => set({ purified: e.target.checked })}
          />
          リトレーン
        </label>
      </div>

      <button
        onClick={onCalculate}
        disabled={!canCalculate}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: '1rem',
          fontWeight: 'bold',
          background: canCalculate ? 'var(--primary)' : '#444',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: canCalculate ? 'pointer' : 'default',
        }}
      >
        計算する
      </button>
    </div>
  );
}

function IvSlider({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '4px 0' }}>
        {value ?? '-'}
      </div>
      <input
        type="range"
        min={0}
        max={15}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--primary)' }}
      />
      <button
        onClick={() => onChange(null)}
        style={{
          fontSize: '0.7rem',
          background: 'transparent',
          color: 'var(--text-muted)',
          border: '1px solid var(--accent)',
          borderRadius: 4,
          padding: '2px 6px',
          cursor: 'pointer',
          marginTop: 2,
        }}
      >
        不明
      </button>
    </div>
  );
}
