// app/vs-ai.tsx - Play vs AI mode
// Browse community levels, pick one, then play turn-based vs AI in test-play
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@/utils/firebase';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

const ICON_AI = require('../assets/images/Icons/AI.png');

const C = {
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  mint:'#00F0B5', cyan:'#00D4FF', purple:'#9945FF',
  gold:'#FFD700', blue:'#3B7DFF',
};

type Difficulty = 'easy' | 'medium' | 'hard';

export default function VsAIScreen() {
  const {t}=useTranslation();

  const DIFFICULTIES: { key: Difficulty; label: string; color: string; desc: string }[] = [
    { key: 'easy',   label: t('easy'),   color: C.mint,   desc: t('easy_desc') },
    { key: 'medium', label: t('medium'), color: C.orange, desc: t('medium_desc') },
    { key: 'hard',   label: t('hard'),   color: C.coral,  desc: t('hard_desc') },
  ];
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<any[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  useEffect(() => {
    loadPublishedLevels();
  }, []);

  const loadPublishedLevels = async () => {
    try {
      if (!database) { setLoading(false); return; }
      const { ref: fbRef, get: fbGet } = await import('firebase/database');
      const snap = await fbGet(fbRef(database, 'games/public'));
      if (snap.exists()) {
        const data = snap.val();
        const list: any[] = [];
        Object.entries(data).forEach(([id, val]: [string, any]) => {
          if (val.name && val.levels && val.levels.length > 0) {
            list.push({ id, ...val });
          }
        });
        // Sort by rating then by name
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        setGames(list);
      }
    } catch (err) {
      console.error('Failed to load levels for AI', err);
    } finally {
      setLoading(false);
    }
  };

  const startVsAI = async (game: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Parse all levels for the pack
    const allLevels = (game.levels || []).map((level: any) => ({
      ...level,
      grid: typeof level.grid === 'string' ? JSON.parse(level.grid) : (level.grid || []),
      curves: typeof level.curves === 'string' ? JSON.parse(level.curves) : (level.curves || []),
    }));
    // Store first level as current draft
    await AsyncStorage.setItem('current_level_draft', JSON.stringify(allLevels[0]));
    // Store full pack for multi-level progression
    await AsyncStorage.setItem('ai_levels_pack', JSON.stringify(allLevels));
    await AsyncStorage.setItem('ai_level_index', '0');
    await AsyncStorage.setItem('ai_mode', difficulty);
    await AsyncStorage.setItem('ai_game_name', game.name || 'Unknown');
    router.push('/test-play');
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#001A4D', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#001A4D', '#003080', '#9945FF']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: C.gold, fontSize: 14, fontWeight: 'bold', fontFamily: 'monospace' }}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 2 }}>{t('vs_ai')}</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
          {/* Title */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Image source={ICON_AI} style={{ width: 56, height: 56, marginBottom: 8 }} />
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', fontFamily: 'monospace', marginBottom: 4 }}>{t('play_vs_ai')}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center' }}>
              {t('vs_ai_desc')}
            </Text>
          </View>

          {/* Difficulty */}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 }}>{t('difficulty')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
            {DIFFICULTIES.map(d => (
              <TouchableOpacity
                key={d.key}
                onPress={() => { setDifficulty(d.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                style={{
                  flex: 1, borderRadius: 12, padding: 10, borderWidth: 2,
                  borderColor: difficulty === d.key ? d.color : 'rgba(255,255,255,0.12)',
                  backgroundColor: difficulty === d.key ? `${d.color}20` : 'rgba(255,255,255,0.05)',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: difficulty === d.key ? d.color : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '900', fontFamily: 'monospace' }}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Level Picker */}
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: 2, marginBottom: 10 }}>{t('select_level')}</Text>
          {games.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'monospace', textAlign: 'center', paddingVertical: 30 }}>{t('no_community_levels')}</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {games.map((game) => {
                const levelCount = game.levels?.length || 0;
                const rating = game.rating ? game.rating.toFixed(1) : null;
                return (
                  <TouchableOpacity
                    key={game.id}
                    onPress={() => startVsAI(game)}
                    style={{
                      borderRadius: 14, padding: 14, borderWidth: 2,
                      borderColor: 'rgba(255,255,255,0.1)',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '900', fontFamily: 'monospace' }} numberOfLines={1}>
                          {game.name}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'monospace', marginTop: 2 }}>
                          by {game.creatorName || 'Unknown'} · {levelCount} {levelCount === 1 ? 'level' : 'levels'}{rating ? ` · ★ ${rating}` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: C.purple, fontSize: 11, fontWeight: '900', fontFamily: 'monospace' }}>{t('play')}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'monospace', textAlign: 'center', marginTop: 14 }}>
            {t('levels_available',{count:games.length})}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
