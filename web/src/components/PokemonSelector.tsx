import { useState, useMemo } from 'react';
import type { Pokemon } from '../lib/types';

interface Props {
  pokemon: Pokemon[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export function PokemonSelector({ pokemon, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return pokemon;
    const q = query.toLowerCase();
    return pokemon.filter((p) => p.name.toLowerCase().includes(q) || String(p.id).includes(q));
  }, [pokemon, query]);

  const selected = selectedId !== null ? pokemon.find((p) => p.id === selectedId) : null;

  return (
    <div style={{ marginBottom: 12, position: 'relative' }}>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ポケモン</label>
      <input
        type="text"
        value={open ? query : selected?.name ?? ''}
        placeholder="名前で検索..."
        onFocus={() => { setOpen(true); setQuery(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          display: 'block',
          width: '100%',
          padding: '10px 12px',
          fontSize: '1rem',
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          marginTop: 4,
        }}
      />
      {open && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          maxHeight: 240,
          overflow: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          listStyle: 'none',
          zIndex: 10,
          margin: 0,
          padding: 0,
        }}>
          {filtered.slice(0, 30).map((p) => (
            <li
              key={p.id}
              onMouseDown={() => { onSelect(p.id); setOpen(false); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: p.id === selectedId ? 'var(--accent)' : 'transparent',
              }}
            >
              #{p.id} {p.name}
            </li>
          ))}
          {filtered.length === 0 && (
            <li style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
              見つかりません
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
