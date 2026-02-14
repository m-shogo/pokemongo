import type { IvResult, Pokemon } from '../lib/types';

interface Props {
  results: IvResult[];
  pokemon: Pokemon | null;
}

const leagueColors = {
  great: 'var(--league-great)',
  ultra: 'var(--league-ultra)',
  master: 'var(--league-master)',
} as const;

const leagueNames = {
  great: 'スーパー',
  ultra: 'ハイパー',
  master: 'マスター',
} as const;

export function ResultPanel({ results, pokemon }: Props) {
  if (!pokemon) return null;
  if (results.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
        条件に一致する組み合わせがありません
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>
        結果: {results.length} 件
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.slice(0, 30).map((r, i) => (
          <ResultCard key={i} result={r} />
        ))}
        {results.length > 30 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 8 }}>
            ...他 {results.length - 30} 件
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: IvResult }) {
  const { atk, def, sta, level, cp, hp, ivPercent, leagues } = result;
  const ivTotal = atk + def + sta;

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 8,
      padding: 12,
      border: '1px solid var(--accent)',
    }}>
      {/* ヘッダー行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
          {ivPercent}% <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({ivTotal}/45)</span>
        </span>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Lv{level} / CP {cp} / HP {hp}
        </span>
      </div>

      {/* IV バー */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <IvBar label="攻" value={atk} />
        <IvBar label="防" value={def} />
        <IvBar label="HP" value={sta} />
      </div>

      {/* リーグランク */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['great', 'ultra', 'master'] as const).map((league) => {
          const info = leagues[league];
          if (!info) return null;
          return (
            <span
              key={league}
              style={{
                fontSize: '0.75rem',
                background: leagueColors[league],
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 12,
              }}
            >
              {leagueNames[league]} #{info.rank} ({info.percentOfBest}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}

function IvBar({ label, value }: { label: string; value: number }) {
  const pct = (value / 15) * 100;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 2 }}>
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div style={{ height: 6, background: '#333', borderRadius: 3 }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: value === 15 ? '#22c55e' : value >= 12 ? '#eab308' : 'var(--primary)',
          borderRadius: 3,
        }} />
      </div>
    </div>
  );
}
