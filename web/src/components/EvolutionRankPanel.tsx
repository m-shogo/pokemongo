import type { EvolutionRankEntry, EvolutionLeagueInfo } from '../lib/types';

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

function rankColor(rank: number): string {
  if (rank <= 10) return 'var(--iv-perfect)';
  if (rank <= 50) return 'var(--iv-high)';
  if (rank <= 200) return 'var(--text)';
  return 'var(--text-dim)';
}

export function EvolutionRankPanel({
  entries, selectedPokemonName, ivAtk, ivDef, ivSta, onReset,
}: Props) {
  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {selectedPokemonName} {ivAtk}/{ivDef}/{ivSta}
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

  return (
    <div className="evo-form-card">
      {/* ポケモン名 */}
      <div className="evo-form-name">
        {pokemon.name}
      </div>

      {/* 4リーグ横並び */}
      <div className="evo-league-row">
        {DISPLAY_LEAGUES.map(({ key, cssKey }) => {
          const info = leagues[key];
          const info51 = key === 'master' ? leagues.master51 : null;

          if (!info) {
            return (
              <div key={cssKey} className="evo-league-cell">
                <span className="evo-na">-</span>
              </div>
            );
          }

          return (
            <div key={cssKey} className="evo-league-cell">
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
  return (
    <div className="evo-entry">
      <div className="evo-rank" style={{ color: rankColor(info.rank) }}>
        {info.rank}位
      </div>
      <div className="evo-cp">
        CP{info.cp}(Lv{info.level})
      </div>
      <div className="evo-scp">
        SCP{info.scp}
      </div>
      {!isSelectedPokemon && (
        <div className="evo-pre-cp">
          前CP{info.preCp}
        </div>
      )}
    </div>
  );
}
