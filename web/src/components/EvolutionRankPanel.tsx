import type { EvolutionRankEntry, EvolutionLeagueInfo, LeagueKey } from '../lib/types';

interface Props {
  entries: EvolutionRankEntry[];
  selectedPokemonName: string;
  ivAtk: number;
  ivDef: number;
  ivSta: number;
  onReset: () => void;
}

/** 表示用リーグ (500 / SL / HL / ML) */
const DISPLAY_LEAGUES = [
  { key: 'little' as const, label: '500', cssKey: 'little' },
  { key: 'great'  as const, label: 'SL',  cssKey: 'great' },
  { key: 'ultra'  as const, label: 'HL',  cssKey: 'ultra' },
  { key: 'master' as const, label: 'ML',  cssKey: 'master' },
];

/** ランクに応じた色 */
function rankColor(rank: number): string {
  if (rank <= 1) return 'var(--rank-god)';
  if (rank <= 10) return 'var(--rank-top)';
  if (rank <= 50) return 'var(--iv-high)';
  if (rank <= 200) return 'var(--text)';
  return 'var(--text-dim)';
}

/** ランク評価バッジ */
function getRec(rank: number): { label: string; css: string } | null {
  if (rank <= 1)   return { label: '1位！', css: 'evo-rec-god' };
  if (rank <= 10)  return { label: '即育成', css: 'evo-rec-top' };
  if (rank <= 50)  return { label: '優秀', css: 'evo-rec-good' };
  if (rank <= 200) return { label: '実用的', css: 'evo-rec-ok' };
  return null; // 200位以下はバッジなし
}

/** 進化形態ごとの「ベストリーグ」を判定 (rank が最小のリーグ) */
function findBestLeague(
  leagues: Record<LeagueKey, EvolutionLeagueInfo | null>,
): LeagueKey | null {
  let best: LeagueKey | null = null;
  let bestRank = Infinity;
  for (const { key } of DISPLAY_LEAGUES) {
    const info = leagues[key];
    if (info && info.rank < bestRank) {
      bestRank = info.rank;
      best = key;
    }
  }
  return bestRank <= 200 ? best : null;
}

export function EvolutionRankPanel({
  entries, selectedPokemonName, ivAtk, ivDef, ivSta, onReset,
}: Props) {
  return (
    <div className="slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ヘッダー */}
      <div className="evo-panel-header">
        <span className="evo-panel-title">
          <span className="evo-panel-iv">{selectedPokemonName}</span>{' '}
          {ivAtk}/{ivDef}/{ivSta}
        </span>
        <button className="evo-reset-btn" onClick={onReset}>
          リセット
        </button>
      </div>

      {/* リーグヘッダー行 */}
      <div className="evo-league-header">
        {DISPLAY_LEAGUES.map(({ label, cssKey }) => (
          <div key={cssKey} className={`evo-league-label league-rank-header-${cssKey}`}>
            {label}
          </div>
        ))}
      </div>

      {/* 各進化形態 */}
      {entries.map((entry) => (
        <EvolutionFormRow
          key={entry.pokemon.id}
          entry={entry}
          isSelectedPokemon={entry.pokemon.name === selectedPokemonName}
        />
      ))}
    </div>
  );
}

function EvolutionFormRow({ entry, isSelectedPokemon }: {
  entry: EvolutionRankEntry;
  isSelectedPokemon: boolean;
}) {
  const { pokemon, leagues } = entry;
  const bestLeague = findBestLeague(leagues);

  return (
    <div className={`evo-form-card${isSelectedPokemon ? ' evo-selected' : ''}`}>
      {/* ポケモン名 + タグ */}
      <div className="evo-form-header">
        <span className="evo-form-name">{pokemon.name}</span>
        {isSelectedPokemon && <span className="evo-form-tag">選択中</span>}
      </div>

      {/* 4リーグ横並び */}
      <div className="evo-league-row">
        {DISPLAY_LEAGUES.map(({ key, cssKey }) => {
          const info = leagues[key];
          const info51 = key === 'master' ? leagues.master51 : null;
          const isBest = key === bestLeague;

          if (!info) {
            return (
              <div key={cssKey} className="evo-league-cell">
                <span className="evo-na">-</span>
              </div>
            );
          }

          return (
            <div key={cssKey} className={`evo-league-cell${isBest ? ' evo-cell-best' : ''}`}>
              <LeagueEntry info={info} isSelectedPokemon={isSelectedPokemon} />
              {/* ML: Lv51 (相棒) */}
              {info51 && (
                <>
                  <div className="evo-divider" />
                  <LeagueEntry info={info51} isSelectedPokemon={isSelectedPokemon} />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeagueEntry({ info, isSelectedPokemon }: {
  info: EvolutionLeagueInfo;
  isSelectedPokemon: boolean;
}) {
  const rec = getRec(info.rank);

  return (
    <div className="evo-entry">
      <div className="evo-rank" style={{ color: rankColor(info.rank) }}>
        {info.rank}<span className="evo-rank-suffix">位</span>
      </div>
      <div className="evo-percent" style={{ color: rankColor(info.rank) }}>
        {info.percentOfBest}%
      </div>
      <div className="evo-cp">
        CP{info.cp} Lv{info.level}
      </div>
      <div className="evo-scp">
        SCP{info.scp}
      </div>
      {!isSelectedPokemon && (
        <div className="evo-pre-cp">
          前CP{info.preCp}
        </div>
      )}
      {rec && <span className={`evo-rec ${rec.css}`}>{rec.label}</span>}
    </div>
  );
}
