// constants/game.ts - Shared constants for SeekerCraft
import { Dimensions } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── THEME ───
export const C = {
  bg1: '#0B0033', bg2: '#1A0066', bg3: '#2D0099',
  gold: '#FFD700', goldDark: '#CC9900',
  orange: '#FF6B00', orangeLight: '#FF9A44',
  purple: '#7B2FBE', purpleLight: '#A855F7',
  blue: '#3B82F6', blueLight: '#60A5FA',
  red: '#EF4444', redLight: '#F87171',
  green: '#22C55E', greenLight: '#4ADE80',
  surface: 'rgba(255,255,255,0.07)',
  surfaceLight: 'rgba(255,255,255,0.12)',
  card: 'rgba(30,10,60,0.85)',
  cardBorder: 'rgba(255,255,255,0.1)',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.55)',
  danger: '#EF4444',
  success: '#22C55E',
};

// ─── WALLETS ───
export const DEV_WALLET = 'qXhoL96gkzqe2KFMpVPseEWVzyzVUibw7YcXknUJQ85';
export const COMMUNITY_POOL = 'EGEA1dTzyreEU7jyy9XjGfP7fnQbsGEytJD27qdjmhfz';
// SKR token mint on Solana (Seeker token)
export const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';

// ─── FEES ───
export const PUBLISH_FEE_USD = 1;    // Cost to publish a game ($1)
export const PLAY_FEE_USD = 0;       // Playing is FREE
// Publish: 90% dev, 10% pool
export const PUBLISH_SPLIT = { dev: 0.90, pool: 0.10 };
// Donation (optional tip to creator after playing):
// split between creator, dev, and pool
export const DONATION_SPLIT = { creator: 0.70, dev: 0.20, pool: 0.10 };

// ─── GRID ───
export const COLS = 11;
export const ROWS = 16;
export const GRID_PAD = 20;
export const CELL = Math.floor((SW - GRID_PAD * 2) / COLS);

// ─── PHYSICS (Peggle-accurate) ───
export const PHYSICS = {
  GRAVITY: 900,               // ~1.5x scale for fast-paced action
  BALL_R: CELL * 0.25,
  PEG_R: CELL * 0.35,
  BUMPER_R: CELL * 0.40,
  BOUNCE: 0.75,               // Vivace ma controllato
  BUMPER_BOUNCE: 1.5,
  WALL_BOUNCE: 0.8,
  FRICTION: 0.0,              // Nessun attrito
  AIR_DRAG: 0.9998,           // Resistenza aria minima (drag ~0.01)
  MIN_SPEED: 180,
  INITIAL_SHOT_SPEED: 720,
  MAX_SPEED: 950,             // Terminal velocity cap
  MAX_SUB_DISP: 12,
  MAGIC_NUDGE: 1.5,           // Correzione traiettoria spettacolare (px)
  LUCKY_BUCKET_BOOST: 0.4,    // Spinta extra verso bucket
};

// ─── BUCKET ───
export const BUCKET_W = 100;
export const BUCKET_H = 30;
export const BUCKET_SPEED = 160;

// ─── PLAY AREA ───
export const PLAY_TOP = 90;
export const PLAY_H = SH - 190;
export const PLAY_BOT = PLAY_TOP + PLAY_H;

// ─── SCREEN ───
export { SW, SH };

// ─── PEG ELEMENT DEFINITIONS ───
export const ELEMENTS: Record<string, { color: string; label: string; emoji: string; glow?: string; desc?: string }> = {
  empty:        { color: 'transparent', label: 'Erase',        emoji: '🧹', desc: 'Rimuovi elemento' },
  peg_red:      { color: C.orange,      label: 'BTC Peg',      emoji: '🔴', glow: C.orange, desc: 'Peg arancione - Distruggili TUTTI per vincere!' },
  peg_blue:     { color: C.blue,        label: 'SOL Peg',      emoji: '🔵', glow: C.blue, desc: 'Peg blu - Punti bonus' },
  peg_gold:     { color: C.gold,        label: 'SKR Peg',      emoji: '🟡', glow: C.gold, desc: '⭐ SPECIALE: Attiva Multiball! Mettine almeno 2-3' },
  bumper:       { color: C.green,       label: 'Star',         emoji: '⭐', glow: C.green, desc: 'Rimbalzo potenziato + Long Aim' },
  obstacle:     { color: '#6B7280',     label: 'Wall',         emoji: '⬛', desc: 'Blocco solido - non si rompe' },
  curved_left:  { color: '#7B2FBE',     label: 'Curve ←',      emoji: '↩️', desc: 'Curva la pallina a sinistra' },
  curved_right: { color: '#A855F7',     label: 'Curve →',      emoji: '↪️', desc: 'Curva la pallina a destra' },
};

// ─── DIFFICULTIES ───
export const DIFFICULTIES = [
  { key: 'easy', label: 'FACILE', color: C.green, emoji: '🟢' },
{ key: 'medium', label: 'MEDIO', color: C.orange, emoji: '🟠' },
{ key: 'hard', label: 'DIFFICILE', color: C.red, emoji: '🔴' },
];

// Firebase config + Helius RPC are loaded from env vars via utils/firebase.ts and utils/payments.ts
