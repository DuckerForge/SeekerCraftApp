// utils/achievements.ts — SeekerCraft Achievement definitions (v3 — 160+ achievements)
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AchCategory = 'player' | 'creator' | 'social' | 'score' | 'special' | 'duel' | 'donation';

export interface Achievement {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  category: AchCategory;
  points: number;
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common:    '#9CA3AF',
  rare:      '#3B82F6',
  epic:      '#8B5CF6',
  legendary: '#F59E0B',
};

export const RARITY_GLOW: Record<Rarity, string> = {
  common:    'rgba(156,163,175,0.4)',
  rare:      'rgba(59,130,246,0.5)',
  epic:      'rgba(139,92,246,0.6)',
  legendary: 'rgba(245,158,11,0.7)',
};

export const RARITY_POINTS: Record<Rarity, number> = {
  common: 500, rare: 1000, epic: 2000, legendary: 5000,
};

export const ACHIEVEMENTS: Achievement[] = [
  // SPECIAL
  { key:'first_login',       name:'Welcome, Seeker',     description:'Connect your Solana wallet for the first time',          icon:'🔗', rarity:'common',    category:'special',  points:500  },
  { key:'profile_complete',  name:'Identity Set',         description:'Set your display name in Settings',                      icon:'✏️', rarity:'common',    category:'special',  points:500  },
  { key:'beta_player',       name:'Beta Pioneer',         description:'Play during the early access period',                    icon:'🧪', rarity:'epic',      category:'special',  points:2000 },
  { key:'early_bird',        name:'Early Bird',           description:'Play a game between 4 AM and 6 AM',                      icon:'🌅', rarity:'rare',      category:'special',  points:1000 },
  { key:'night_owl',         name:'Night Owl',            description:'Play a game between midnight and 4 AM',                  icon:'🦉', rarity:'rare',      category:'special',  points:1000 },
  { key:'weekend_warrior',   name:'Weekend Warrior',      description:'Play on both Saturday and Sunday in the same week',      icon:'📅', rarity:'common',    category:'special',  points:500  },
  { key:'tutorial_done',     name:'Ready to Play',        description:'Complete the in-game tutorial',                          icon:'📚', rarity:'common',    category:'special',  points:500  },
  { key:'settings_explorer', name:'Settings Explorer',    description:'Visit all tabs in the Settings screen',                  icon:'⚙️', rarity:'common',    category:'special',  points:500  },
  { key:'play_at_midnight',  name:'Midnight Seeker',      description:'Play a game exactly at midnight',                        icon:'🕛', rarity:'rare',      category:'special',  points:1000 },
  { key:'holiday',           name:'Holiday Spirit',       description:'Play on a public holiday',                               icon:'🎉', rarity:'rare',      category:'special',  points:1000 },
  // PLAYER: plays
  { key:'first_play',        name:'First Shot',           description:'Play your very first level',                             icon:'🎯', rarity:'common',    category:'player',   points:500  },
  { key:'plays_10',          name:'Getting Started',      description:'Play 10 levels in total',                                icon:'▶️', rarity:'common',    category:'player',   points:500  },
  { key:'plays_25',          name:'Regular Player',       description:'Play 25 levels in total',                                icon:'🕹️', rarity:'common',    category:'player',   points:500  },
  { key:'plays_50',          name:'Dedicated',            description:'Play 50 levels in total',                                icon:'💪', rarity:'rare',      category:'player',   points:1000 },
  { key:'plays_100',         name:'Century Player',       description:'Play 100 levels in total',                               icon:'💯', rarity:'rare',      category:'player',   points:1000 },
  { key:'plays_250',         name:'Veteran',              description:'Play 250 levels in total',                               icon:'⭐', rarity:'epic',      category:'player',   points:2000 },
  { key:'plays_500',         name:'Elite',                description:'Play 500 levels in total',                               icon:'🏅', rarity:'epic',      category:'player',   points:2000 },
  { key:'plays_1000',        name:'Legend',               description:'Play 1,000 levels in total',                             icon:'👑', rarity:'legendary', category:'player',   points:5000 },
  // PLAYER: wins
  { key:'first_win',         name:'First Victory',        description:'Complete your first level by clearing all SKR',          icon:'🏆', rarity:'common',    category:'player',   points:500  },
  { key:'wins_10',           name:'On a Roll',            description:'Complete 10 levels',                                     icon:'🎊', rarity:'common',    category:'player',   points:500  },
  { key:'wins_25',           name:'Winner',               description:'Complete 25 levels',                                     icon:'🥈', rarity:'rare',      category:'player',   points:1000 },
  { key:'wins_50',           name:'Champion',             description:'Complete 50 levels',                                     icon:'🥇', rarity:'rare',      category:'player',   points:1000 },
  { key:'wins_100',          name:'Master',               description:'Complete 100 levels',                                    icon:'🎖️', rarity:'epic',      category:'player',   points:2000 },
  { key:'wins_250',          name:'Grand Master',         description:'Complete 250 levels',                                    icon:'💎', rarity:'legendary', category:'player',   points:5000 },
  // PLAYER: special
  { key:'last_ball_win',     name:'Clutch',               description:'Win a level using your very last ball',                  icon:'😅', rarity:'rare',      category:'player',   points:1000 },
  { key:'balls_remaining_5', name:'High Efficiency',      description:'Complete a level with 5 or more balls remaining',        icon:'⚡', rarity:'rare',      category:'player',   points:1000 },
  { key:'balls_remaining_10',name:'Untouchable',          description:'Complete a level with 10 or more balls remaining',       icon:'🌟', rarity:'epic',      category:'player',   points:2000 },
  { key:'no_balls_left',     name:'Out of Ammo',          description:'Run out of balls without clearing all SKR',              icon:'😬', rarity:'common',    category:'player',   points:500  },
  { key:'close_call',        name:'Close Call',           description:'Win a level with exactly 1 ball remaining',              icon:'😰', rarity:'rare',      category:'player',   points:1000 },
  { key:'one_ball',          name:'One and Done',         description:'Complete a level using only 1 ball',                     icon:'🎱', rarity:'legendary', category:'player',   points:5000 },
  { key:'two_balls',         name:'Efficient',            description:'Complete a level using only 2 balls',                    icon:'🎯', rarity:'epic',      category:'player',   points:2000 },
  { key:'no_miss',           name:'Perfect Aim',          description:'Complete a level without the ball falling into the pit', icon:'🎯', rarity:'epic',      category:'player',   points:2000 },
  { key:'speed_run',         name:'Speed Runner',         description:'Complete a level in under 30 seconds',                   icon:'⚡', rarity:'epic',      category:'player',   points:2000 },
  { key:'play_1_minute',     name:'Speedster',            description:'Play and complete a level in under 60 seconds',          icon:'⏱️', rarity:'common',    category:'player',   points:500  },
  { key:'lost_5_games',      name:'It Happens',           description:'Lose 5 games — no shame, keep trying!',                  icon:'😭', rarity:'common',    category:'player',   points:500  },
  { key:'lost_25_games',     name:'Resilient',            description:'Lose 25 games and keep playing',                         icon:'💪', rarity:'rare',      category:'player',   points:1000 },
  // PLAYER: daily check-in
  { key:'daily_streak_7',   name:'Week Warrior',         description:'Check in 7 days in a row',                                icon:'🔥', rarity:'rare',      category:'player',   points:1000 },
  { key:'daily_streak_30',  name:'Dedicated',            description:'Check in 30 days in a row',                               icon:'👑', rarity:'legendary', category:'player',   points:5000 },
  // PLAYER: bucket
  { key:'free_ball',         name:'Bucket Catch',         description:'Catch the ball in the moving bucket',                    icon:'🪣', rarity:'common',    category:'player',   points:500  },
  { key:'bucket_10',         name:'Bucket Hoarder',       description:'Catch the ball in the bucket 10 times total',            icon:'🪣', rarity:'rare',      category:'player',   points:1000 },
  { key:'bucket_50',         name:'Bucket God',           description:'Catch the ball in the bucket 50 times total',            icon:'🪣', rarity:'epic',      category:'player',   points:2000 },
  // PLAYER: combos
  { key:'combo_5',           name:'Combo Starter',        description:'Reach a x5 combo in a single shot',                     icon:'✨', rarity:'common',    category:'player',   points:500  },
  { key:'combo_10',          name:'Combo King',           description:'Reach a x10 combo in a single shot',                    icon:'⚡', rarity:'rare',      category:'player',   points:1000 },
  { key:'combo_20',          name:'God Combo',            description:'Reach a x20 or higher combo in a single shot',          icon:'🌩️', rarity:'epic',      category:'player',   points:2000 },
  { key:'bouncer',           name:'Bouncer',              description:'Hit 5 bumpers in a single shot',                         icon:'💫', rarity:'rare',      category:'player',   points:1000 },
  { key:'rainbow_hit',       name:'Rainbow Hitter',       description:'Hit SKR, BTC, SOL and Bumper in the same shot',          icon:'🌈', rarity:'epic',      category:'player',   points:2000 },
  { key:'10_shot_clear',     name:'Sharp Eye',            description:'Clear all SKR using exactly 10 shots',                   icon:'🎯', rarity:'rare',      category:'player',   points:1000 },
  // PLAYER: power-ups
  { key:'first_vortex',      name:'Into the Void',        description:'Get caught by a vortex peg',                             icon:'🌀', rarity:'common',    category:'player',   points:500  },
  { key:'double_vortex',     name:'Double Vortex',        description:'Pass through 2 different vortexes in one game',          icon:'🌀', rarity:'rare',      category:'player',   points:1000 },
  { key:'fever',             name:'Fever Mode',           description:'Activate fever zoom on the last SKR peg',               icon:'🔥', rarity:'rare',      category:'player',   points:1000 },
  { key:'multiball',         name:'Multiball!',           description:'Trigger the multiball power-up from a SOL peg',         icon:'⚡', rarity:'rare',      category:'player',   points:1000 },
  { key:'multiball_win',     name:'Three-Ball Win',       description:'Win a level while multiball is active',                 icon:'🎱', rarity:'epic',      category:'player',   points:2000 },
  { key:'slow_bucket_catch', name:'Slow Catch',           description:'Catch the ball during slow bucket mode',                icon:'🐢', rarity:'rare',      category:'player',   points:1000 },
  { key:'teleport_used',     name:'Portalist',            description:'Pass through a teleporter for the first time',           icon:'🚪', rarity:'common',    category:'player',   points:500  },
  { key:'teleport_chain',    name:'Portal Runner',        description:'Chain through 3 or more teleporters in one shot',        icon:'🌀', rarity:'epic',      category:'player',   points:2000 },
  { key:'fireball',          name:'On Fire',              description:'Activate the fireball power-up',                        icon:'🔥', rarity:'rare',      category:'player',   points:1000 },
  { key:'all_power_ups',     name:'Power Hungry',         description:'Trigger all available power-up types in any games',     icon:'🎰', rarity:'epic',      category:'player',   points:2000 },
  { key:'no_power_ups_win',  name:'Pure Skill',           description:'Win a level without triggering any power-up',            icon:'🤌', rarity:'epic',      category:'player',   points:2000 },
  { key:'long_shot',         name:'Long Shot',            description:'Activate the long shot bonus from a SOL peg',           icon:'🎯', rarity:'common',    category:'player',   points:500  },
  { key:'all_skr',           name:'SKR Collector',        description:'Hit every SKR peg in a single level',                   icon:'💰', rarity:'epic',      category:'player',   points:2000 },
  { key:'perfect_game',      name:'Perfect',              description:'Complete a level without missing a single SKR on first ball',icon:'💯',rarity:'legendary',category:'player', points:5000 },
  { key:'comeback_win',      name:'Never Give Up',        description:'Win after having only 1 ball left and 0 SKR cleared',   icon:'🔥', rarity:'epic',      category:'player',   points:2000 },
  { key:'skr_first_ball',    name:'First Ball Sweep',     description:'Hit all SKR pegs with your very first ball',             icon:'🎯', rarity:'legendary', category:'player',   points:5000 },
  // PLAYER: time
  { key:'hours_1',           name:'Time Invested',        description:'Play for a total of 1 hour',                             icon:'⏱️', rarity:'common',    category:'player',   points:500  },
  { key:'hours_5',           name:'Hobby',                description:'Play for a total of 5 hours',                            icon:'⏰', rarity:'common',    category:'player',   points:500  },
  { key:'hours_10',          name:'Hooked',               description:'Play for a total of 10 hours',                           icon:'⏰', rarity:'rare',      category:'player',   points:1000 },
  { key:'hours_50',          name:'Addicted',             description:'Play for a total of 50 hours',                           icon:'🕰️', rarity:'epic',      category:'player',   points:2000 },
  { key:'hours_100',         name:'No Life',              description:'Play for a total of 100 hours',                          icon:'💀', rarity:'legendary', category:'player',   points:5000 },
  { key:'play_7_days',       name:'Dedicated',            description:'Play on 7 different calendar days',                      icon:'📅', rarity:'rare',      category:'player',   points:1000 },
  { key:'play_30_days',      name:'Loyal',                description:'Play on 30 different calendar days',                     icon:'🗓️', rarity:'epic',      category:'player',   points:2000 },
  // SCORE
  { key:'score_1k',          name:'Scoring',              description:'Score 1,000 points in a single game',                   icon:'💫', rarity:'common',    category:'score',    points:500  },
  { key:'score_5k',          name:'High Scorer',          description:'Score 5,000 points in a single game',                   icon:'✨', rarity:'common',    category:'score',    points:500  },
  { key:'score_10k',         name:'Sharpshooter',         description:'Score 10,000 points in a single game',                  icon:'🌟', rarity:'rare',      category:'score',    points:1000 },
  { key:'score_25k',         name:'Point Machine',        description:'Score 25,000 points in a single game',                  icon:'⭐', rarity:'rare',      category:'score',    points:1000 },
  { key:'score_50k',         name:'Score God',            description:'Score 50,000 points in a single game',                  icon:'💥', rarity:'epic',      category:'score',    points:2000 },
  { key:'score_100k',        name:'Insane Score',         description:'Score 100,000 points in a single game',                 icon:'🏆', rarity:'legendary', category:'score',    points:5000 },
  { key:'total_100k',        name:'Century',              description:'Accumulate 100,000 total score across all games',        icon:'💰', rarity:'epic',      category:'score',    points:2000 },
  { key:'total_500k',        name:'Half Million',         description:'Accumulate 500,000 total score',                         icon:'💎', rarity:'epic',      category:'score',    points:2000 },
  { key:'total_1m',          name:'Millionaire',          description:'Accumulate 1,000,000 total score',                       icon:'👑', rarity:'legendary', category:'score',    points:5000 },
  // CREATOR
  { key:'first_level',       name:'World Builder',        description:'Create your first level in the editor',                  icon:'🏗️', rarity:'common',    category:'creator',  points:500  },
  { key:'levels_5',          name:'Level Pack',           description:'Create 5 levels',                                        icon:'📦', rarity:'common',    category:'creator',  points:500  },
  { key:'levels_10',         name:'Prolific Builder',     description:'Create 10 levels',                                       icon:'⚒️', rarity:'rare',      category:'creator',  points:1000 },
  { key:'levels_25',         name:'Architect',            description:'Create 25 levels',                                       icon:'🏛️', rarity:'epic',      category:'creator',  points:2000 },
  { key:'levels_50',         name:'Master Builder',       description:'Create 50 levels',                                       icon:'🗼', rarity:'epic',      category:'creator',  points:2000 },
  { key:'levels_100',        name:'God Mode',             description:'Create 100 levels',                                      icon:'🌍', rarity:'legendary', category:'creator',  points:5000 },
  { key:'first_publish',     name:'Going Public',         description:'Publish your first game to the community',               icon:'🌐', rarity:'common',    category:'creator',  points:500  },
  { key:'publish_5',         name:'Content Creator',      description:'Publish 5 games to the community',                      icon:'📡', rarity:'rare',      category:'creator',  points:1000 },
  { key:'first_curve',       name:'Curve Ball',           description:'Add a curve track to a level',                          icon:'〰️', rarity:'common',    category:'creator',  points:500  },
  { key:'first_teleport',    name:'Portal Maker',         description:'Add a teleporter pair to a level',                      icon:'🚪', rarity:'common',    category:'creator',  points:500  },
  { key:'full_grid',         name:'Packed House',         description:'Fill the entire grid in a level',                        icon:'📊', rarity:'rare',      category:'creator',  points:1000 },
  { key:'first_vortex_peg',  name:'Vortex Designer',      description:'Place a vortex peg in a level',                         icon:'🌀', rarity:'common',    category:'creator',  points:500  },
  { key:'received_rating',   name:'Reviewed',             description:'Receive your first community rating on a published game',icon:'⭐', rarity:'common',    category:'creator',  points:500  },
  { key:'top_rated',         name:'Top Rated',            description:'Have a published game reach a 4.5 star rating or higher',icon:'🌟', rarity:'epic',      category:'creator',  points:2000 },
  { key:'plays_100_game',    name:'Popular',              description:'Have your published game played 100 times',              icon:'🎮', rarity:'rare',      category:'creator',  points:1000 },
  { key:'plays_1000_game',   name:'Viral',                description:'Have your published game played 1,000 times',            icon:'📈', rarity:'legendary', category:'creator',  points:5000 },
  // SOCIAL
  { key:'rate_level',        name:'Critic',               description:'Rate a community game',                                  icon:'⭐', rarity:'common',    category:'social',   points:500  },
  { key:'rate_10',           name:'Active Critic',        description:'Rate 10 community games',                                icon:'📝', rarity:'rare',      category:'social',   points:1000 },
  { key:'play_community',    name:'Community Player',     description:'Play a game published by another player',                icon:'👥', rarity:'common',    category:'social',   points:500  },
  { key:'play_own',          name:'Self Tester',          description:'Play your own published level',                          icon:'🔄', rarity:'common',    category:'social',   points:500  },
  { key:'first_week_top',    name:'On the Podium',        description:'Reach top 10 on the all-time leaderboard',              icon:'🏅', rarity:'epic',      category:'social',   points:2000 },
  { key:'top_3_ever',        name:'Champion of All',      description:'Reach the top 3 on the all-time leaderboard',           icon:'🥇', rarity:'legendary', category:'social',   points:5000 },
  { key:'share_game',        name:'Broadcaster',          description:'Share a game to X (Twitter)',                            icon:'📢', rarity:'common',    category:'social',   points:500  },
  { key:'play_10_creators',  name:'Explorer',             description:'Play games from 10 different creators',                  icon:'🗺️', rarity:'rare',      category:'social',   points:1000 },
  { key:'play_25_creators',  name:'World Traveller',      description:'Play games from 25 different creators',                  icon:'✈️', rarity:'epic',      category:'social',   points:2000 },
  { key:'play_50_creators',  name:'Community Hero',       description:'Play games from 50 different creators',                  icon:'🦸', rarity:'legendary', category:'social',   points:5000 },
  { key:'view_leaderboard',  name:'Scout',                description:'Check the leaderboard 10 times',                         icon:'👀', rarity:'common',    category:'social',   points:500  },
  // DUELS
  { key:'first_challenge',   name:'First Blood',          description:'Send your first duel challenge to a player',             icon:'⚔️', rarity:'common',    category:'duel',     points:500  },
  { key:'challenge_5',       name:'Challenger',           description:'Send 5 duel challenges',                                 icon:'🥊', rarity:'common',    category:'duel',     points:500  },
  { key:'challenge_10',      name:'Fighter',              description:'Send 10 duel challenges',                                icon:'🏹', rarity:'rare',      category:'duel',     points:1000 },
  { key:'challenge_25',      name:'Gladiator',            description:'Send 25 duel challenges',                                icon:'⚡', rarity:'rare',      category:'duel',     points:1000 },
  { key:'challenge_50',      name:'Warlord',              description:'Send 50 duel challenges',                                icon:'🔥', rarity:'epic',      category:'duel',     points:2000 },
  { key:'challenge_100',     name:'Conqueror',            description:'Send 100 duel challenges',                               icon:'👑', rarity:'legendary', category:'duel',     points:5000 },
  { key:'accept_challenge',  name:'I Accept',             description:'Accept a duel challenge from another player',            icon:'🤝', rarity:'common',    category:'duel',     points:500  },
  { key:'first_duel_win',    name:'Victorious',           description:'Win your first duel',                                    icon:'🏆', rarity:'common',    category:'duel',     points:500  },
  { key:'duel_wins_5',       name:'Duel Master',          description:'Win 5 duels',                                            icon:'🥇', rarity:'rare',      category:'duel',     points:1000 },
  { key:'duel_wins_10',      name:'Champion Duelist',     description:'Win 10 duels',                                           icon:'💎', rarity:'epic',      category:'duel',     points:2000 },
  { key:'duel_wins_25',      name:'Undefeated',           description:'Win 25 duels',                                           icon:'🌟', rarity:'epic',      category:'duel',     points:2000 },
  { key:'duel_wins_50',      name:'Legend Duelist',       description:'Win 50 duels',                                           icon:'⚜️', rarity:'legendary', category:'duel',     points:5000 },
  { key:'duel_loss',         name:'Good Sport',           description:'Lose a duel and immediately start another game',         icon:'😤', rarity:'common',    category:'duel',     points:500  },
  { key:'duel_streak_3',     name:'On Fire',              description:'Win 3 duels in a row without losing',                    icon:'🔥', rarity:'rare',      category:'duel',     points:1000 },
  { key:'duel_streak_5',     name:'Unstoppable',          description:'Win 5 duels in a row without losing',                    icon:'💥', rarity:'epic',      category:'duel',     points:2000 },
  { key:'duel_streak_10',    name:'Invincible',           description:'Win 10 duels in a row without losing',                   icon:'🛡️', rarity:'legendary', category:'duel',     points:5000 },
  { key:'duel_comeback',     name:'Comeback Kid',         description:'Win a duel after being 200+ points behind',              icon:'🔄', rarity:'epic',      category:'duel',     points:2000 },
  { key:'duel_perfect',      name:'Perfect Duel',         description:'Win a duel without missing a single SKR peg',            icon:'💯', rarity:'legendary', category:'duel',     points:5000 },
  // DONATIONS
  { key:'first_donation',    name:'Generous',             description:'Make your first SKR donation to another player',         icon:'💸', rarity:'common',    category:'donation', points:500  },
  { key:'donations_5',       name:'Supporter',            description:'Donate to 5 different players',                          icon:'🤲', rarity:'rare',      category:'donation', points:1000 },
  { key:'donations_10',      name:'Patron',               description:'Donate to 10 different players',                         icon:'🎁', rarity:'epic',      category:'donation', points:2000 },
  { key:'donations_25',      name:'Benefactor',           description:'Donate to 25 different players',                         icon:'🌸', rarity:'legendary', category:'donation', points:5000 },
  { key:'donation_received', name:'Fan Favourite',        description:'Receive your first donation from another player',        icon:'🌟', rarity:'rare',      category:'donation', points:1000 },
  { key:'donation_received_10',name:'Community Star',     description:'Receive 10 donations from players',                      icon:'⭐', rarity:'epic',      category:'donation', points:2000 },
  { key:'donation_big',      name:'Whale',                description:'Send a single donation of $15 or more in SKR',       icon:'🐋', rarity:'epic',      category:'donation', points:2000 },
  { key:'donation_total_50', name:'Big Spender',          description:'Donate a total of $50 in SKR across all time',       icon:'💰', rarity:'legendary', category:'donation', points:5000 },
];

export const ACHIEVEMENT_MAP: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map(a => [a.key, a])
);

export const ACHIEVEMENT_CATEGORIES: AchCategory[] = [
  'player', 'score', 'creator', 'duel', 'donation', 'social', 'special'
];

export const CATEGORY_LABELS: Record<AchCategory, string> = {
  player:'PLAYER', score:'SCORE', creator:'CREATOR',
  duel:'DUELS', donation:'DONATIONS', social:'SOCIAL', special:'SPECIAL',
};

export const CATEGORY_ICONS: Record<AchCategory, string> = {
  player:'🎯', score:'💯', creator:'🏗️',
  duel:'⚔️', donation:'💸', social:'👥', special:'✨',
};
