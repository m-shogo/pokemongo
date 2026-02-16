import { useState, useEffect, useCallback, useRef } from 'react';
import { PokemonSelector } from './components/PokemonSelector';
import { IvInput } from './components/IvInput';
import { EvolutionRankPanel } from './components/EvolutionRankPanel';
import { calculateEvolutionRankings } from './lib/iv-calculator';
import { POKEMON_DATA } from './data/pokemon';
import type { IvInput as IvInputType, EvolutionRankEntry } from './lib/types';

export function App() {
  const [pokemonId, setPokemonId] = useState<number | null>(null);
  const [ivInput, setIvInput] = useState<IvInputType>({
    cp: null, hp: null, dust: null,
    atk: null, def: null, sta: null,
    lucky: false, purified: false, shadow: false,
  });
  const [evoRankings, setEvoRankings] = useState<EvolutionRankEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  const allIvsSpecified = ivInput.atk !== null && ivInput.def !== null && ivInput.sta !== null;

  // ポケモン + IV が揃ったら自動計算
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (pokemonId === null || !allIvsSpecified) {
      setEvoRankings([]);
      setLoading(false);
      return;
    }

    const pokemon = POKEMON_DATA.find((p) => p.id === pokemonId);
    if (!pokemon) return;

    setLoading(true);

    timerRef.current = window.setTimeout(() => {
      const rankings = calculateEvolutionRankings(
        pokemon, ivInput.atk!, ivInput.def!, ivInput.sta!,
      );
      setEvoRankings(rankings);
      setLoading(false);
      timerRef.current = null;
    }, 10);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pokemonId, ivInput.atk, ivInput.def, ivInput.sta, allIvsSpecified]);

  const handleReset = useCallback(() => {
    setPokemonId(null);
    setIvInput({
      cp: null, hp: null, dust: null,
      atk: null, def: null, sta: null,
      lucky: false, purified: false, shadow: false,
    });
    setEvoRankings([]);
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PokemonSelector
          pokemon={POKEMON_DATA}
          selectedId={pokemonId}
          onSelect={setPokemonId}
        />

        <IvInput
          value={ivInput}
          onChange={setIvInput}
        />

        {loading && (
          <div className="loading-state">
            <div className="loading-pokeball" />
            <div>計算中...</div>
          </div>
        )}

        {!loading && evoRankings.length > 0 && pokemon && (
          <EvolutionRankPanel
            entries={evoRankings}
            selectedPokemonName={pokemon.name}
            ivAtk={ivInput.atk!}
            ivDef={ivInput.def!}
            ivSta={ivInput.sta!}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}
