import { useState, useCallback } from 'react';
import { PokemonSelector } from './components/PokemonSelector';
import { IvInput } from './components/IvInput';
import { ResultPanel } from './components/ResultPanel';
import { calculateAllIvCombinations } from './lib/iv-calculator';
import { POKEMON_DATA } from './data/pokemon';
import type { IvInput as IvInputType, IvResult } from './lib/types';

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
  const [calculated, setCalculated] = useState(false);

  const handleCalculate = useCallback(() => {
    if (pokemonId === null) return;
    const pokemon = POKEMON_DATA.find((p) => p.id === pokemonId);
    if (!pokemon) return;
    const combos = calculateAllIvCombinations(pokemon, ivInput);
    setResults(combos);
    setCalculated(true);
  }, [pokemonId, ivInput]);

  const handleReset = useCallback(() => {
    setPokemonId(null);
    setIvInput({
      cp: null, hp: null, dust: null,
      atk: null, def: null, sta: null,
      lucky: false, purified: false, shadow: false,
    });
    setResults([]);
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
          onSelect={(id) => { setPokemonId(id); setCalculated(false); setResults([]); }}
        />

        <IvInput
          value={ivInput}
          onChange={(v) => { setIvInput(v); setCalculated(false); }}
          onCalculate={handleCalculate}
          canCalculate={pokemonId !== null}
        />

        {calculated && (
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
