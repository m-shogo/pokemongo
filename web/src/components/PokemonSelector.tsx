import { useState, useMemo, useRef } from 'react';
import type { Pokemon } from '../lib/types';

interface Props {
  pokemon: Pokemon[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export function PokemonSelector({ pokemon, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!query) return pokemon;
    const q = query.toLowerCase();
    return pokemon.filter((p) =>
      p.name.toLowerCase().includes(q) || String(p.id).includes(q),
    );
  }, [pokemon, query]);

  const selected = selectedId !== null ? pokemon.find((p) => p.id === selectedId) : null;

  return (
    <div className="card" style={{ position: 'relative' }}>
      <div className="section-label">POKEMON</div>
      <input
        ref={inputRef}
        type="text"
        className="field-input"
        value={open ? query : selected ? `#${selected.id} ${selected.name}` : ''}
        placeholder="名前 or 図鑑No で検索..."
        onFocus={() => { setOpen(true); setQuery(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => setQuery(e.target.value)}
      />
      {selected && !open && (
        <button
          onClick={() => { onSelect(null); inputRef.current?.focus(); }}
          style={{
            position: 'absolute',
            right: 24,
            top: 38,
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: '1rem',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          x
        </button>
      )}
      {open && (
        <div className="dropdown fade-in">
          {filtered.slice(0, 40).map((p) => (
            <div
              key={p.id}
              className={`dropdown-item${p.id === selectedId ? ' selected' : ''}`}
              onMouseDown={() => { onSelect(p.id); setOpen(false); }}
            >
              <span style={{ color: 'var(--text-dim)', marginRight: 8, fontSize: '0.8rem' }}>
                #{String(p.id).padStart(3, '0')}
              </span>
              {p.name}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              見つかりません
            </div>
          )}
        </div>
      )}
    </div>
  );
}
