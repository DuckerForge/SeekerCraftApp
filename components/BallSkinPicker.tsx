// components/BallSkinPicker.tsx - Ball skin selection modal
import React from 'react';
import { View, Text, Modal, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');

const SKINS = [
  { key: 'default',   name: 'CLASSIC',  color: 'white',               shadow: '#00FFFF', desc: 'Clean & simple' },
  { key: 'gold',      name: 'GOLD',     color: '#FFD700',             shadow: '#FFD700', desc: 'Pure gold' },
  { key: 'crystal',   name: 'CRYSTAL',  color: 'rgba(190,240,255,1)', shadow: '#4FC3F7', desc: 'Ice cold' },
  { key: 'neon_blue', name: 'NEON',     color: '#00D4FF',             shadow: '#00D4FF', desc: 'Electric blue' },
  { key: 'fire',      name: 'FIRE',     color: '#FF4500',             shadow: '#FF4500', desc: 'Burning hot' },
  { key: 'rainbow',   name: 'RAINBOW',  color: '#FF69B4',             shadow: '#FF69B4', desc: 'Fabulous' },
];

interface Props {
  visible: boolean;
  selected: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}

export default function BallSkinPicker({ visible, selected, onSelect, onClose }: Props) {
  const handleSelect = async (key: string) => {
    await AsyncStorage.setItem('ball_skin_selected', key);
    onSelect(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: SW * 0.88, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(0,212,255,0.4)' }}>
          <LinearGradient colors={['#1A0840', '#0D0028']} style={{ padding: 20 }}>
            <Text style={{ color: '#00D4FF', fontSize: 16, fontWeight: '900', fontFamily: 'monospace', textAlign: 'center', marginBottom: 4, letterSpacing: 2 }}>
              BALL SKIN
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'monospace', textAlign: 'center', marginBottom: 18 }}>
              Choose your style
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {SKINS.map(s => {
                const isSelected = selected === s.key;
                return (
                  <TouchableOpacity key={s.key} onPress={() => handleSelect(s.key)}
                    style={{
                      width: (SW * 0.88 - 60) / 3, alignItems: 'center', padding: 12, borderRadius: 16,
                      backgroundColor: isSelected ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
                      borderWidth: 2, borderColor: isSelected ? '#00D4FF' : 'rgba(255,255,255,0.08)',
                    }}>
                    {/* Ball preview */}
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: s.color,
                      shadowColor: s.shadow, shadowRadius: 12, shadowOpacity: 0.8,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 8,
                    }} />
                    <Text style={{
                      color: isSelected ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                      fontFamily: 'monospace', fontWeight: '900', fontSize: 9, marginTop: 8,
                    }}>{s.name}</Text>
                    <Text style={{
                      color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 8, marginTop: 2,
                    }}>{s.desc}</Text>
                    {isSelected && <Text style={{ color: '#00D4FF', fontSize: 8, marginTop: 4 }}>EQUIPPED</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity onPress={onClose} style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontWeight: '900', fontFamily: 'monospace', fontSize: 11 }}>CLOSE</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}
