// app/credits.tsx — SeekerCraft Credits
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

const C = { bg1:'#040012', bg2:'#0B0033', gold:'#FFD700', purple:'#9945FF', green:'#14F195', text:'#FFF', muted:'rgba(255,255,255,0.45)' };

export default function CreditsScreen() {
  const open = (url: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(url).catch(()=>{}); };
  return (
    <View style={{ flex:1 }}>
      <LinearGradient colors={[C.bg1, C.bg2, C.bg1]} style={StyleSheet.absoluteFill}/>
      <SafeAreaView style={{ flex:1 }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
            <Text style={{ color:C.gold, fontFamily:'monospace', fontWeight:'900', fontSize:14 }}>← BACK</Text>
          </TouchableOpacity>
          <Text style={{ color:C.gold, fontFamily:'monospace', fontWeight:'900', fontSize:16, letterSpacing:2 }}>CREDITS</Text>
          <View style={{ width:60 }}/>
        </View>
        <View style={{ flex:1, justifyContent:'center', alignItems:'center', padding:32, gap:24 }}>
          {/* Developer */}
          <TouchableOpacity onPress={() => open('https://x.com/DuckerForge')}
            style={[st.card, { borderColor:'rgba(153,69,255,0.5)', width:'100%' }]}>
            <LinearGradient colors={['rgba(153,69,255,0.2)','rgba(153,69,255,0.04)']} style={StyleSheet.absoluteFill} borderRadius={18}/>
            <View style={{ alignItems:'center', padding:24, gap:12 }}>
              <View style={{ width:64, height:64, borderRadius:18, backgroundColor:'rgba(153,69,255,0.25)',
                alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'rgba(153,69,255,0.5)' }}>
                <Text style={{ fontSize:32 }}>🦆</Text>
              </View>
              <View style={{ alignItems:'center' }}>
                <Text style={{ color:'#FFF', fontFamily:'monospace', fontWeight:'900', fontSize:16 }}>DuckerForge</Text>
                <Text style={{ color:'rgba(153,69,255,0.9)', fontFamily:'monospace', fontSize:12, marginTop:2 }}>Game Design & Development</Text>
              </View>
              <View style={{ backgroundColor:'rgba(153,69,255,0.25)', borderRadius:12, paddingHorizontal:20, paddingVertical:10, borderWidth:1.5, borderColor:'rgba(153,69,255,0.5)' }}>
                <Text style={{ color:'rgba(153,69,255,1)', fontFamily:'monospace', fontWeight:'900', fontSize:13 }}>@DuckerForge on 𝕏</Text>
              </View>
            </View>
          </TouchableOpacity>
          {/* Pixabay */}
          <TouchableOpacity onPress={() => open('https://pixabay.com')}
            style={[st.card, { borderColor:'rgba(20,241,149,0.4)', width:'100%' }]}>
            <LinearGradient colors={['rgba(20,241,149,0.15)','rgba(20,241,149,0.03)']} style={StyleSheet.absoluteFill} borderRadius={18}/>
            <View style={{ alignItems:'center', padding:24, gap:12 }}>
              <View style={{ width:64, height:64, borderRadius:18, backgroundColor:'rgba(20,241,149,0.2)',
                alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'rgba(20,241,149,0.4)' }}>
                <Text style={{ fontSize:32 }}>🎵</Text>
              </View>
              <View style={{ alignItems:'center' }}>
                <Text style={{ color:'#FFF', fontFamily:'monospace', fontWeight:'900', fontSize:16 }}>Pixabay</Text>
                <Text style={{ color:C.green, fontFamily:'monospace', fontSize:12, marginTop:2 }}>Music & Sound Effects</Text>
                <Text style={{ color:C.muted, fontFamily:'monospace', fontSize:10, marginTop:4, textAlign:'center' }}>All audio licensed under Pixabay Content License</Text>
              </View>
              <View style={{ backgroundColor:'rgba(20,241,149,0.18)', borderRadius:12, paddingHorizontal:20, paddingVertical:10, borderWidth:1.5, borderColor:'rgba(20,241,149,0.4)' }}>
                <Text style={{ color:C.green, fontFamily:'monospace', fontWeight:'900', fontSize:13 }}>pixabay.com ↗</Text>
              </View>
            </View>
          </TouchableOpacity>
          <Text style={{ color:'rgba(255,255,255,0.15)', fontFamily:'monospace', fontSize:9, textAlign:'center' }}>© 2025 DuckerForge · SeekerCraft</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
const st = StyleSheet.create({
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.06)' },
  card: { borderRadius:18, borderWidth:1.5, overflow:'hidden' },
});
