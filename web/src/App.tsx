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
  });
  const [results, setResults] = useState<IvResult[]>([]);

  const handleCalculate = useCallback(() => {
    if (pokemonId === null) return;
    const pokemon = POKEMON_DATA.find((p) => p.id === pokemonId);
    if (!pokemon) return;
    const combos = calculateAllIvCombinations(pokemon, ivInput);
    setResults(combos);
  }, [pokemonId, ivInput]);

  const pokemon = pokemonId !== null
    ? POKEMON_DATA.find((p) => p.id === pokemonId) ?? null
    : null;

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', textAlign: 'center', margin: '8px 0 16px' }}>
        ポケモンGO IV チェッカー
      </h1>
      <PokemonSelector
        pokemon={POKEMON_DATA}
        selectedId={pokemonId}
        onSelect={setPokemonId}
      />
      <IvInput
        value={ivInput}
        onChange={setIvInput}
        onCalculate={handleCalculate}
        canCalculate={pokemonId !== null}
      />
      <ResultPanel results={results} pokemon={pokemon} />
    </div>
  );
}
