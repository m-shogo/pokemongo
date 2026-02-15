import { useState, useMemo, useRef, useEffect } from 'react';
import type { Pokemon } from '../lib/types';

/** ひらがなをカタカナに変換 */
function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

const HISTORY_KEY = 'pokemon-history';
const MAX_HISTORY = 10;

function loadHistory(): number[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(ids: number[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(ids.slice(0, MAX_HISTORY)));
}

interface Props {
  pokemon: Pokemon[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export function PokemonSelector({ pokemon, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<number[]>(loadHistory);
  const inputRef = useRef<HTMLInputElement>(null);

  // ひらがな→カタカナ変換して検索
  const filtered = useMemo(() => {
    if (!query) return null; // クエリなし → 履歴表示用に null
    const q = hiraganaToKatakana(query.toLowerCase());
    return pokemon.filter((p) =>
      hiraganaToKatakana(p.name.toLowerCase()).includes(q) || String(p.id).includes(q),
    );
  }, [pokemon, query]);

  // 履歴のポケモン一覧
  const historyPokemon = useMemo(() => {
    if (!open || query) return [];
    return history
      .map((id) => pokemon.find((p) => p.id === id))
      .filter((p): p is Pokemon => p !== undefined);
  }, [history, pokemon, open, query]);

  const selected = selectedId !== null ? pokemon.find((p) => p.id === selectedId) : null;

  // 選択時に履歴保存
  const handleSelect = (id: number | null) => {
    onSelect(id);
    if (id !== null) {
      const next = [id, ...history.filter((h) => h !== id)].slice(0, MAX_HISTORY);
      setHistory(next);
      saveHistory(next);
    }
  };

  // 外から selectedId が変わった場合も履歴に入れる
  useEffect(() => {
    if (selectedId !== null && !history.includes(selectedId)) {
      const next = [selectedId, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      saveHistory(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const displayList = filtered ?? historyPokemon;
  const showHistoryLabel = !query && historyPokemon.length > 0;

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
      {open && (displayList.length > 0 || query) && (
        <div className="dropdown fade-in">
          {showHistoryLabel && (
            <div style={{ padding: '6px 12px', fontSize: '0.7rem', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
              最近のポケモン
            </div>
          )}
          {displayList.slice(0, 40).map((p) => (
            <div
              key={p.id}
              className={`dropdown-item${p.id === selectedId ? ' selected' : ''}`}
              onMouseDown={() => { handleSelect(p.id); setOpen(false); }}
            >
              <span style={{ color: 'var(--text-dim)', marginRight: 8, fontSize: '0.8rem' }}>
                #{String(p.id).padStart(3, '0')}
              </span>
              {p.name}
            </div>
          ))}
          {filtered !== null && filtered.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              見つかりません
            </div>
          )}
        </div>
      )}
    </div>
  );
}
