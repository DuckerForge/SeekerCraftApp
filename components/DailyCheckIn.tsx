// components/DailyCheckIn.tsx - Daily check-in modal with streak rewards
import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width: SW } = Dimensions.get('window');

const STREAK_REWARDS: Record<number, number> = { 1: 10, 3: 25, 7: 100, 14: 250, 30: 500 };

interface Props {
  visible: boolean;
  streak: number;
  onClaim: () => Promise<{ points: number; newStreak: number }>;
  onClose: () => void;
}

export default function DailyCheckIn({ visible, streak, onClaim, onClose }: Props) {
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [reward, setReward] = useState(0);
  const [newStreak, setNewStreak] = useState(streak);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const result = await onClaim();
      setReward(result.points);
      setNewStreak(result.newStreak);
      setClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => onClose(), 2500);
    } catch {
      onClose();
    }
    setClaiming(false);
  };

  const displayStreak = claimed ? newStreak : streak;
  const nextReward = STREAK_REWARDS[displayStreak + 1] || 10;

  // 7-day week view
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: SW * 0.85, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,215,0,0.4)' }}>
          <LinearGradient colors={['#1A0840', '#0D0028', '#0B0033']} style={{ padding: 24, alignItems: 'center' }}>

            {/* Fire streak */}
            <Text style={{ fontSize: 48 }}>{displayStreak >= 7 ? '🔥' : displayStreak >= 3 ? '⭐' : '☀️'}</Text>
            <Text style={{ color: '#FFD700', fontFamily: 'monospace', fontWeight: '900', fontSize: 28, marginTop: 8 }}>
              DAY {displayStreak}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 11, marginTop: 2 }}>
              DAILY CHECK-IN STREAK
            </Text>

            {/* Week dots */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 16 }}>
              {dayLabels.map((d, i) => {
                const filled = i < (displayStreak % 7 || 7);
                return (
                  <View key={i} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 16,
                      backgroundColor: filled ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.06)',
                      borderWidth: 2, borderColor: filled ? '#FFD700' : 'rgba(255,255,255,0.12)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {filled && <Text style={{ color: '#FFD700', fontSize: 12 }}>✓</Text>}
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 8 }}>{d}</Text>
                  </View>
                );
              })}
            </View>

            {/* Milestone callouts */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
              {[{ d: 3, pts: 25 }, { d: 7, pts: 100 }, { d: 14, pts: 250 }, { d: 30, pts: 500 }].map(m => (
                <View key={m.d} style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: displayStreak >= m.d ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.04)',
                  borderWidth: 1, borderColor: displayStreak >= m.d ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.08)',
                }}>
                  <Text style={{
                    color: displayStreak >= m.d ? '#FFD700' : 'rgba(255,255,255,0.25)',
                    fontFamily: 'monospace', fontWeight: '900', fontSize: 9,
                  }}>DAY {m.d}: +{m.pts}</Text>
                </View>
              ))}
            </View>

            {/* Claim / Result */}
            {claimed ? (
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Text style={{ color: '#14F195', fontFamily: 'monospace', fontWeight: '900', fontSize: 22 }}>+{reward} PTS</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: 10, marginTop: 4 }}>
                  {nextReward > 10 ? `Day ${displayStreak + 1}: +${nextReward} PTS bonus!` : 'Come back tomorrow!'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity onPress={handleClaim} disabled={claiming} style={{ borderRadius: 14, overflow: 'hidden', width: '100%' }}>
                <LinearGradient colors={['#FFD700', '#FF9500']} style={{ paddingVertical: 14, alignItems: 'center', borderRadius: 14 }}>
                  {claiming
                    ? <ActivityIndicator color="#000" />
                    : <Text style={{ color: '#000', fontWeight: '900', fontFamily: 'monospace', fontSize: 15 }}>CLAIM REWARD</Text>
                  }
                </LinearGradient>
              </TouchableOpacity>
            )}

            {!claimed && (
              <TouchableOpacity onPress={onClose} style={{ marginTop: 12 }}>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11 }}>SKIP</Text>
              </TouchableOpacity>
            )}

          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}
