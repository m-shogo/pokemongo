import type { IvResult, Pokemon } from '../lib/types';

interface Props {
  results: IvResult[];
  pokemon: Pokemon | null;
  onReset: () => void;
}

const LEAGUES = [
  { key: 'great', name: 'スーパー', cp: '1500' },
  { key: 'ultra', name: 'ハイパー', cp: '2500' },
  { key: 'master', name: 'マスター', cp: 'MAX' },
] as const;

function getRecommendation(rank: number): { label: string; css: string } {
  if (rank <= 10) return { label: '即育成', css: 'badge-top' };
  if (rank <= 50) return { label: '優秀', css: 'badge-top' };
  if (rank <= 200) return { label: '実用的', css: 'badge-ok' };
  if (rank <= 500) return { label: 'まあまあ', css: 'badge-ok' };
  return { label: '微妙', css: 'badge-nope' };
}

function ivColor(v: number): string {
  if (v === 15) return 'var(--iv-perfect)';
  if (v >= 13) return 'var(--iv-high)';
  if (v >= 8) return 'var(--iv-mid)';
  return 'var(--iv-low)';
}

function rankColor(rank: number): string {
  if (rank <= 10) return 'var(--iv-perfect)';
  if (rank <= 50) return 'var(--iv-high)';
  if (rank <= 200) return 'var(--text)';
  return 'var(--text-dim)';
}

export function ResultPanel({ results, pokemon, onReset }: Props) {
  if (!pokemon) return null;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 結果サマリー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {results.length > 0
            ? `${results.length}件 の候補`
            : '一致する組み合わせなし'}
        </span>
        <button
          onClick={onReset}
          style={{
            fontSize: '0.8rem',
            background: 'none',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-dim)',
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          リセット
        </button>
      </div>

      {/* 結果なし */}
      {results.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{'\uD83D\uDD0D'}</div>
          <p>入力条件に合うIV組み合わせがありません</p>
          <p style={{ marginTop: 4, fontSize: '0.75rem' }}>CP・HP・すなを確認してください</p>
        </div>
      )}

      {/* 結果カード一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.slice(0, 30).map((r, i) => (
          <ResultCard key={i} result={r} isTop={i === 0} totalCount={results.length} />
        ))}
        {results.length > 30 && (
          <div style={{
            textAlign: 'center',
            padding: 12,
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
          }}>
            ...他 {results.length - 30} 件の候補
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ result, isTop, totalCount }: {
  result: IvResult; isTop: boolean; totalCount: number;
}) {
  const { atk, def, sta, level, cp, hp, ivPercent, leagues } = result;
  const ivTotal = atk + def + sta;

  return (
    <div className={`result-card fade-in${isTop ? ' top-pick' : ''}`}>
      {/* 上段: IV% とレベル/CP */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 700, color: ivColor(Math.min(atk, def, sta)) }}>
              {ivPercent}%
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              {ivTotal}/45
            </span>
            {isTop && totalCount > 1 && (
              <span className="badge badge-top" style={{ marginLeft: 4 }}>BEST</span>
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Lv {level} / CP {cp} / HP {hp}
          </div>
        </div>
      </div>

      {/* IV バー */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <IvBar label="ATK" value={atk} />
        <IvBar label="DEF" value={def} />
        <IvBar label="HP" value={sta} />
      </div>

      {/* 3リーグ同時表示 */}
      <div className="league-rank-row">
        {LEAGUES.map(({ key, name }) => {
          const info = leagues[key];
          if (!info) return (
            <div key={key} className="league-rank-cell">
              <div className={`league-rank-header league-rank-header-${key}`}>{name}</div>
              <div className="league-rank-na">-</div>
            </div>
          );
          const rec = getRecommendation(info.rank);
          return (
            <div key={key} className="league-rank-cell">
              <div className={`league-rank-header league-rank-header-${key}`}>{name}</div>
              <div className="league-rank-number" style={{ color: rankColor(info.rank) }}>
                #{info.rank}
              </div>
              <div className="league-rank-pct">{info.percentOfBest}%</div>
              <div className="league-rank-detail">
                CP{info.maxCp} / Lv{info.maxLevel}
              </div>
              <span className={`badge ${rec.css}`} style={{ fontSize: '0.6rem', padding: '2px 6px' }}>
                {rec.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IvBar({ label, value }: { label: string; value: number }) {
  const pct = (value / 15) * 100;
  const color = ivColor(value);

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.65rem',
        color: 'var(--text-dim)',
        marginBottom: 3,
      }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: value === 15 ? 700 : 400 }}>{value}</span>
      </div>
      <div className="iv-bar-track">
        <div
          className="iv-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
