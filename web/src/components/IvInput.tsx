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

/** ゲーム内鑑定テキスト (ブランシェ風) */
function getAppraisal(total: number): { text: string; color: string; stars: number } {
  if (total >= 37) return { text: '驚異的で、芸術的だ。', color: 'var(--iv-high)', stars: 3 };
  if (total >= 30) return { text: '目を引くものがある。', color: 'var(--iv-mid)', stars: 2 };
  if (total >= 23) return { text: '普通以上と言える。', color: 'var(--text-secondary)', stars: 1 };
  return { text: 'バトル向きではない…', color: 'var(--text-dim)', stars: 0 };
}

/** IV値に対する個別コメント (15=最高) */
function getStatComment(v: number): string {
  if (v === 15) return '言うことなし！';
  if (v >= 13) return 'すばらしい';
  if (v >= 8) return 'とても良い';
  return 'まあまあ';
}

/** フンド / ナンド 特別判定 */
function getSpecialLabel(atk: number, def: number, sta: number): string | null {
  if (atk === 15 && def === 15 && sta === 15) return 'HUNDO';
  if (atk === 0 && def === 0 && sta === 0) return 'NUNDO';
  if (atk === 0 && def === 15 && sta === 15) return 'PvP理想';
  return null;
}

/** IV下限プリセット */
const IV_PRESETS = [
  { label: 'ワイルド', iv: 0, desc: '野生' },
  { label: 'レイド', iv: 10, desc: 'タマゴ' },
  { label: 'キラ', iv: 12, desc: '交換' },
  { label: '100%', iv: 15, desc: 'MAX' },
] as const;

export function IvInput({ value, onChange }: Props) {
  const set = (patch: Partial<IvInputType>) => onChange({ ...value, ...patch });

  const allSet = value.atk !== null && value.def !== null && value.sta !== null;
  const total = allSet ? value.atk! + value.def! + value.sta! : null;
  const percent = total !== null ? Math.round((total / 45) * 100) : null;
  const special = allSet ? getSpecialLabel(value.atk!, value.def!, value.sta!) : null;
  const isHundo = special === 'HUNDO';
  const isNundo = special === 'NUNDO';

  /** プリセットボタン: 3つのIVを同じ値にセット */
  const applyPreset = (iv: number) => {
    onChange({ ...value, atk: iv, def: iv, sta: iv });
  };

  return (
    <div className={`card iv-input-card${isHundo ? ' iv-hundo' : ''}${isNundo ? ' iv-nundo' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="section-label" style={{ marginBottom: 0 }}>IV</div>
        {/* 星評価 */}
        {total !== null && (
          <div className="iv-stars fade-in">
            <Stars count={getAppraisal(total).stars} />
          </div>
        )}
      </div>

      {/* プリセットボタン */}
      <div className="iv-presets">
        {IV_PRESETS.map((p) => (
          <button
            key={p.iv}
            className={`iv-preset-btn${allSet && value.atk === p.iv && value.def === p.iv && value.sta === p.iv ? ' active' : ''}`}
            onClick={() => applyPreset(p.iv)}
          >
            <span className="iv-preset-label">{p.label}</span>
            <span className="iv-preset-desc">{p.desc}</span>
          </button>
        ))}
      </div>

      {/* 3列スライダー */}
      <div className="iv-sliders-row">
        <IvSlider label="ATK" value={value.atk} onChange={(v) => set({ atk: v })} />
        <IvSlider label="DEF" value={value.def} onChange={(v) => set({ def: v })} />
        <IvSlider label="HP" value={value.sta} onChange={(v) => set({ sta: v })} />
      </div>

      {/* IV サマリー */}
      {total !== null && (
        <div className={`iv-summary${isHundo ? ' iv-summary-hundo' : ''} fade-in`}>
          <PercentRing percent={percent!} color={ivColor(Math.min(value.atk!, value.def!, value.sta!))} />
          <div style={{ textAlign: 'left' }}>
            <div className="iv-total" style={{ color: ivColor(Math.min(value.atk!, value.def!, value.sta!)) }}>
              {total}<span className="iv-total-max">/45</span>
              {special && (
                <span className={`iv-special-tag iv-special-${special.toLowerCase()}`}>
                  {special}
                </span>
              )}
            </div>
            <div className="iv-appraisal" style={{ color: getAppraisal(total).color }}>
              {getAppraisal(total).text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 星表示 (0-3) ゲーム内風 */
function Stars({ count }: { count: number }) {
  return (
    <span className="iv-stars-row">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`iv-star${i < count ? ' iv-star-filled' : ''}`}>
          {i < count ? '\u2605' : '\u2606'}
        </span>
      ))}
    </span>
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
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
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
  const comment = value !== null ? getStatComment(value) : null;

  return (
    <div className="iv-slider">
      <div className="iv-slider-label">{label}</div>
      <div className="iv-slider-value" style={{ color: ivColor(value) }}>
        {value ?? '-'}
      </div>
      {comment && (
        <div className="iv-slider-comment" style={{ color: ivColor(value) }}>
          {comment}
        </div>
      )}
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
