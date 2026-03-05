// app/my-levels.tsx - Lista dei livelli con sistema Publish
import React, { useState, useCallback, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Modal, ActivityIndicator, Image, ImageBackground, DeviceEventEmitter } from 'react-native';
import { useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ref, set } from 'firebase/database';
import { logActivity, updateUserStats, database } from '@/utils/firebase';
import { payPublishFee, getDeviceFingerprint, getSOLPriceUSD, PUBLISH_FEE_USD } from '@/utils/payments';
import StickmanBuilder from '@/components/StickmanBuilder';
import { useTranslation } from 'react-i18next';

const ICON_BROWSE = require('../assets/images/Icons/Browse.png');

const C = {
  bg1: '#001A4D',
  bg2: '#003080',
  gold: '#FFD700',
  orange: '#FF6B00',
  purple: '#7B2FBE',
  blue: '#3B82F6',
  red: '#EF4444',
  surface: 'rgba(255,255,255,0.07)',
  card: 'rgba(30,10,60,0.85)',
  cardBorder: 'rgba(255,255,255,0.1)',
  text: '#FFF',
  textMuted: 'rgba(255,255,255,0.55)',
  danger: '#EF4444',
  success: '#22C55E',
  draft: '#9CA3AF',
};

interface LevelEntry {
  id: string;
  name: string;
  createdAt: number;
}

interface Game {
  id: string;
  name: string;
  levels: LevelEntry[];
  published: boolean;
  creator: string;
  createdAt: number;
  firebaseId?: string;
  description?: string;
}

export default function MyLevelsScreen() {
  const {t}=useTranslation();
  const backPlayer      = useAudioPlayer(require('../assets/images/tools/back.mp3'));
  const startPlayer     = useAudioPlayer(require('../assets/images/tools/Start.mp3'));
  const mutedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('global_muted').then(v => { mutedRef.current = v === '1'; });
      const {DeviceEventEmitter} = require('react-native');
      const sub = DeviceEventEmitter.addListener('MUTE_CHANGED', ({muted}: {muted: boolean}) => { mutedRef.current = muted; });
      // Global main.mp3 continues through my-levels
      return () => sub.remove();
    }, [])
  );

  const playBack  = () => { if(mutedRef.current)return; try { backPlayer.seekTo(0);  backPlayer.play();  } catch {} };
  const playStart = () => { if(mutedRef.current)return; try { startPlayer.seekTo(0); startPlayer.play(); } catch {} };

  const [gameId, setGameId] = useState<string | null>(null);
  const [gameName, setGameName] = useState('');
  const [game, setGame] = useState<Game | null>(null);
  const [levels, setLevels] = useState<LevelEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [solPreview, setSolPreview] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  useEffect(() => {
    getSOLPriceUSD().then(price => {
      const sol = PUBLISH_FEE_USD / price;
      setSolPreview(sol.toFixed(4));
    }).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const load = async () => {
    try {
      const gid = await AsyncStorage.getItem('current_game_id');
      if (!gid) {
        router.back();
        return;
      }
      setGameId(gid);

      const gj = await AsyncStorage.getItem('my_games');
      if (gj) {
        const games = JSON.parse(gj);
        const currentGame = games.find((x: any) => x.id === gid);
        if (currentGame) {
          setGame(currentGame);
          setGameName(currentGame.name);
          setLevels(currentGame.levels || []);
          // Auto-sync: if published, check for missing local level data and fetch from Firebase
          if (currentGame.published && currentGame.firebaseId && database) {
            const lvls: LevelEntry[] = currentGame.levels || [];
            const missing: string[] = [];
            for (const l of lvls) {
              const d = await AsyncStorage.getItem(l.id);
              if (!d) missing.push(l.id);
            }
            if (missing.length > 0) {
              try {
                const { ref: fbRef, get: fbGet } = await import('firebase/database');
                const snap = await fbGet(fbRef(database, `games/public/${currentGame.firebaseId}`));
                if (snap.exists()) {
                  const fbLevels: any[] = snap.val().levels || [];
                  for (const fl of fbLevels) {
                    if (!missing.includes(fl.id)) continue;
                    const parsed: any = { ...fl };
                    if (typeof fl.grid === 'string') parsed.grid = JSON.parse(fl.grid);
                    if (typeof fl.curves === 'string') parsed.curves = JSON.parse(fl.curves);
                    await AsyncStorage.setItem(fl.id, JSON.stringify(parsed));
                  }
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      console.error('Errore caricamento giochi', err);
    } finally {
      setLoading(false);
    }
  };

  const updateGameLevels = async (updatedLevels: LevelEntry[]) => {
    try {
      const gj = await AsyncStorage.getItem('my_games');
      if (gj && gameId) {
        const games = JSON.parse(gj);
        const index = games.findIndex((x: any) => x.id === gameId);
        if (index !== -1) {
          games[index].levels = updatedLevels;
          await AsyncStorage.setItem('my_games', JSON.stringify(games));
          setGame(games[index]);
        }
      }
    } catch {}
  };

  const updateGamePublishedStatus = async (published: boolean) => {
    try {
      const gj = await AsyncStorage.getItem('my_games');
      if (gj && gameId) {
        const games = JSON.parse(gj);
        const index = games.findIndex((x: any) => x.id === gameId);
        if (index !== -1) {
          games[index].published = published;
          await AsyncStorage.setItem('my_games', JSON.stringify(games));
          setGame(games[index]);
        }
      }
    } catch {}
  };

  const EMPTY_LEVEL = {
    grid: Array(19).fill(null).map(() => Array(11).fill('empty')),
    balls: 10,
    name: '',
  };

  const createLevel = async () => {
    if (!newName.trim() || !gameId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const levelId = `${gameId}_level_${Date.now()}`;
    const entry: LevelEntry = {
      id: levelId,
      name: newName.trim(),
      createdAt: Date.now(),
    };

    const updatedLevels = [...levels, entry];
    setLevels(updatedLevels);
    await updateGameLevels(updatedLevels);

    const levelData = { name: newName.trim(), ...EMPTY_LEVEL };
    await AsyncStorage.setItem(levelId, JSON.stringify(levelData));
    await AsyncStorage.setItem('current_level_id', levelId);
    await AsyncStorage.setItem('current_level_draft', JSON.stringify(levelData));

    setShowNew(false);
    setNewName('');
    router.push('/editor');
  };

  const syncLevelFromFirebase = async (levelId: string): Promise<string|null> => {
    if (!game?.firebaseId || !database) return null;
    try {
      const { ref: fbRef, get: fbGet } = await import('firebase/database');
      const snap = await fbGet(fbRef(database, `games/public/${game.firebaseId}`));
      if (!snap.exists()) return null;
      const fbGame = snap.val();
      const fbLevels: any[] = fbGame.levels || [];
      for (const fl of fbLevels) {
        if (fl.id !== levelId) continue;
        const parsed: any = { ...fl };
        if (typeof fl.grid === 'string') parsed.grid = JSON.parse(fl.grid);
        if (typeof fl.curves === 'string') parsed.curves = JSON.parse(fl.curves);
        const json = JSON.stringify(parsed);
        await AsyncStorage.setItem(levelId, json);
        return json;
      }
    } catch {}
    return null;
  };

  const openLevel = async (level: LevelEntry) => {
    try {
      let data = await AsyncStorage.getItem(level.id);
      if (!data && game?.published && game?.firebaseId) {
        data = await syncLevelFromFirebase(level.id);
      }
      if (data) await AsyncStorage.setItem('current_level_draft', data);
      await AsyncStorage.setItem('current_level_id', level.id);
      router.push('/editor');
    } catch {}
  };

  const playLevel = async (level: LevelEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let data = await AsyncStorage.getItem(level.id);
      if (!data && game?.published && game?.firebaseId) {
        data = await syncLevelFromFirebase(level.id);
      }
      if (data) {
        await AsyncStorage.setItem('current_level_draft', data);
        router.push('/test-play');
      }
    } catch {}
  };

  const deleteLevel = (levelId: string) => {
    Alert.alert(t('delete_level_confirm'), t('delete_level_sure'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete_btn'),
        style: 'destructive',
        onPress: async () => {
          const updated = levels.filter(l => l.id !== levelId);
          setLevels(updated);
          await updateGameLevels(updated);
          await AsyncStorage.removeItem(levelId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const buildLevelsData = async () => {
    const levelsData = [];
    for (const level of levels) {
      const data = await AsyncStorage.getItem(level.id);
      if (data) {
        const parsedData = JSON.parse(data);
        levelsData.push({
          ...parsedData,
          id: level.id,
          name: level.name,
          grid:   JSON.stringify(parsedData.grid   || []),
          curves: JSON.stringify(parsedData.curves || []),
        });
      }
    }
    return levelsData;
  };

  const getCreatorName = async () => {
    try {
      const addr = await AsyncStorage.getItem('wallet_address');
      if (!addr) return game?.creator || 'player';
      const savedName = await AsyncStorage.getItem('display_name');
      return savedName || game?.creator || `${addr.slice(0,4)}...${addr.slice(-4)}`;
    } catch {
      return game?.creator || 'player';
    }
  };

  const publishGame = async () => {
    if (!game || !database) {
      Alert.alert(t('error'), t('cannot_publish'));
      return;
    }
    if (!game.levels || game.levels.length === 0) {
      Alert.alert(t('no_levels_publish_title'), t('no_levels_publish_msg'));
      return;
    }

    const addr = await AsyncStorage.getItem('wallet_address');
    if (!addr) { Alert.alert(t('error'), t('no_wallet_error')); return; }

    const solPrice = await getSOLPriceUSD();
    const solAmount = (PUBLISH_FEE_USD / solPrice).toFixed(4);

    Alert.alert(
      t('publish_confirm_title'),
      t('publish_confirm_msg', {sol: solAmount, usd: PUBLISH_FEE_USD.toFixed(2)}),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('publish_pay', {sol: solAmount}),
          onPress: async () => {
            setPublishing(true);
            try {
              const payResult = await payPublishFee(addr);
              if (!payResult.success) {
                Alert.alert(t('payment_failed_title'), payResult.error || t('payment_failed_msg'));
                return;
              }

              const fingerprint = await getDeviceFingerprint();
              const dname = await AsyncStorage.getItem('display_name');
              const levelsData = await buildLevelsData();
              const creatorName = await getCreatorName();

              const gameData = {
                name: game.name,
                levels: levelsData,
                creatorWallet: addr,
                creatorName,
                device_fingerprint: fingerprint,
                description: game.description || '',
                publishTx: payResult.txSignature || '',
              };

              const { ref: fbRef, push: fbPush, set: fbSet } = await import('firebase/database');
              const gamesRef = fbRef(database, 'games/public');
              const newRef = fbPush(gamesRef);
              await fbSet(newRef, {
                ...gameData,
                plays: 0, completions: 0,
                votesSum: 0, votesCount: 0, rating: 0,
                createdAt: Date.now(),
              });

              // ✅ FIX: incrementa levelsCreated su Firebase
              await updateUserStats(addr, { levelsCreated: 1 });

              const gj2 = await AsyncStorage.getItem('my_games');
              const games = gj2 ? JSON.parse(gj2) : [];
              const index = games.findIndex((g: any) => g.id === game.id);
              if (index !== -1) {
                games[index].published = true;
                games[index].publishedAt = Date.now();
                games[index].firebaseId = newRef.key || '';
                await AsyncStorage.setItem('my_games', JSON.stringify(games));
              }

              Alert.alert(t('publish_success_title'), t('publish_success_msg'), [{ text: t('ok') }]);
              await load();
              if (dname) logActivity(addr, dname, 'game_published', game.name).catch(() => {});
              try { (global as any).showAchievement?.('first_publish'); } catch {}
            } catch (err: any) {
              Alert.alert(t('error'), err.message || t('publish_error'));
            } finally {
              setPublishing(false);
            }
          },
        },
      ]
    );
  };

  const updatePublishedGame = async () => {
    if (!game || !database) return;
    if (levels.length === 0) {
      Alert.alert(t('no_levels_publish_title'), t('no_levels_publish_msg'));
      return;
    }
    Alert.alert(
      t('update_confirm_title'),
      t('update_confirm_msg', {name: gameName}),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('update'),
          onPress: async () => {
            setPublishing(true);
            try {
              const levelsData = await buildLevelsData();
              const creatorName = await getCreatorName();
              const updates = {
                name: game.name,
                creator: creatorName,
                levels: levelsData,
                updatedAt: Date.now(),
              };
              const { update: fbUpdate } = await import('firebase/database');
              const fbId = game.firebaseId || game.id;
              await fbUpdate(ref(database, `games/public/${fbId}`), updates);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(t('update_success_title'), t('update_success_msg'));
            } catch (error) {
              console.error('Update error:', error);
              Alert.alert(t('error'), t('update_error'));
            } finally {
              setPublishing(false);
            }
          },
        },
      ]
    );
  };

  const unpublishGame = async () => {
    Alert.alert(
      t('unpublish_confirm_title'),
      t('unpublish_confirm_msg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('unpublish_confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              if (database && game) {
                const fbId = game.firebaseId || game.id;
                await set(ref(database, `games/public/${fbId}`), null);
                await updateGamePublishedStatus(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                Alert.alert(t('unpublish_success_title'), t('unpublish_success_msg'));
              }
            } catch {
              Alert.alert(t('error'), t('unpublish_error'));
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#001A4D','#003080','#9945FF']} locations={[0,0.5,1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <StickmanBuilder />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)',
        }}>
          <TouchableOpacity onPress={() => { playBack(); router.back(); }}>
            <Text style={{ color: C.gold, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' }}>← BACK</Text>
          </TouchableOpacity>

          <View style={{ alignItems: 'center', flex: 1, marginHorizontal: 8 }}>
            {editingName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={30}
                  autoFocus
                  style={{ color: C.text, fontSize: 14, fontWeight: '900', fontFamily: 'monospace',
                    borderBottomWidth: 1.5, borderBottomColor: C.gold, paddingVertical: 2, minWidth: 120, textAlign: 'center' }}
                />
                <TouchableOpacity onPress={async () => {
                  const trimmed = nameInput.trim();
                  if (!trimmed) { setEditingName(false); return; }
                  setGameName(trimmed);
                  if (game) game.name = trimmed;
                  // Update locally
                  try {
                    const raw = await AsyncStorage.getItem('my_games');
                    if (raw) {
                      const games = JSON.parse(raw);
                      const g = games.find((g: any) => g.id === gameId);
                      if (g) { g.name = trimmed; await AsyncStorage.setItem('my_games', JSON.stringify(games)); }
                    }
                  } catch {}
                  // Update Firebase if published
                  if (game?.published && game.firebaseId) {
                    try {
                      const { update: fbUpdate } = await import('firebase/database');
                      await fbUpdate(ref(database, `games/public/${game.firebaseId}`), { name: trimmed });
                    } catch {}
                  }
                  setEditingName(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}>
                  <Text style={{ color: C.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace' }}>OK</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => { setNameInput(gameName); setEditingName(true); }}>
                <Text style={{ color: C.text, fontSize: 16, fontWeight: '900', fontFamily: 'monospace' }}>
                  {gameName || 'My Game'}
                </Text>
              </TouchableOpacity>
            )}
            {game?.published && !editingName && (
              <Text style={{ color: C.success, fontSize: 9, fontFamily: 'monospace', marginTop: 2 }}>● {t('live_tap_edit')}</Text>
            )}
          </View>

          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 150 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: 'monospace' }}>
              {t('levels_label', {count: levels.length})}
            </Text>

            {game?.published ? (
              <TouchableOpacity
                onPress={() => { playBack(); unpublishGame(); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  paddingHorizontal: 12, paddingVertical: 8,
                  borderRadius: 10, borderWidth: 1, borderColor: C.red,
                }}
              >
                <Text style={{ fontSize: 12 }}>✕</Text>
                <Text style={{ color: C.red, fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace' }}>{t('unpublish')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{
                borderRadius: 20, padding: 20, marginTop: 4,
                borderWidth: 2.5, borderColor: 'rgba(153,69,255,0.75)', overflow: 'hidden',
                backgroundColor: 'rgba(8,0,30,0.85)',
              }}>
                <LinearGradient colors={['rgba(153,69,255,0.45)','rgba(20,241,149,0.18)']} style={{ position:'absolute',top:0,left:0,right:0,bottom:0 }}/>
                <View style={{ flexDirection:'row', justifyContent:'center', alignItems:'center', gap:10, marginBottom:8 }}>
                  <Text style={{ color: '#FFF', fontFamily: 'monospace', fontSize: 13, fontWeight: '900', letterSpacing:1 }}>
                    🌐 {t('publish_to_community')}
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontSize: 10, textAlign: 'center', marginBottom: 14 }}>
                  {t('publish_donate_info')}
                </Text>
                <TouchableOpacity
                  onPress={() => { playStart(); publishGame(); }}
                  disabled={publishing || levels.length === 0}
                  style={{ borderRadius: 12, overflow:'hidden', opacity: publishing ? 0.5 : 1 }}
                >
                  <LinearGradient
                    colors={levels.length === 0 ? ['rgba(156,163,175,0.15)','rgba(156,163,175,0.15)'] : ['#9945FF','#6A1FC2']}
                    start={{x:0,y:0}} end={{x:1,y:0}}
                    style={{ alignItems:'center', justifyContent:'center', flexDirection:'row', gap:10, paddingVertical:14 }}
                  >
                    <Text style={{ color: levels.length === 0 ? C.textMuted : '#FFF', fontSize: 13, fontWeight: '900', fontFamily: 'monospace' }}>
                      {publishing ? t('publishing') : t('publish_cost', {sol: solPreview || '?'})}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {levels.map((level, index) => (
            <View key={level.id} style={{
              backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 10,
              borderWidth: 1, borderColor: C.cardBorder,
            }}>
              <Text style={{ color: C.orange, fontSize: 10, fontFamily: 'monospace' }}>{t('level_n', {n: index + 1})}</Text>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: '800', fontFamily: 'monospace', marginTop: 2 }}>
                {level.name}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={() => { playBack(); openLevel(level); }}
                  style={{ flex: 1, backgroundColor: C.purple, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>{t('edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { playStart(); playLevel(level); }}
                  style={{ flex: 1, backgroundColor: C.gold, paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}>
                  <Text style={{ color: '#000', fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>▶ {t('play')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteLevel(level.id)} disabled={game?.published}
                  style={{
                    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8,
                    backgroundColor: game?.published ? 'rgba(100,100,100,0.15)' : 'rgba(239,68,68,0.15)',
                    opacity: game?.published ? 0.5 : 1,
                  }}>
                  <Image source={require('../assets/images/tools/bin.png')}
                    style={{ width: 20, height: 20, resizeMode: 'contain', tintColor: game?.published ? C.textMuted : C.red }} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {levels.length === 0 && (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>🎯</Text>
              <Text style={{ color: C.text, fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace' }}>{t('no_levels_yet')}</Text>
              <Text style={{ color: C.textMuted, fontSize: 12, fontFamily: 'monospace', marginTop: 6, textAlign: 'center' }}>
                {t('no_levels_hint')}
              </Text>
            </View>
          )}

          {/* Help section */}
          <View style={{ marginTop: 20, borderRadius: 16, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)' }}>
            <Image source={require('../assets/images/help.png')}
              style={{ width: '100%', height: 200, resizeMode: 'contain', backgroundColor: 'rgba(0,0,0,0.3)' }} />
            <View style={{ padding: 14, backgroundColor: 'rgba(30,10,60,0.7)' }}>
              <Text style={{ color: C.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace', marginBottom: 4 }}>
                HOW TO CREATE LEVELS
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 10, fontFamily: 'monospace', lineHeight: 16 }}>
                1. Tap + to create a new level{'\n'}
                2. Select a tool and tap cells to place pegs{'\n'}
                3. Add at least 1 SKR (gold) peg{'\n'}
                4. Test your level with PLAY TEST{'\n'}
                5. Publish to share with the community
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* UPDATE BANNER — visible when published */}
        {game?.published && (
          <View style={{ position: 'absolute', bottom: 110, left: 16, right: 16 }}>
            <TouchableOpacity onPress={() => { playStart(); updatePublishedGame(); }}
              disabled={publishing}
              style={{ borderRadius: 16, overflow: 'hidden', opacity: publishing ? 0.5 : 1 }}>
              <LinearGradient colors={['#9945FF','#6A1FC2']} start={{x:0,y:0}} end={{x:1,y:0}}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 10, paddingVertical: 16,
                  shadowColor:'#9945FF', shadowOffset:{width:0,height:4}, shadowOpacity:0.5, shadowRadius:10, elevation:8,
                }}>
                <Image source={require('../assets/images/Icons/save.png')}
                  style={{ width: 22, height: 22, resizeMode: 'contain', tintColor: '#FFF' }} />
                <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 1 }}>
                  {publishing ? t('updating') : t('update_published')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Floating Action Button */}
        <TouchableOpacity
          onPress={() => { playStart(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowNew(true); }}
          style={{
            position: 'absolute', bottom: 36, right: 22,
            width: 62, height: 62, borderRadius: 31, backgroundColor: C.gold,
            justifyContent: 'center', alignItems: 'center',
            elevation: 8, shadowColor: C.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
          }}>
          <Text style={{ color: '#000', fontSize: 36, fontWeight: '900', marginTop: -4 }}>+</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Modal nuovo livello — candy style matching index */}
      <Modal visible={showNew} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 16 }}>
          <View style={{ borderRadius: 28, overflow: 'hidden', borderWidth: 3, borderColor: '#FF8C00' }}>
            {/* rainbow top bar */}
            <View style={{ height: 4 }}>
              <LinearGradient colors={['#FFE600','#FF8C00','#FF4D6D','#9945FF','#00D4FF']} start={{x:0,y:0}} end={{x:1,y:0}} style={{ flex:1 }}/>
            </View>
            <LinearGradient colors={['rgba(20,8,40,0.97)','rgba(10,0,60,0.99)']} style={{ padding: 28 }}>
              <Text style={{ color: '#FFE600', fontSize: 22, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>
                ✏️  EDIT MODE
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', marginBottom: 20 }}>
                Name your new level
              </Text>
              <TextInput
                value={newName} onChangeText={setNewName}
                placeholder="e.g. Sky Castle, Neon Drop..." placeholderTextColor="rgba(255,255,255,0.35)"
                autoFocus maxLength={30}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 16, padding: 16,
                  color: '#FFF', fontSize: 15, fontFamily: 'monospace', marginBottom: 18,
                  borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.25)',
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { playBack(); setShowNew(false); setNewName(''); }}
                  style={{ flex: 1, padding: 15, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.20)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '900', fontFamily: 'monospace', fontSize: 13 }}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { playStart(); createLevel(); }}
                  style={{ flex: 2, borderRadius: 16, overflow: 'hidden' }}>
                  <LinearGradient colors={['#FFE600','#FF8C00']} start={{x:0,y:0}} end={{x:1,y:0}} style={{ padding: 15, alignItems: 'center' }}>
                    <Text style={{ color: '#000', fontWeight: '900', fontFamily: 'monospace', fontSize: 15, letterSpacing: 1 }}>CREATE  →</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </View>
  );
}
