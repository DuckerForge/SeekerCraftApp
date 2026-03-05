// app/game-play.tsx - Play Game Levels in Sequence
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Alert, Image, Dimensions, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitRating, recordGameCompletion, recordGamePlay, logActivity, submitChallengeResult, getOrCreateUser } from '@/utils/firebase';
import { payDonation, getSKRPriceUSD, getSKRBalance } from '@/utils/payments';
import { useWallet } from '@/utils/walletContext';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';

const ICON_PLAY = require('../assets/images/Icons/play.png');

const C = {
  bg1: '#0B0033',
  bg2: '#1A0066',
  gold: '#FFD700',
  orange: '#FF6B00',
  purple: '#7B2FBE',
  blue: '#3B82F6',
  blueLight: '#60A5FA',
  red: '#EF4444',
  green: '#22C55E',
  surface: 'rgba(255,255,255,0.07)',
  card: 'rgba(30,10,60,0.85)',
  cardBorder: 'rgba(255,255,255,0.1)',
  text: '#FFF',
  textMuted: 'rgba(255,255,255,0.55)',
  success: '#22C55E',
};

interface LevelData {
  id?: string;
  name: string;
  grid: any[][];
  balls: number;
}

interface GameData {
  id: string;
  name: string;
  creator: string;
  levels: LevelData[];
}

// ─── Milestone achievement checker ─────────────────────────────────────────
const checkMilestoneAchievements = (counts: {
  levelsPlayed?: number;
  levelsCompleted?: number;
  totalScore?: number;
  gameScore?: number;
  elapsedSeconds?: number;
}) => {
  const show = (global as any).showAchievement;
  if (!show) return;
  const { levelsPlayed, levelsCompleted, totalScore, gameScore, elapsedSeconds } = counts;
  // Play count milestones
  if (levelsPlayed != null) {
    const playMilestones: Record<number, string> = {1:'first_play',10:'plays_10',25:'plays_25',50:'plays_50',100:'plays_100',250:'plays_250',500:'plays_500',1000:'plays_1000'};
    Object.entries(playMilestones).forEach(([n, key]) => { if (levelsPlayed >= Number(n)) show(key); });
  }
  // Win count milestones
  if (levelsCompleted != null) {
    const winMilestones: Record<number, string> = {1:'first_win',10:'wins_10',25:'wins_25',50:'wins_50',100:'wins_100',250:'wins_250'};
    Object.entries(winMilestones).forEach(([n, key]) => { if (levelsCompleted >= Number(n)) show(key); });
  }
  // Single-game score milestones
  if (gameScore != null) {
    const scoreMilestones: Record<number, string> = {1000:'score_1k',5000:'score_5k',10000:'score_10k',25000:'score_25k',50000:'score_50k',100000:'score_100k'};
    Object.entries(scoreMilestones).forEach(([n, key]) => { if (gameScore >= Number(n)) show(key); });
  }
  // Total score milestones
  if (totalScore != null) {
    if (totalScore >= 100000) show('total_100k');
    if (totalScore >= 500000) show('total_500k');
    if (totalScore >= 1000000) show('total_1m');
  }
  // Time-based achievements
  if (elapsedSeconds != null) {
    if (elapsedSeconds <= 60) show('play_1_minute');
    if (elapsedSeconds <= 30) show('speed_run');
  }
};

export default function GamePlayScreen() {
  const {t}=useTranslation();
  const startPlayer = useAudioPlayer(require('../assets/images/tools/Start.mp3'));
  const backPlayer  = useAudioPlayer(require('../assets/images/tools/back.mp3'));
  // Alternating level music tracks (music2-5, no main.mp3 which is the global loop)
  const music2 = useAudioPlayer(require('../assets/images/tools/music2.mp3'));
  const music3 = useAudioPlayer(require('../assets/images/tools/music3.mp3'));
  const music4 = useAudioPlayer(require('../assets/images/tools/music4.mp3'));
  const music5 = useAudioPlayer(require('../assets/images/tools/music5.mp3'));
  const musicPlayers = [music2, music3, music4, music5];
  const activeMusicRef = useRef<any>(null);
  const mutedRef = useRef(false);

  useEffect(()=>{
    AsyncStorage.getItem('global_muted').then(v=>{mutedRef.current=v==='1';});
    const {DeviceEventEmitter}=require('react-native');
    const sub=DeviceEventEmitter.addListener('MUTE_CHANGED',({muted}:{muted:boolean})=>{
      mutedRef.current=muted;
      try{muted?activeMusicRef.current?.pause?.():activeMusicRef.current?.play();}catch{}
    });
    return()=>sub.remove();
  },[]);

  const playLevelMusic=(levelIndex:number)=>{
    // Stop previous track
    try{activeMusicRef.current?.pause?.();}catch{}
    if(mutedRef.current)return;
    const track=musicPlayers[levelIndex%musicPlayers.length];
    activeMusicRef.current=track;
    try{track.loop=true;track.seekTo(0);track.play();}catch{}
  };

  const stopLevelMusic=()=>{
    try{activeMusicRef.current?.pause?.();}catch{}
    activeMusicRef.current=null;
  };

  const playStart = () => { if(mutedRef.current)return; try { startPlayer.seekTo(0); startPlayer.play(); } catch {} };
  const playBack  = () => { if(mutedRef.current)return; try { backPlayer.seekTo(0);  backPlayer.play();  } catch {} };
  const [game, setGame] = useState<GameData | null>(null);
  const [isDuel, setIsDuel] = useState(false);
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showLevelStart, setShowLevelStart] = useState(true);
  const [showLevelComplete, setShowLevelComplete] = useState(false);
  const [showGameComplete, setShowGameComplete] = useState(false);
  const [gameStartTime, setGameStartTime] = useState(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [levelScore, setLevelScore] = useState(0);
  const [ratingGiven, setRatingGiven] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const { user } = useWallet();
  const [totalScore, setTotalScore] = useState(0);
  const [donating, setDonating] = useState(false);
  const [donationDone, setDonationDone] = useState(false);
  const [donationAmount, setDonationAmount] = useState<number | null>(null);
  const [skrPrice, setSkrPrice] = useState(0.02);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [customDonationAmt, setCustomDonationAmt] = useState('');
  const [showTxPreview, setShowTxPreview] = useState(false);
  const [txPreview, setTxPreview] = useState<{skr:number;usd:string}|null>(null);

  useEffect(() => {
    // Pause global music, play level-specific track
    const {DeviceEventEmitter: DE}=require('react-native');
    DE.emit('PAUSE_GLOBAL_MUSIC');
    loadGame();
    getSKRPriceUSD().then(p=>{if(p)setSkrPrice(p);}).catch(()=>{});
    return () => {
      stopLevelMusic();
      DE.emit('RESUME_GLOBAL_MUSIC');
    };
  }, []);

  // Quando test-play finisce e fa router.back() → game-play torna in focus
  // Leggiamo AsyncStorage per sapere se il livello è stato completato
  // Timer di gioco
  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  useFocusEffect(useCallback(() => {
    // Re-pause global main.mp3 every time we return here (test-play cleanup resumes it)
    const {DeviceEventEmitter: DE2} = require('react-native');
    DE2.emit('PAUSE_GLOBAL_MUSIC');

    const checkLevelResult = async () => {
      const result = await AsyncStorage.getItem('level_result');
      if (!result) return;
      await AsyncStorage.removeItem('level_result');
      const { victory, score } = JSON.parse(result);
      if (victory) {
        handleLevelComplete(score);
      }
    };
    checkLevelResult();
  }, [handleLevelComplete]));

  const loadGame = async () => {
    try {
      await AsyncStorage.removeItem('level_result'); // Pulisce risultato stale da partita precedente
      const gameData = await AsyncStorage.getItem('community_game');
      if (gameData) {
        const g: GameData = JSON.parse(gameData);
        setGame(g);
        // Detect duel mode
        const chId = await AsyncStorage.getItem('active_challenge_id');
        setIsDuel(!!chId);
        if (g.levels && g.levels.length > 0) {
          // Carica il primo livello
          await loadLevel(g.levels[0]);
          playLevelMusic(0);
        }
      } else {
        router.back();
      }
    } catch (error) {
      console.error('Error loading game:', error);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadLevel = async (level: LevelData) => {
    try {
      // Parse grid/curves back from JSON strings (Firebase corrupts multidimensional arrays)
      const parsedLevel = {
        ...level,
        grid:   typeof level.grid   === 'string' ? JSON.parse(level.grid)   : (level.grid   || []),
        curves: typeof level.curves === 'string' ? JSON.parse(level.curves) : (level.curves || []),
      };
      await AsyncStorage.setItem('current_level_draft', JSON.stringify(parsedLevel));
      setShowLevelStart(true);
    } catch (error) {
      console.error('Error loading level:', error);
    }
  };

  const startLevel = async () => {
    setShowLevelStart(false);
    if (!timerActive) {
      setGameStartTime(Date.now());
      setElapsedSeconds(0);
      setTimerActive(true);
    }
    // Record play + check play-count achievements
    if (user?.walletAddress && game && currentLevelIndex === 0) {
      recordGamePlay(game.id, user.walletAddress).catch(() => {});
      try {
        const u = await getOrCreateUser(user.walletAddress);
        checkMilestoneAchievements({ levelsPlayed: (u.levelsPlayed || 0) + 1 });
      } catch {}
    }
    stopLevelMusic(); // test-play has its own loop.mp3 — stop ours first
    router.push('/test-play');
  };

  const handleLevelComplete = (score: number) => {
    setLevelScore(score);
    setTotalScore(prev => prev + score);
    setShowLevelComplete(true);
  };

  const nextLevel = async () => {
    if (!game) return;

    const nextIndex = currentLevelIndex + 1;
    
    if (nextIndex < game.levels.length) {
      setCurrentLevelIndex(nextIndex);
      await loadLevel(game.levels[nextIndex]);
      playLevelMusic(nextIndex); // alternate music per level
      setShowLevelComplete(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Log singola vittoria livello nel feed
      if (user?.walletAddress && game) {
        const levelName = game.levels[currentLevelIndex]?.name || game.name;
        logActivity(user.walletAddress, user.displayName || 'Player', 'level_completed', levelName).catch(() => {});
      }
    } else {
      // Gioco completato!
      setShowLevelComplete(false);
      setShowGameComplete(true);
      setTimerActive(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Salva score e statistiche su Firebase + check achievements
      if (user?.walletAddress && game) {
        const minutesPlayed = Math.ceil((Date.now() - gameStartTime) / 60000)
        recordGameCompletion(game.id, user.walletAddress, totalScore, minutesPlayed).catch(() => {})
        logActivity(user.walletAddress, user.displayName || 'Player', 'level_completed', game.name).catch(() => {})
        // Check win/score/time achievements
        getOrCreateUser(user.walletAddress).then(u => {
          checkMilestoneAchievements({
            levelsCompleted: (u.levelsCompleted || 0) + 1,
            totalScore: (u.totalScore || 0) + totalScore,
            gameScore: totalScore,
            elapsedSeconds,
          });
        }).catch(() => {});
        // Submit challenge result if playing in duel mode
        AsyncStorage.getItem('active_challenge_id').then(async chId => {
          if (chId) {
            submitChallengeResult(chId, user.walletAddress, totalScore, elapsedSeconds).catch(() => {});
            AsyncStorage.removeItem('active_challenge_id');
            // Anti-cheat: mark challenge played so test-play blocks replay
            AsyncStorage.setItem(`challenge_played_${chId}`, '1').catch(() => {});
            // NOTE: duel win achievements fire ONLY when checking result after opponent plays
          }
        }).catch(() => {});
      }
    }
  };

  const restartGame = async () => {
    setCurrentLevelIndex(0);
    setTotalScore(0);
    setLevelScore(0);
    setShowGameComplete(false);
    if (game && game.levels.length > 0) {
      await loadLevel(game.levels[0]);
    }
  };

  const exitGame = () => {
    router.back();
  };

  const handleRating = async (stars: number) => {
    if (!game || !user?.walletAddress || ratingSubmitted) return;
    setRatingGiven(stars);
    try {
      await submitRating(game.id, user.walletAddress, stars);
      setRatingSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  };

  const handleDonatePreview = (skrAmount: number) => {
    if (!game || !user?.walletAddress || donating) return;
    const usd = (skrAmount * skrPrice).toFixed(2);
    setTxPreview({ skr: skrAmount, usd });
    setShowDonationModal(false);
    setShowTxPreview(true);
  };

  const confirmDonate = async () => {
    if (!txPreview || !game || !user?.walletAddress) return;
    const creatorWallet = (game as any).creatorWallet;
    if (!creatorWallet) return;
    setShowTxPreview(false);
    setDonating(true);
    setDonationAmount(txPreview.skr);
    try {
      const balance = await getSKRBalance(user.walletAddress);
      if (balance < txPreview.skr) {
        Alert.alert('Not enough SKR', `You need ${txPreview.skr} SKR but have ${balance.toFixed(2)} SKR.\nGet SKR on Jupiter or Raydium.`);
        setDonating(false); return;
      }
      const result = await payDonation(user.walletAddress, creatorWallet, txPreview.skr);
      if (result.success) {
        setDonationDone(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const sig = result.txSignature || '';
        const shortSig = sig ? `${sig.slice(0, 8)}...${sig.slice(-8)}` : '';
        Alert.alert('Donation Sent!',
          `Thank you for supporting this creator!\n\n${shortSig ? `TX: ${shortSig}` : ''}`,
          sig ? [
            { text: 'View on Solscan', onPress: () => Linking.openURL(`https://solscan.io/tx/${sig}`) },
            { text: 'OK', style: 'cancel' },
          ] : [{ text: 'OK' }]
        );
        const displayName = await AsyncStorage.getItem('display_name') || user.walletAddress.slice(0, 8);
        logActivity(user.walletAddress, displayName, 'donation_sent' as any, game.name).catch(() => {});
      } else {
        Alert.alert('Tip Failed', result.error || 'Try again');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed');
    }
    setDonating(false);
  };

  const shareOnX = () => {
    if (!game) return;
    const text = `🏆 Scored ${totalScore.toLocaleString()} pts on "${game.name}" in SeekerCraft!\n⏱️ ${Math.floor(elapsedSeconds/60)}:${String(elapsedSeconds%60).padStart(2,'0')}\n\n#SeekerCraft #Solana`;
    Linking.openURL(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`).catch(() => {});
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.text, fontFamily: 'monospace' }}>{t('game_not_found')}</Text>
      </View>
    );
  }

  const currentLevel = game.levels[currentLevelIndex];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#001A4D', '#003080', '#9945FF']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      
<SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <TouchableOpacity onPress={exitGame}>
            <Text style={{ color: C.gold, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' }}>
              ← {t('exit')}
            </Text>
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '900', fontFamily: 'monospace' }}>
              {game.name}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
              {t('level_n_of',{n:currentLevelIndex+1,total:game.levels.length})}{timerActive ? `  ·  ${Math.floor(elapsedSeconds/60)}:${String(elapsedSeconds%60).padStart(2,'0')}` : ''}
            </Text>
          </View>

          <View style={{ width: 50 }} />
        </View>

        {/* Game Info */}
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Image source={ICON_PLAY} style={{ width: 64, height: 64, marginBottom: 20, resizeMode: 'contain' }}/>
            
            <Text
              style={{
                color: C.gold,
                fontSize: 24,
                fontWeight: '900',
                fontFamily: 'monospace',
                marginBottom: 10,
                textAlign: 'center',
              }}
            >
              {game.name}
            </Text>

            <Text
              style={{
                color: C.textMuted,
                fontSize: 12,
                fontFamily: 'monospace',
                marginBottom: 30,
                textAlign: 'center',
              }}
            >
              {t('by_creator',{name:game.creator?.slice(0, 8) || t('anonymous')})}
            </Text>

            <View
              style={{
                backgroundColor: 'rgba(0,26,77,0.7)',
                borderRadius: 12,
                padding: 20,
                width: '100%',
                borderWidth: 1,
                borderColor: 'rgba(153,69,255,0.3)',
                marginBottom: 20,
              }}
            >
              <Text
                style={{
                  color: '#9945FF',
                  fontSize: 12,
                  fontFamily: 'monospace',
                  fontWeight: '900',
                  letterSpacing: 2,
                  marginBottom: 10,
                  textAlign: 'center',
                }}
              >
                {t('game_progress')}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.gold, fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    {currentLevelIndex + 1}
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
                    {t('current')}
                  </Text>
                </View>

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.blue, fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    {game.levels.length}
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
                    {t('total')}
                  </Text>
                </View>

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.green, fontSize: 28, fontWeight: 'bold', fontFamily: 'monospace' }}>
                    {totalScore}
                  </Text>
                  <Text style={{ color: C.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
                    {t('score')}
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View
                style={{
                  height: 8,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <LinearGradient
                  colors={['#9945FF', '#00D4FF']}
                  start={{x:0,y:0}} end={{x:1,y:0}}
                  style={{
                    height: '100%',
                    width: `${((currentLevelIndex + 1) / game.levels.length) * 100}%`,
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>

            {/* Levels List */}
            <View style={{ width: '100%' }}>
              <Text
                style={{
                  color: C.textMuted,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  marginBottom: 10,
                  letterSpacing: 1,
                }}
              >
                LEVELS
              </Text>

              {game.levels.map((level, index) => (
                <View
                  key={index}
                  style={{
                    backgroundColor: index === currentLevelIndex ? 'rgba(153,69,255,0.2)' : 'rgba(0,26,77,0.5)',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: index === currentLevelIndex ? 'rgba(153,69,255,0.5)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ color: C.gold, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' }}>
                        {index + 1}
                      </Text>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', fontFamily: 'monospace' }}>
                        {level.name}
                      </Text>
                    </View>

                    {index < currentLevelIndex && (
                      <Text style={{ color: C.green, fontSize: 18 }}>✓</Text>
                    )}
                    {index === currentLevelIndex && (
                      <Text style={{ color: '#9945FF', fontSize: 18 }}>▶</Text>
                    )}
                    {index > currentLevelIndex && (
                      <Text style={{ color: C.textMuted, fontSize: 18 }}>🔒</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Modal Level Complete */}
      <Modal visible={showLevelComplete} transparent animationType="slide">
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.88)', justifyContent:'flex-end' }}>
          <View style={{ backgroundColor:'#001A4D', borderTopLeftRadius:28, borderTopRightRadius:28, padding:28, paddingBottom:44, borderTopWidth:1.5, borderColor:'rgba(0,212,255,0.6)' }}>
            <LinearGradient colors={['rgba(0,212,255,0.15)','rgba(153,69,255,0.10)','#001A4D']} style={{ position:'absolute',top:0,left:0,right:0,bottom:0,borderTopLeftRadius:28,borderTopRightRadius:28 }}/>
            <Text style={{ fontSize:52, textAlign:'center', marginBottom:10 }}>⭐</Text>
            <Text style={{ color:'#14F195', fontSize:22, fontWeight:'900', fontFamily:'monospace', textAlign:'center', letterSpacing:2, marginBottom:6 }}>
              {t('level_cleared')}
            </Text>
            <Text style={{ color:'rgba(255,255,255,0.55)', fontFamily:'monospace', fontSize:12, textAlign:'center', marginBottom:20 }}>
              {t('level_n_of_short',{n:currentLevelIndex+1,total:game?.levels.length||1})}
            </Text>
            <View style={{ backgroundColor:'rgba(255,215,0,0.08)', borderRadius:12, padding:14, marginBottom:20, borderWidth:1, borderColor:'rgba(255,215,0,0.2)', alignItems:'center' }}>
              <Text style={{ color:'rgba(255,255,255,0.5)', fontFamily:'monospace', fontSize:10 }}>{t('level_score')}</Text>
              <Text style={{ color:'#FFD700', fontSize:32, fontWeight:'900', fontFamily:'monospace', marginTop:2 }}>
                +{levelScore.toLocaleString()}
              </Text>
              <Text style={{ color:'rgba(255,255,255,0.4)', fontFamily:'monospace', fontSize:10, marginTop:4 }}>
                {t('run_total',{score:(totalScore + levelScore).toLocaleString()})}
              </Text>
            </View>
            {currentLevelIndex + 1 < (game?.levels.length || 1) ? (
              <TouchableOpacity onPress={() => { playStart(); nextLevel(); }} style={{ borderRadius:14, overflow:'hidden', marginBottom:10 }}>
                <LinearGradient colors={['#14F195','#3B82F6']} start={{x:0,y:0}} end={{x:1,y:0}} style={{ paddingVertical:16, alignItems:'center' }}>
                  <Text style={{ color:'#000', fontWeight:'900', fontFamily:'monospace', fontSize:16, letterSpacing:1 }}>
                    ▶  {t('next_level',{n:currentLevelIndex+2,total:game?.levels.length})}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { playStart(); nextLevel(); }} style={{ borderRadius:14, overflow:'hidden', marginBottom:10 }}>
                <LinearGradient colors={['#FFD700','#FF9500']} start={{x:0,y:0}} end={{x:1,y:0}} style={{ paddingVertical:16, alignItems:'center' }}>
                  <Text style={{ color:'#000', fontWeight:'900', fontFamily:'monospace', fontSize:16, letterSpacing:1 }}>
                    🏆  {t('complete_game')}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal Level Start */}
      <Modal visible={showLevelStart} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: 30 }}>
          <View style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(153,69,255,0.5)' }}>
            <LinearGradient colors={['#9945FF','#003080','#001A4D']} style={{ padding: 30, alignItems: 'center' }}>

            <View style={{ backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 6, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)' }}>
              <Text style={{ color: C.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 2 }}>
                {t('level_n_of_short',{n:currentLevelIndex+1,total:game?.levels?.length||'?'})}
              </Text>
            </View>

            <Text style={{ color: C.text, fontSize: 18, fontWeight: '900', fontFamily: 'monospace', marginBottom: 8, textAlign: 'center' }}>
              {currentLevel?.name}
            </Text>

            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
              <View style={{ alignItems: 'center', backgroundColor: 'rgba(0,26,77,0.6)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(153,69,255,0.25)' }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, fontFamily: 'monospace' }}>{t('balls')}</Text>
                <Text style={{ color: '#14F195', fontSize: 22, fontWeight: '900', fontFamily: 'monospace' }}>{currentLevel?.balls || 10}</Text>
              </View>
              {totalScore > 0 && (
                <View style={{ alignItems: 'center', backgroundColor: 'rgba(0,26,77,0.6)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(153,69,255,0.25)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 8, fontFamily: 'monospace' }}>{t('total_score_modal')}</Text>
                  <Text style={{ color: C.gold, fontSize: 22, fontWeight: '900', fontFamily: 'monospace' }}>{totalScore.toLocaleString()}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => { playStart(); startLevel(); }}
              style={{ width: '100%', borderRadius: 14, overflow: 'hidden' }}
            >
              <LinearGradient colors={['#9945FF','#6A1FC2']} style={{ paddingVertical: 16, alignItems: 'center', borderRadius: 14 }}>
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16, fontFamily: 'monospace', letterSpacing: 2 }}>
                  START
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* Modal Game Complete */}
      <Modal visible={showGameComplete} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 24 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.5)' }}>
            <LinearGradient colors={['rgba(255,215,0,0.15)','#001A4D','#003080']} style={{ padding: 26, alignItems: 'center' }}>

            <Text style={{ fontSize: 52, textAlign: 'center', marginBottom: 8 }}>🏆</Text>
            <Text style={{ color: C.gold, fontSize: 22, fontWeight: '900', fontFamily: 'monospace', marginBottom: 4, textAlign: 'center', textShadowColor: '#FFD700', textShadowRadius: 16 }}>
              GAME COMPLETE!
            </Text>
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '600', fontFamily: 'monospace', marginBottom: 2, textAlign: 'center' }}>
              {game.name}
            </Text>
            <Text style={{ color: C.textMuted, fontSize: 11, fontFamily: 'monospace' }}>
              by {(game as any).creatorName || 'Unknown'}
            </Text>

            {/* Stats row */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, width: '100%', marginTop: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.textMuted, fontSize: 9, fontFamily: 'monospace' }}>SCORE</Text>
                  <Text style={{ color: C.gold, fontSize: 28, fontWeight: '900', fontFamily: 'monospace' }}>{totalScore.toLocaleString()}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.textMuted, fontSize: 9, fontFamily: 'monospace' }}>TIME</Text>
                  <Text style={{ color: '#14F195', fontSize: 28, fontWeight: '900', fontFamily: 'monospace' }}>
                    {Math.floor(elapsedSeconds/60)}:{String(elapsedSeconds%60).padStart(2,'0')}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: C.textMuted, fontSize: 9, fontFamily: 'monospace' }}>LEVELS</Text>
                  <Text style={{ color: '#3B82F6', fontSize: 28, fontWeight: '900', fontFamily: 'monospace' }}>{game.levels.length}</Text>
                </View>
              </View>
            </View>

            {/* RATING */}
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'monospace', marginBottom: 6 }}>
                {ratingSubmitted ? 'THANKS FOR RATING!' : 'RATE THIS GAME'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[1,2,3,4,5].map(star => (
                  <TouchableOpacity key={star} onPress={() => handleRating(star)} disabled={ratingSubmitted}>
                    <Text style={{ fontSize: 42, color: '#FFD700', opacity: star <= ratingGiven ? 1 : 0.25 }}>★</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* TIP THE CREATOR */}
            {(game as any).creatorWallet && (game as any).creatorWallet !== user?.walletAddress && (
              <View style={{ width: '100%', marginBottom: 14 }}>
                {donationDone ? (
                  <View style={{ alignItems: 'center', padding: 10 }}>
                    <Text style={{ color: '#14F195', fontSize: 14, fontWeight: '900', fontFamily: 'monospace' }}>THANK YOU!</Text>
                  </View>
                ) : donating ? (
                  <View style={{ alignItems: 'center', padding: 10 }}>
                    <ActivityIndicator color="#14F195" size="small" />
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 10, marginTop: 6 }}>Sending {donationAmount} SKR...</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setCustomDonationAmt(''); setShowDonationModal(true); }}
                    style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(20,241,149,0.4)' }}>
                    <LinearGradient colors={['rgba(20,241,149,0.12)', 'rgba(20,241,149,0.04)']} style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Text style={{ color: '#14F195', fontWeight: '900', fontFamily: 'monospace', fontSize: 13 }}>TIP THE CREATOR</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, fontFamily: 'monospace', marginTop: 2 }}>90% creator · 10% dev</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Share */}
            <TouchableOpacity onPress={shareOnX} style={{ marginBottom: 12, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: 'rgba(29,155,240,0.1)', borderWidth: 1, borderColor: 'rgba(29,155,240,0.3)' }}>
              <Text style={{ color: '#1DA1F2', fontFamily: 'monospace', fontSize: 11, fontWeight: '900' }}>📢 SHARE ON X</Text>
            </TouchableOpacity>

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              {!isDuel && (
              <TouchableOpacity onPress={restartGame} style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
                <LinearGradient colors={['rgba(255,255,255,0.08)','rgba(255,255,255,0.04)']} style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 12 }}>
                  <Text style={{ color: C.text, fontWeight: '900', fontFamily: 'monospace', fontSize: 13 }}>RESTART</Text>
                </LinearGradient>
              </TouchableOpacity>
              )}
              <TouchableOpacity onPress={exitGame} style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
                <LinearGradient colors={['#FFD700','#FF9500']} style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 12 }}>
                  <Text style={{ color: '#000', fontWeight: '900', fontFamily: 'monospace', fontSize: 13 }}>EXIT</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            </LinearGradient>
          </View>
          </ScrollView>
        </View>
      </Modal>

      {/* DONATION AMOUNT MODAL */}
      <Modal visible={showDonationModal} transparent animationType="slide" onRequestClose={() => setShowDonationModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#0D0028', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 44, borderTopWidth: 3, borderColor: '#14F195', overflow: 'hidden' }}>
            <LinearGradient colors={['rgba(20,241,149,0.14)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', fontFamily: 'monospace' }}>
                TIP {(game as any)?.creatorName?.toUpperCase() || 'CREATOR'}
              </Text>
              <TouchableOpacity onPress={() => setShowDonationModal(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '900' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 10, marginBottom: 14 }}>
              90% goes to the creator · 10% to developers
            </Text>
            {/* Preset chips */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[{ label: '$0.50', usd: 0.5 }, { label: '$5', usd: 5 }, { label: '$15', usd: 15 }].map(({ label, usd }) => {
                const skr = skrPrice > 0 ? Math.ceil(usd / skrPrice) : 0;
                return (
                  <TouchableOpacity key={label} onPress={() => handleDonatePreview(skr)}
                    style={{ flex: 1, backgroundColor: 'rgba(20,241,149,0.12)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6,
                      borderWidth: 2, borderColor: 'rgba(20,241,149,0.4)', alignItems: 'center' }}>
                    <Text style={{ color: '#14F195', fontSize: 15, fontWeight: '900', fontFamily: 'monospace' }}>{label}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>~{skr} SKR</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Custom amount */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' }}>
                <TextInput value={customDonationAmt} onChangeText={setCustomDonationAmt}
                  placeholder="Custom SKR amount" placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="numeric" style={{ color: '#fff', fontFamily: 'monospace', fontSize: 13 }} />
              </View>
              <TouchableOpacity disabled={!customDonationAmt}
                onPress={() => handleDonatePreview(parseInt(customDonationAmt || '0'))}
                style={{ borderRadius: 12, overflow: 'hidden', opacity: !customDonationAmt ? 0.5 : 1 }}>
                <LinearGradient colors={['#14F195', '#3B82F6']} style={{ paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ color: '#000', fontWeight: '900', fontFamily: 'monospace', fontSize: 12 }}>SEND</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* TX PREVIEW MODAL */}
      <Modal visible={showTxPreview} transparent animationType="fade" onRequestClose={() => setShowTxPreview(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 }}>
          <View style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 3, borderColor: '#14F195' }}>
            <LinearGradient colors={['#0D0028', '#001A40']} style={{ padding: 26 }}>
              <Text style={{ color: '#14F195', fontFamily: 'monospace', fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 16 }}>CONFIRM DONATION</Text>
              {txPreview && (
                <>
                  <View style={{ gap: 10, marginBottom: 22 }}>
                    {[
                      { lbl: 'To', val: (game as any)?.creatorName || 'Creator', c: '#FFD700' },
                      { lbl: 'Amount', val: `${txPreview.skr} SKR (~$${txPreview.usd})`, c: '#14F195' },
                      { lbl: 'Creator gets', val: `${Math.floor(txPreview.skr * 0.9)} SKR (90%)`, c: '#00D4FF' },
                      { lbl: 'Dev fund', val: `${Math.floor(txPreview.skr * 0.1)} SKR (10%)`, c: '#9945FF' },
                    ].map(r => (
                      <View key={r.lbl} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                        borderWidth: 1, borderColor: `${r.c}30` }}>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 11 }}>{r.lbl}</Text>
                        <Text style={{ color: r.c, fontFamily: 'monospace', fontWeight: '900', fontSize: 12 }}>{r.val}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity onPress={() => setShowTxPreview(false)} style={{ flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontWeight: '900', fontFamily: 'monospace' }}>CANCEL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmDonate} disabled={donating} style={{ flex: 2, borderRadius: 16, overflow: 'hidden', opacity: donating ? 0.7 : 1 }}>
                      <LinearGradient colors={['#14F195', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: 'center' }}>
                        {donating ? <ActivityIndicator color="#000" size="small" /> : <Text style={{ color: '#000', fontWeight: '900', fontFamily: 'monospace', fontSize: 14 }}>CONFIRM</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </View>
  );
}
