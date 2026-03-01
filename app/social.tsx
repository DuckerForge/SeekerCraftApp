// app/social.tsx — SeekerCraft X page
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

export default function SocialScreen() {
  const follow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Linking.openURL('https://x.com/SeekerCraftApp').catch(()=>{});
  };
  return (
    <View style={{ flex:1 }}>
      <LinearGradient colors={['#040012','#0B0033','#040012']} style={StyleSheet.absoluteFill}/>
      <SafeAreaView style={{ flex:1 }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
            <Text style={{ color:'#FFD700', fontFamily:'monospace', fontWeight:'900', fontSize:14 }}>← BACK</Text>
          </TouchableOpacity>
          <Text style={{ color:'#FFD700', fontFamily:'monospace', fontWeight:'900', fontSize:16, letterSpacing:2 }}>FOLLOW US</Text>
          <View style={{ width:60 }}/>
        </View>
        <View style={{ flex:1, justifyContent:'center', alignItems:'center', padding:32 }}>
          <TouchableOpacity onPress={follow} activeOpacity={0.85}
            style={{ width:'100%', borderRadius:24, overflow:'hidden', borderWidth:2, borderColor:'rgba(255,255,255,0.25)' }}>
            <LinearGradient colors={['#111','#1a1a2e','#111']} style={{ padding:40, alignItems:'center', gap:20 }}>
              <View style={{ width:80, height:80, borderRadius:20, backgroundColor:'#000',
                alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'rgba(255,255,255,0.2)' }}>
                <Text style={{ color:'#FFF', fontSize:40, fontWeight:'900' }}>𝕏</Text>
              </View>
              <View style={{ alignItems:'center', gap:6 }}>
                <Text style={{ color:'#FFF', fontFamily:'monospace', fontWeight:'900', fontSize:22, letterSpacing:2 }}>@SeekerCraftApp</Text>
                <Text style={{ color:'rgba(255,255,255,0.45)', fontFamily:'monospace', fontSize:12 }}>Updates · Tips · Community</Text>
              </View>
              <LinearGradient colors={['#FFF','#DDD']} style={{ borderRadius:14, paddingHorizontal:32, paddingVertical:14, width:'100%', alignItems:'center' }}>
                <Text style={{ color:'#000', fontWeight:'900', fontFamily:'monospace', fontSize:15, letterSpacing:1 }}>FOLLOW ON 𝕏</Text>
              </LinearGradient>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
const st = StyleSheet.create({
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
});
