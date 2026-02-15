import type { IvInput as IvInputType } from '../lib/types';

interface Props {
  value: IvInputType;
  onChange: (v: IvInputType) => void;
}

/** IV値から色を返す */
function ivColor(v: number | null): string {
  if (v === null) return 'var(--text-dim)';
  if (v === 15) return 'var(--iv-perfect)';
  if (v >= 13) return 'var(--iv-high)';
  if (v >= 8) return 'var(--iv-mid)';
  return 'var(--iv-low)';
}

/** ゲーム内鑑定風テキスト */
function getAppraisalText(total: number): { text: string; color: string } {
  if (total === 45) return { text: '最高の相棒！', color: 'var(--iv-perfect)' };
  if (total >= 37) return { text: '驚異的で芸術的だ', color: 'var(--iv-high)' };
  if (total >= 30) return { text: '目を引くものがある', color: 'var(--iv-mid)' };
  if (total >= 23) return { text: 'まずまずだ', color: 'var(--text-secondary)' };
  return { text: 'バトル向きではない', color: 'var(--text-dim)' };
}

export function IvInput({ value, onChange }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

  const allSet = value.atk !== null && value.def !== null && value.sta !== null;
  const total = allSet ? value.atk! + value.def! + value.sta! : null;
  const percent = total !== null ? Math.round((total / 45) * 100) : null;

  return (
    <div className="card iv-input-card">
      <div className="section-label">IV</div>

      {/* 3列スライダー */}
      <div className="iv-sliders-row">
        <IvSlider label="ATK" value={value.atk} onChange={(v) => set({ atk: v })} />
        <IvSlider label="DEF" value={value.def} onChange={(v) => set({ def: v })} />
        <IvSlider label="HP" value={value.sta} onChange={(v) => set({ sta: v })} />
      </div>

      {/* IV サマリー */}
      {total !== null && (
        <div className="iv-summary fade-in">
          <PercentRing percent={percent!} color={ivColor(Math.min(value.atk!, value.def!, value.sta!))} />
          <div>
            <div className="iv-total" style={{ color: ivColor(Math.min(value.atk!, value.def!, value.sta!)) }}>
              {total}<span className="iv-total-max">/45</span>
            </div>
            <div className="iv-appraisal" style={{ color: getAppraisalText(total).color }}>
              {getAppraisalText(total).text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** SVG 円グラフ (パーセント表示) */
function PercentRing({ percent, color }: { percent: number; color: string }) {
  const r = 19;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="iv-percent-ring">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="24" cy="24" r={r} fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="iv-percent-ring-text" style={{ color }}>
        {percent}%
      </div>
    </div>
  );
}

function IvSlider({ label, value, onChange }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
}) {
  return (
    <div className="iv-slider">
      <div className="iv-slider-label">{label}</div>
      <div className="iv-slider-value" style={{ color: ivColor(value) }}>
        {value ?? '-'}
      </div>
      <input
        type="range"
        min={0}
        max={15}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button className="iv-slider-unknown" onClick={() => onChange(null)}>
        不明
      </button>
    </div>
  );
}
