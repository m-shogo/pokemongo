import type { Pokemon } from '../../lib/types';
import { GEN1_POKEMON } from './gen1';
import { GEN2_POKEMON } from './gen2';
import { GEN3_POKEMON } from './gen3';
import { GEN4_POKEMON } from './gen4';
import { GEN5_POKEMON } from './gen5';
import { GEN6_POKEMON } from './gen6';
import { GEN7_POKEMON } from './gen7';
import { GEN8_POKEMON } from './gen8';
import { GEN9_POKEMON } from './gen9';

/**
 * 全ポケモン種族値データ (Gen 1〜9)
 * 新世代追加時は genX.ts を作成してここに追加するだけでOK
 */
export const POKEMON_DATA: Pokemon[] = [
  ...GEN1_POKEMON,
  ...GEN2_POKEMON,
  ...GEN3_POKEMON,
  ...GEN4_POKEMON,
  ...GEN5_POKEMON,
  ...GEN6_POKEMON,
  ...GEN7_POKEMON,
  ...GEN8_POKEMON,
  ...GEN9_POKEMON,
].sort((a, b) => a.id - b.id);
