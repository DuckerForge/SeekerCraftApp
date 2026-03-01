// utils/firebase.ts - SeekerCraft Firebase config + DB helpers (v2)
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, ref, set, get, update, push, onValue, serverTimestamp, increment } from 'firebase/database';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: extra.firebaseApiKey,
  authDomain: extra.firebaseAuthDomain,
  databaseURL: extra.firebaseDatabaseUrl,
  projectId: extra.firebaseProjectId,
  storageBucket: extra.firebaseStorageBucket,
  messagingSenderId: extra.firebaseMessagingSenderId,
  appId: extra.firebaseAppId,
  measurementId: extra.firebaseMeasurementId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const database = getDatabase(app);

// ─── FIREBASE DB SCHEMA ───────────────────────────────────────────────────────
//
// /config/prices/
//   access_key_usd: number          (default 1.0)
//   access_key_duration_ms: number  (default 60000 = 1 min for test)
//   publish_fee_usd: number         (default 0.25)
//   achievement_fee_usd: number     (default 0.50)
//   dev_percent: number             (default 60)
//
// /users/{walletAddress}/
//   displayName: string
//   avatarSeed: string
//   createdAt: number
//   totalScore: number
//   levelsPlayed: number
//   levelsCreated: number
//   levelsCompleted: number
//   minutesPlayed: number
//   weeklyScore: number
//   weekYear: string
//   access_key_until: number        (timestamp)
//   achievements: { [key]: unlockedAt }
//   challenge_notifications: { [challengeId]: { from, fromName, ts, seen } }
//
// /games/public/{gameId}/
//   creatorWallet, creatorName, name, levels, plays, completions,
//   votesSum, votesCount, rating, createdAt, description
//
// /challenges/{challengeId}/
//   ...same as before + notified fields

// ─── INIT DEFAULT CONFIG (run once from admin) ───────────────────────────────
export const initDefaultConfig = async () => {
  const snap = await get(ref(database, 'config/prices'));
  if (!snap.exists()) {
    await set(ref(database, 'config/prices'), {
      access_key_usd: 1.0,
      access_key_duration_ms: 60000,   // 1 min for testing
      publish_fee_usd: 0.25,
      achievement_fee_usd: 0.50,
      dev_percent: 60,
    });
  }
};

// ─── USER HELPERS ─────────────────────────────────────────────────────────────

export const getOrCreateUser = async (walletAddress: string, displayName?: string) => {
  const userRef = ref(database, `users/${walletAddress}`);
  const snap = await get(userRef);
  if (snap.exists()) return snap.val();

  const newUser = {
    displayName: displayName || `${walletAddress.slice(0,4)}...${walletAddress.slice(-4)}`,
    avatarSeed: walletAddress.slice(-8),
    createdAt: Date.now(),
    totalScore: 0,
    levelsPlayed: 0,
    levelsCreated: 0,
    levelsCompleted: 0,
    minutesPlayed: 0,
    weeklyScore: 0,
    weekYear: getCurrentWeek(),
    achievements: {},
  };
  await set(userRef, newUser);
  return newUser;
};

export const updateUserStats = async (
  walletAddress: string,
  delta: {
    score?: number;
    levelsPlayed?: number;
    levelsCompleted?: number;
    minutesPlayed?: number;
    levelsCreated?: number;
  }
) => {
  const userRef = ref(database, `users/${walletAddress}`);
  const updates: any = {};
  if (delta.score)            { updates.totalScore     = increment(delta.score);          updates.weeklyScore = increment(delta.score); }
  if (delta.levelsPlayed)     updates.levelsPlayed     = increment(delta.levelsPlayed);
  if (delta.levelsCompleted)  updates.levelsCompleted  = increment(delta.levelsCompleted);
  if (delta.minutesPlayed)    updates.minutesPlayed    = increment(delta.minutesPlayed);
  if (delta.levelsCreated)    updates.levelsCreated    = increment(delta.levelsCreated);

  const week = getCurrentWeek();
  const weekRef = ref(database, `weekly_leaderboard/${week}/${walletAddress}`);
  await update(userRef, updates);
  if (delta.score) {
    const snap = await get(userRef);
    if (snap.exists()) {
      await update(weekRef, {
        score: increment(delta.score),
        displayName: snap.val().displayName,
        walletAddress,
      });
    }
  }
};

// ─── GAME HELPERS ─────────────────────────────────────────────────────────────

export const publishGame = async (walletAddress: string, gameData: any) => {
  const gamesRef = ref(database, 'games/public');
  const newRef = push(gamesRef);
  const snap = await get(ref(database, `users/${walletAddress}`));
  const creatorName = snap.exists() ? snap.val().displayName : walletAddress.slice(0,8);

  await set(newRef, {
    ...gameData,
    creatorWallet: walletAddress,
    creatorName,
    plays: 0,
    completions: 0,
    votesSum: 0,
    votesCount: 0,
    rating: 0,
    createdAt: Date.now(),
  });

  // Increment levelsCreated counter
  await updateUserStats(walletAddress, { levelsCreated: 1 });
  return newRef.key;
};

export const recordGamePlay = async (gameId: string, walletAddress: string) => {
  await update(ref(database, `games/public/${gameId}`), { plays: increment(1) });
  await updateUserStats(walletAddress, { levelsPlayed: 1, minutesPlayed: 3 });
};

export const recordGameCompletion = async (
  gameId: string,
  walletAddress: string,
  score: number,
  minutesPlayed: number
) => {
  await update(ref(database, `games/public/${gameId}`), { completions: increment(1) });
  await updateUserStats(walletAddress, {
    levelsCompleted: 1,
    score,
    minutesPlayed,
  });
};

export const submitRating = async (
  gameId: string,
  walletAddress: string,
  stars: number
): Promise<boolean> => {
  const ratingRef = ref(database, `ratings/${gameId}/${walletAddress}`);
  const existing = await get(ratingRef);
  if (existing.exists()) return false;

  await set(ratingRef, { stars, ratedAt: Date.now() });
  await update(ref(database, `games/public/${gameId}`), {
    votesSum: increment(stars),
    votesCount: increment(1),
  });

  const gameSnap = await get(ref(database, `games/public/${gameId}`));
  if (gameSnap.exists()) {
    const g = gameSnap.val();
    const newRating = (g.votesSum + stars) / (g.votesCount + 1);
    await update(ref(database, `games/public/${gameId}`), { rating: Math.round(newRating * 10) / 10 });
  }

  return true;
};

export const deletePublishedGame = async (gameId: string, walletAddress: string): Promise<boolean> => {
  const snap = await get(ref(database, `games/public/${gameId}`));
  if (!snap.exists()) return false;
  if (snap.val().creatorWallet !== walletAddress) return false;
  await set(ref(database, `games/public/${gameId}`), null);
  return true;
};

// ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

export const unlockAchievement = async (walletAddress: string, key: string): Promise<boolean> => {
  const achRef = ref(database, `users/${walletAddress}/achievements/${key}`);
  const snap = await get(achRef);
  if (snap.exists()) return false;
  await set(achRef, Date.now());
  return true;
};

export const getUserAchievements = async (walletAddress: string): Promise<Record<string, number>> => {
  const snap = await get(ref(database, `users/${walletAddress}/achievements`));
  return snap.exists() ? snap.val() : {};
};

// ─── LEADERBOARD ──────────────────────────────────────────────────────────────

export const getWeeklyLeaderboard = async (): Promise<any[]> => {
  const week = getCurrentWeek();
  const snap = await get(ref(database, `weekly_leaderboard/${week}`));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([wallet, data]: any) => ({ wallet, ...data }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);
};

export const getAllTimeLeaderboard = async (): Promise<any[]> => {
  const snap = await get(ref(database, 'users'));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([wallet, data]: any) => ({ walletAddress: wallet, wallet, ...data }))
    .sort((a: any, b: any) => b.totalScore - a.totalScore)
    .slice(0, 50);
};

// ─── NEWS ─────────────────────────────────────────────────────────────────────

export const getNews = async (): Promise<any[]> => {
  const snap = await get(ref(database, 'news'));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([id, data]: any) => ({ id, ...data }))
    .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);
};

// Admin: post an announcement to Firebase (call from admin page with dev wallet)
export const postAnnouncement = async (params: {
  title: string;
  body: string;
  tag?: string;   // 'UPDATE' | 'EVENT' | 'TIP' | 'URGENT'
  devWallet: string;
  DEV_WALLETS: string[];
}): Promise<{success:boolean; error?:string}> => {
  const { title, body, tag='UPDATE', devWallet, DEV_WALLETS } = params;
  if (!DEV_WALLETS.includes(devWallet)) return { success:false, error:'Not authorized' };
  try {
    const id = `ann_${Date.now()}`;
    await set(ref(database, `news/${id}`), {
      id, title, body, tag,
      createdAt: Date.now(),
      authorWallet: devWallet,
    });
    return { success:true };
  } catch (e:any) { return { success:false, error: e.message }; }
};

// ─── ACTIVITY FEED ────────────────────────────────────────────────────────────

export type ActivityType =
  | 'name_changed' | 'game_created' | 'level_completed'
  | 'achievement_unlocked' | 'game_published' | 'joined'
  | 'challenge_sent' | 'challenge_won' | 'access_key_bought'
  | 'donation_sent';

export const logActivity = async (
  walletAddress: string,
  displayName: string,
  type: ActivityType,
  detail?: string
) => {
  try {
    const feedRef = ref(database, 'activity_feed');
    const newRef = push(feedRef);
    await set(newRef, {
      walletAddress,
      displayName,
      type,
      detail: detail || '',
      ts: Date.now(),
    });
  } catch {}
};

export const getActivityFeed = async (limit = 30): Promise<any[]> => {
  const snap = await get(ref(database, 'activity_feed'));
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([id, data]: any) => ({ id, ...data }))
    .sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
};

// ─── ONBOARDING ───────────────────────────────────────────────────────────────

export const hasSeenOnboarding = async (walletAddress: string): Promise<boolean> => {
  const snap = await get(ref(database, `users/${walletAddress}/onboardingDone`));
  return snap.exists() && snap.val() === true;
};

export const markOnboardingDone = async (walletAddress: string) => {
  await update(ref(database, `users/${walletAddress}`), { onboardingDone: true });
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

export const getCurrentWeek = (): string => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

// ─── CHALLENGES ──────────────────────────────────────────────────────────────

export const createChallenge = async (
  challengerWallet: string,
  challengerName: string,
  challengedWallet: string,
  challengedName: string,
  gameId?: string,
  gameName?: string,
): Promise<string> => {
  const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2,6)}`
  await set(ref(database, `challenges/${id}`), {
    id,
    challengerWallet,
    challengerName,
    challengedWallet,
    challengedName,
    gameId: gameId || null,
    gameName: gameName || null,
    status: 'pending',        // pending → accepted → completed
    challengerScore: null,
    challengedScore: null,
    challengerTime: null,
    challengedTime: null,
    winnerWallet: null,
    createdAt: Date.now(),
  })

  // Send notification to challenged player
  await set(ref(database, `users/${challengedWallet}/challenge_notifications/${id}`), {
    from: challengerWallet,
    fromName: challengerName,
    gameId: gameId || null,
    gameName: gameName || null,
    ts: Date.now(),
    seen: false,
  })

  await logActivity(challengerWallet, challengerName, 'challenge_sent', challengedName)
  return id
}

export const acceptChallenge = async (
  challengeId: string,
  walletAddress: string,
): Promise<void> => {
  await update(ref(database, `challenges/${challengeId}`), { status: 'accepted' })
  await update(ref(database, `users/${walletAddress}/challenge_notifications/${challengeId}`), { seen: true })
}

export const declineChallenge = async (
  challengeId: string,
  walletAddress: string,
): Promise<void> => {
  await update(ref(database, `challenges/${challengeId}`), { status: 'declined' })
  await update(ref(database, `users/${walletAddress}/challenge_notifications/${challengeId}`), { seen: true })
}

export const markChallengeNotificationSeen = async (walletAddress: string, challengeId: string) => {
  await update(ref(database, `users/${walletAddress}/challenge_notifications/${challengeId}`), { seen: true })
}

export const getChallengeNotifications = async (walletAddress: string): Promise<any[]> => {
  const snap = await get(ref(database, `users/${walletAddress}/challenge_notifications`))
  if (!snap.exists()) return []
  return Object.entries(snap.val())
    .map(([id, data]: any) => ({ id, ...data }))
    .filter((n: any) => !n.seen)
    .sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0))
}

export const submitChallengeResult = async (
  challengeId: string,
  walletAddress: string,
  score: number,
  timeSeconds: number,
) => {
  const snap = await get(ref(database, `challenges/${challengeId}`))
  if (!snap.exists()) return
  const ch = snap.val()
  const isChallenger = ch.challengerWallet === walletAddress
  const updates: any = {}
  if (isChallenger) {
    updates.challengerScore = score
    updates.challengerTime  = timeSeconds
  } else {
    updates.challengedScore = score
    updates.challengedTime  = timeSeconds
  }
  const newCh = { ...ch, ...updates }
  // Only complete when BOTH players have actually submitted a numeric score
  const bothPlayed = typeof newCh.challengerScore === 'number' && typeof newCh.challengedScore === 'number'
  if (bothPlayed) {
    updates.status = 'completed'
    const cScore = newCh.challengerScore, dScore = newCh.challengedScore
    const cTime  = newCh.challengerTime,  dTime  = newCh.challengedTime
    const winnerId = cScore > dScore ? newCh.challengerWallet
      : dScore > cScore ? newCh.challengedWallet
      : (cTime || 9999) < (dTime || 9999)  ? newCh.challengerWallet
      : newCh.challengedWallet
    const winnerName = winnerId === newCh.challengerWallet ? newCh.challengerName : newCh.challengedName
    const loserName = winnerId === newCh.challengerWallet ? newCh.challengedName : newCh.challengerName
    updates.winnerWallet = winnerId
    await logActivity(winnerId, winnerName, 'challenge_won', `vs ${loserName}`)
  }
  await update(ref(database, `challenges/${challengeId}`), updates)
}

export const getPendingChallenges = async (walletAddress: string): Promise<any[]> => {
  const snap = await get(ref(database, 'challenges'))
  if (!snap.exists()) return []
  return Object.values(snap.val()).filter((c: any) =>
    (c.challengerWallet === walletAddress || c.challengedWallet === walletAddress)
    && c.status !== 'completed'
  )
}

export const getAllChallenges = async (walletAddress: string): Promise<any[]> => {
  const snap = await get(ref(database, 'challenges'))
  if (!snap.exists()) return []
  return Object.values(snap.val())
    .filter((c: any) =>
      c.challengerWallet === walletAddress || c.challengedWallet === walletAddress
    )
    .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
}

export const getDuelRecord = async (walletAddress: string): Promise<{ wins: number; losses: number; draws: number }> => {
  const snap = await get(ref(database, 'challenges'))
  if (!snap.exists()) return { wins: 0, losses: 0, draws: 0 }
  let wins = 0, losses = 0, draws = 0
  Object.values(snap.val()).forEach((c: any) => {
    if (c.status !== 'completed') return
    if (c.challengerWallet !== walletAddress && c.challengedWallet !== walletAddress) return
    if (c.winnerWallet === walletAddress) wins++
    else if (c.challengerScore === c.challengedScore) draws++
    else losses++
  })
  return { wins, losses, draws }
}

export const getPublicGames = async (): Promise<any[]> => {
  const snap = await get(ref(database, 'games/public'))
  if (!snap.exists()) return []
  return Object.entries(snap.val()).map(([id, data]: any) => ({ id, ...data }))
}
