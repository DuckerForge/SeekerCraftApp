// components/AchievementToast.tsx - Steam-style achievement notification with fee gate
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, Text, StyleSheet, Dimensions, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { ACHIEVEMENT_MAP, RARITY_COLORS, RARITY_GLOW } from '@/utils/achievements';
import AsyncStorage from '@react-native-async-storage/async-storage';
// FIX: static imports (dynamic import inside functions crashes)
import { payAchievementFee } from '@/utils/payments';
import { unlockAchievement, logActivity } from '@/utils/firebase';

const { width: SW } = Dimensions.get('window');

interface Props {
  achievementKey: string | null;
  onDone: () => void;
}

export default function AchievementToast({ achievementKey, onDone }: Props) {
  const slideY   = useRef(new Animated.Value(120)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  // FIX: use 'width' animation instead of scaleX + transformOrigin (unsupported in RN)
  const fillAnim = useRef(new Animated.Value(0)).current;
  const [paying, setPaying] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!achievementKey) return;
    // FIX: guard against ACHIEVEMENT_MAP being undefined during module init
    if (!ACHIEVEMENT_MAP) { onDone(); return; }
    const ach = ACHIEVEMENT_MAP[achievementKey];
    if (!ach) { onDone(); return; }

    // FIX: removed achievements_seen blocking — show every time until paid/unlocked
    setUnlocked(false);
    setPaying(false);
    fillAnim.setValue(0);

    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss after 4s if user doesn't interact (prevents spam when many achievements queue)
    timerRef.current = setTimeout(() => { dismissToast(); }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [achievementKey]);

  const dismissToast = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(slideY, { toValue: 130, duration: 380, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      slideY.setValue(120);
      opacity.setValue(0);
      fillAnim.setValue(0);
      onDone();
    });
  };

  const handlePayToUnlock = async () => {
    if (!achievementKey) return;
    setPaying(true);
    if (timerRef.current) clearTimeout(timerRef.current);

    try {
      const addr = await AsyncStorage.getItem('wallet_address');
      if (!addr) {
        Alert.alert('Connect wallet first');
        setPaying(false);
        return;
      }

      const result = await payAchievementFee(addr);

      if (result.success) {
        await unlockAchievement(addr, achievementKey);

        const displayName = await AsyncStorage.getItem('display_name') || addr.slice(0, 8);
        const ach = ACHIEVEMENT_MAP[achievementKey];
        logActivity(addr, displayName, 'achievement_unlocked', ach?.name || achievementKey).catch(() => {});

        setUnlocked(true);
        // FIX: width animation from 0 → '100%' — useNativeDriver false required
        Animated.timing(fillAnim, { toValue: 1, duration: 1200, useNativeDriver: false }).start();

        timerRef.current = setTimeout(() => { dismissToast(); }, 3000);
      } else {
        Alert.alert('Payment Failed', result.error || 'Transaction rejected');
        timerRef.current = setTimeout(() => { dismissToast(); }, 2000);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process payment');
      timerRef.current = setTimeout(() => { dismissToast(); }, 2000);
    }
    setPaying(false);
  };

  if (!achievementKey) return null;
  if (!ACHIEVEMENT_MAP) return null;
  const ach = ACHIEVEMENT_MAP[achievementKey];
  if (!ach) return null;

  const rarityColor = RARITY_COLORS[ach.rarity] || '#9CA3AF';
  const rarityGlow  = RARITY_GLOW[ach.rarity] || 'rgba(156,163,175,0.4)';
  const rarityLabel = ach.rarity.toUpperCase();

  // FIX: width interpolation replaces transformOrigin (not supported in RN)
  const fillWidth = fillAnim.interpolate({ inputRange:[0,1], outputRange:['0%','100%'] });

  return (
    <Animated.View style={[st.container, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={[st.glowBorder, { borderColor: rarityColor, shadowColor: rarityGlow }]}/>
      <View style={[st.accentBar, { backgroundColor: rarityColor }]}/>
      <View style={[st.iconBox, { backgroundColor: rarityGlow }]}>
        <Text style={st.iconText}>{ach.icon}</Text>
      </View>

      <View style={st.textArea}>
        <View style={st.topRow}>
          <Text style={st.achLabel}>
            {unlocked ? 'ACHIEVEMENT UNLOCKED' : 'NEW ACHIEVEMENT'}
          </Text>
          <View style={[st.rarityBadge, { backgroundColor: rarityColor + '30', borderColor: rarityColor }]}>
            <Text style={[st.rarityText, { color: rarityColor }]}>{rarityLabel}</Text>
          </View>
        </View>
        <Text style={st.achName}>{ach.name}</Text>
        <Text style={st.achDesc} numberOfLines={1}>{ach.description}</Text>

        {!unlocked && (
          <View style={st.actionRow}>
            <TouchableOpacity onPress={handlePayToUnlock} disabled={paying}
              style={[st.payBtn, { borderColor: rarityColor }]}>
              {paying
                ? <ActivityIndicator color={rarityColor} size="small"/>
                : <Text style={[st.payBtnText, { color: rarityColor }]}>🔓 $0.50 UNLOCK</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={dismissToast} style={st.skipBtn}>
              <Text style={st.skipBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* FIX: bottom progress bar using width animation (no transformOrigin) */}
      <View style={st.progressBg}>
        <Animated.View style={[st.progressFill, { backgroundColor: rarityColor, width: fillWidth }]}/>
      </View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90, left: 16, right: 16,
    backgroundColor: 'rgba(8,4,24,0.96)',
    borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14, gap: 12,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6, shadowRadius: 16,
    zIndex: 9999,
  },
  glowBorder: {
    position: 'absolute', top:0, left:0, right:0, bottom:0,
    borderRadius: 12, borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 12,
  },
  accentBar: {
    position: 'absolute', left:0, top:0, bottom:0, width:4,
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
  },
  iconBox: { width:48, height:48, borderRadius:10, justifyContent:'center', alignItems:'center', marginLeft:8 },
  iconText: { fontSize: 26 },
  textArea: { flex:1, gap:2 },
  topRow: { flexDirection:'row', alignItems:'center', gap:6 },
  achLabel: {
    color:'rgba(255,255,255,0.45)', fontSize:9, fontWeight:'700',
    fontFamily:'monospace', letterSpacing:1.2, textTransform:'uppercase',
  },
  rarityBadge: { borderWidth:1, borderRadius:4, paddingHorizontal:5, paddingVertical:1 },
  rarityText: { fontSize:8, fontWeight:'900', fontFamily:'monospace', letterSpacing:0.5 },
  achName: { color:'#FFF', fontSize:14, fontWeight:'900', fontFamily:'monospace', letterSpacing:0.3 },
  achDesc: { color:'rgba(255,255,255,0.5)', fontSize:11, fontFamily:'monospace' },
  actionRow: { flexDirection:'row', alignItems:'center', gap:8, marginTop:6 },
  payBtn: { borderWidth:1.5, borderRadius:8, paddingHorizontal:12, paddingVertical:5, backgroundColor:'rgba(255,255,255,0.05)' },
  payBtnText: { fontSize:10, fontWeight:'900', fontFamily:'monospace', letterSpacing:0.5 },
  skipBtn: { paddingHorizontal:8, paddingVertical:4 },
  skipBtnText: { color:'rgba(255,255,255,0.3)', fontSize:14, fontWeight:'900' },
  progressBg: {
    position:'absolute', bottom:0, left:0, right:0, height:3,
    backgroundColor:'rgba(255,255,255,0.07)',
  },
  progressFill: { position:'absolute', left:0, top:0, bottom:0 },
});
