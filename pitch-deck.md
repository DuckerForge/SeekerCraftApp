# SEEKERCRAFT - PITCH DECK
# Copy each section as a separate Google Slide

---

## SLIDE 1 — TITLE

SEEKERCRAFT
Shoot. Build. Conquer.

A Peggle-style physics game built natively for Solana Mobile
with SKR token integration & on-chain payments.

solanamobile | expo | firebase | SKR

---

## SLIDE 2 — THE PROBLEM

Mobile gaming on Solana lacks engaging, casual games
that truly leverage on-chain features.

- Most Solana games are DeFi wrappers, not real games
- No community-driven level creation on mobile
- No real player-to-player competition with on-chain stakes
- SKR token has limited utility in the gaming ecosystem

---

## SLIDE 3 — THE SOLUTION

SeekerCraft: a full-featured physics game where
every interaction is Solana-native.

PLAY — Addictive Peggle-style ball physics
BUILD — Create & publish levels for the community
COMPETE — PvP duels with on-chain score submission
EARN — 160+ achievements with on-chain unlocks
TIP — Reward creators with SKR tokens (90% to creator)

---

## SLIDE 4 — HOW IT WORKS

1. Connect Solana wallet via Mobile Wallet Adapter
2. Shoot balls to hit all golden SKR pegs
3. Power-ups: Multiball, Fireball, Slow Bucket, Long Shot
4. Cinematic Peggle 2-style slow-mo on last peg
5. Moving bucket catches = free bonus ball
6. Build combos up to 10x multiplier

---

## SLIDE 5 — KEY FEATURES

LEVEL EDITOR
- 12x16 grid with 7 peg types
- Curves, vortexes, teleporters, moving walls
- Publish to community for $0.50 SOL

COMMUNITY
- Browse & play other players' levels
- Rate games (1-5 stars)
- Real-time activity feed
- Global leaderboard (all-time + weekly)

PVP DUELS
- Challenge any player on the leaderboard
- Both play same level — highest score wins
- On-chain score submission via Firebase

160+ ACHIEVEMENTS
- 7 categories: Player, Score, Creator, Duel, Donation, Social, Special
- On-chain unlock with SOL payment ($0.50)
- Rarity tiers: Common, Rare, Epic, Legendary

---

## SLIDE 6 — SKR TOKEN INTEGRATION

SeekerCraft deeply integrates the SKR (Seeker) token:

DONATIONS
- Tip level creators with SKR tokens
- 90% goes to creator, 10% to dev fund
- Preset amounts ($0.50 / $5 / $15) or custom SKR amount

ON-CHAIN TRANSACTIONS
- SPL token transfers via Mobile Wallet Adapter
- Auto-creates Associated Token Accounts
- Real-time SKR balance checks
- Full TX preview before signing (Peggle-style UI)

ACHIEVEMENTS
- SKR-themed golden pegs (hit all to win)
- SKR balance display in rankings
- Donation milestones unlock achievements

---

## SLIDE 7 — TECH STACK

Frontend: Expo / React Native (expo-router)
Graphics: @shopify/react-native-skia (Canvas rendering)
Physics: react-native-reanimated (60fps worklet-based)
Wallet: @solana-mobile/mobile-wallet-adapter-protocol-web3js
Blockchain: @solana/web3.js + @solana/spl-token
Backend: Firebase Realtime Database
Audio: expo-audio (5 music tracks + 8 SFX)
Security: dotenv + expo-constants (no hardcoded keys)

All on-chain operations:
- SOL transfers (publish fee, achievement unlock)
- SKR SPL token transfers (donations)
- Priority fees (ComputeBudgetProgram)
- Full MWA authorize/sign/confirm flow

---

## SLIDE 8 — MOBILE-FIRST DESIGN

Built exclusively for Seeker / Solana Mobile:

- Touch-based aiming (drag & release)
- Haptic feedback on every interaction
- Portrait-optimized UI (Candy Crush style)
- Animated sparkle particles + gradient backgrounds
- 4 alternating background music tracks per session
- Cinematic slow-motion zoom on final peg hit
- Edge-to-edge Android support
- Offline level editing with cloud sync

---

## SLIDE 9 — TRACTION & NUMBERS

- 160+ achievements across 7 categories
- 7 peg types + curves + teleporters + moving walls
- 5 power-up types (Multiball, Fireball, Slow Bucket, Long Shot, Vortex)
- Full PvP duel system with matchmaking
- Real-time leaderboard + activity feed
- Community level marketplace with ratings
- 8 custom sound effects + 5 music tracks

Built by a solo developer in ~3 months.

---

## SLIDE 10 — ROADMAP

Q1 2026 (NOW)
- Hackathon submission
- Solana dApp Store listing
- Community beta launch

Q2 2026
- Tournament mode (weekly competitions)
- Level packs (curated collections)
- Enhanced SKR rewards system

Q3 2026
- Multiplayer real-time mode
- NFT level ownership
- Cross-platform web version

Q4 2026
- DAO governance for community decisions
- Creator monetization dashboard
- Seasonal events & limited achievements

---

## SLIDE 11 — TEAM

DuckerForge
Solo Developer & Game Designer

Full-stack mobile developer specializing in
React Native, Solana, and game physics.

GitHub: github.com/DuckerForge
X: @SeekerCraftApp

---

## SLIDE 12 — CALL TO ACTION

SeekerCraft brings real gaming to Solana Mobile.

Play. Build. Compete. Earn. Tip.
All on-chain. All on Seeker.

github.com/DuckerForge/SeekerCraftApp
