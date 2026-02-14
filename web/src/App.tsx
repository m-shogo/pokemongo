import { useState, useCallback } from 'react';
import { PokemonSelector } from './components/PokemonSelector';
import { IvInput } from './components/IvInput';
import { ResultPanel } from './components/ResultPanel';
import { EvolutionRankPanel } from './components/EvolutionRankPanel';
import { calculateAllIvCombinations, calculateEvolutionRankings } from './lib/iv-calculator';
import { POKEMON_DATA } from './data/pokemon';
import type { IvInput as IvInputType, IvResult, EvolutionRankEntry } from './lib/types';

export function App() {
  const [pokemonId, setPokemonId] = useState<number | null>(null);
  const [ivInput, setIvInput] = useState<IvInputType>({
    cp: null,
    hp: null,
    dust: null,
    atk: null,
    def: null,
    sta: null,
    lucky: false,
    purified: false,
    shadow: false,
  });
  const [results, setResults] = useState<IvResult[]>([]);
  const [evoRankings, setEvoRankings] = useState<EvolutionRankEntry[]>([]);
  const [calculated, setCalculated] = useState(false);
  const [loading, setLoading] = useState(false);

  // IV が全て指定されているか
  const allIvsSpecified = ivInput.atk !== null && ivInput.def !== null && ivInput.sta !== null;

  const handleCalculate = useCallback(() => {
    if (pokemonId === null) return;
    const pokemon = POKEMON_DATA.find((p) => p.id === pokemonId);
    if (!pokemon) return;

    setLoading(true);
    setCalculated(false);

    // setTimeout で UI に計算中表示を描画させてから重い計算を実行
    setTimeout(() => {
      if (allIvsSpecified) {
        const rankings = calculateEvolutionRankings(
          pokemon, ivInput.atk!, ivInput.def!, ivInput.sta!,
        );
        setEvoRankings(rankings);
        setResults([]);
      } else {
        const combos = calculateAllIvCombinations(pokemon, ivInput);
        setResults(combos);
        setEvoRankings([]);
      }
      setCalculated(true);
      setLoading(false);
    }, 10);
  }, [pokemonId, ivInput, allIvsSpecified]);

  const handleReset = useCallback(() => {
    setPokemonId(null);
    setIvInput({
      cp: null, hp: null, dust: null,
      atk: null, def: null, sta: null,
      lucky: false, purified: false, shadow: false,
    });
    setResults([]);
    setEvoRankings([]);
    setCalculated(false);
  }, []);

  const pokemon = pokemonId !== null
    ? POKEMON_DATA.find((p) => p.id === pokemonId) ?? null
    : null;

  return (
    <div>
      <header className="app-header">
        <h1>IV Checker</h1>
        <p>個体値チェッカー</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PokemonSelector
          pokemon={POKEMON_DATA}
          selectedId={pokemonId}
          onSelect={(id) => { setPokemonId(id); setCalculated(false); setResults([]); setEvoRankings([]); }}
        />

        <IvInput
          value={ivInput}
          onChange={(v) => { setIvInput(v); setCalculated(false); }}
          onCalculate={handleCalculate}
          canCalculate={pokemonId !== null && !loading}
        />

        {/* 計算中表示 */}
        {loading && (
          <div className="loading-state">
            計算中...
          </div>
        )}

        {calculated && evoRankings.length > 0 && pokemon && (
          <EvolutionRankPanel
            entries={evoRankings}
            selectedPokemonName={pokemon.name}
            ivAtk={ivInput.atk!}
            ivDef={ivInput.def!}
            ivSta={ivInput.sta!}
            onReset={handleReset}
          />
        )}

        {calculated && evoRankings.length === 0 && (
          <ResultPanel
            results={results}
            pokemon={pokemon}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
