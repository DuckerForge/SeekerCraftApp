// components/Tutorial.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Image } from 'react-native';
import * as Haptics from 'expo-haptics';

const C = {
  bg1:'#0B0033', bg2:'#1A0066',
  gold:'#FFD700', orange:'#FF6B00',
  blue:'#3B82F6', green:'#22C55E', gray:'#6B7280',
  text:'#FFF', muted:'rgba(255,255,255,0.55)',
  surface:'rgba(255,255,255,0.07)',
};

interface Props { visible: boolean; onClose: () => void; }

export default function Tutorial({ visible, onClose }: Props) {
  const [tab, setTab] = useState<'howto'|'goal'|'pegs'>('howto');

  return (
    <Modal visible={visible} transparent animationType="slide">
    <View style={st.overlay}>
    <View style={st.card}>

    {/* TABS */}
    <View style={st.tabs}>
    {(['howto','goal','pegs'] as const).map(t => (
      <TouchableOpacity key={t} onPress={() => { setTab(t); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        style={[st.tab, tab===t && st.tabActive]}>
        <Text style={[st.tabText, tab===t && st.tabTextActive]}>
          {t==='howto' ? 'HOW TO PLAY' : t==='goal' ? 'GOAL' : 'PEGS'}
        </Text>
      </TouchableOpacity>
    ))}
    </View>

    <ScrollView style={st.body} showsVerticalScrollIndicator={false}>

    {tab === 'howto' && (
      <View style={st.section}>
      <View style={st.row}><Text style={st.bullet}>1.</Text><Text style={st.bodyText}>Drag to aim, release to shoot the ball.</Text></View>
      <View style={st.row}><Text style={st.bullet}>2.</Text><Text style={st.bodyText}>Hit pegs to score points. Hit-pegs disappear after each ball.</Text></View>
      <View style={st.row}><Text style={st.bullet}>3.</Text><Text style={st.bodyText}>Catch the ball in the moving bucket at the bottom to earn a free ball.</Text></View>
      <View style={st.row}><Text style={st.bullet}>4.</Text><Text style={st.bodyText}>Hit SOL pegs for a chance to activate power-ups.</Text></View>
      <View style={st.row}><Text style={st.bullet}>5.</Text><Text style={st.bodyText}>Build combos by hitting many pegs in one shot for bonus points.</Text></View>
      </View>
    )}

    {tab === 'goal' && (
      <View style={st.section}>
      <View style={st.goalBox}>
        <Text style={st.goalTitle}>HIT ALL SKR PEGS</Text>
        <Text style={st.goalSub}>Clear every black SKR peg to complete the level. Run out of balls before hitting all SKR pegs and it's game over!</Text>
      </View>
      <View style={[st.goalBox, {borderColor: C.gold+'60', marginTop:12}]}>
        <Text style={[st.goalTitle, {color:C.gold}]}>SCORING</Text>
        <Text style={st.goalSub}>SKR +50 pts  •  BTC +25 pts  •  SOL +10 pts  •  Combos multiply your score</Text>
      </View>
      </View>
    )}

    {tab === 'pegs' && (
      <View style={st.section}>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/skr.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.gold}]}>SKR — REQUIRED</Text>
          <Text style={st.pegDesc}>Hit ALL of these to win. +50 pts each.</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/btc.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.orange}]}>BTC — BONUS</Text>
          <Text style={st.pegDesc}>Optional bonus pegs. +25 pts each.</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/sol.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.blue}]}>SOL — POWER-UP</Text>
          <Text style={st.pegDesc}>30% chance to trigger Multiball, Fireball or Slow Bucket. +10 pts.</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/bump.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.green}]}>STAR — BUMPER</Text>
          <Text style={st.pegDesc}>Powerful bounce, never disappears. Always active.</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/curva.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:'#AA00FF'}]}>VORTEX</Text>
          <Text style={st.pegDesc}>Captures the ball and launches it in a random direction.</Text>
        </View>
      </View>
      </View>
    )}

    </ScrollView>

    {/* CLOSE */}
    <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); try{(global as any).showAchievement?.('tutorial_done');}catch{} onClose(); }} style={st.okBtn}>
      <Text style={st.okText}>OK</Text>
    </TouchableOpacity>

    </View>
    </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex:1, backgroundColor:'rgba(0,0,0,0.82)', justifyContent:'center', padding:20 },
  card: { backgroundColor:C.bg2, borderRadius:20, borderWidth:1.5, borderColor:'rgba(255,215,0,0.3)', maxHeight:'80%', overflow:'hidden' },

  tabs: { flexDirection:'row', borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.1)' },
  tab: { flex:1, paddingVertical:14, alignItems:'center' },
  tabActive: { borderBottomWidth:2, borderBottomColor:C.gold },
  tabText: { color:C.muted, fontSize:11, fontWeight:'bold', fontFamily:'monospace', letterSpacing:0.5 },
  tabTextActive: { color:C.gold },

  body: { padding:18, flexShrink:1 },
  section: { gap:12 },

  row: { flexDirection:'row', gap:10, alignItems:'flex-start' },
  bullet: { color:C.gold, fontSize:16, fontWeight:'900', width:22 },
  bodyText: { color:C.text, fontSize:13, fontFamily:'monospace', flex:1, lineHeight:20 },

  goalBox: { backgroundColor:'rgba(255,255,255,0.05)', borderRadius:12, padding:16, borderWidth:1.5, borderColor:'rgba(255,255,255,0.15)' },
  goalTitle: { color:C.text, fontSize:16, fontWeight:'900', fontFamily:'monospace', marginBottom:8 },
  goalSub: { color:C.muted, fontSize:12, fontFamily:'monospace', lineHeight:20 },

  pegRow: { flexDirection:'row', alignItems:'center', gap:14, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,0.07)' },
  pegIcon: { width:40, height:40, resizeMode:'contain' },
  pegInfo: { flex:1 },
  pegName: { fontSize:13, fontWeight:'900', fontFamily:'monospace', marginBottom:3 },
  pegDesc: { color:C.muted, fontSize:11, fontFamily:'monospace', lineHeight:16 },

  okBtn: { margin:16, backgroundColor:C.gold, borderRadius:12, paddingVertical:14, alignItems:'center' },
  okText: { color:'#000', fontWeight:'900', fontFamily:'monospace', fontSize:16, letterSpacing:1 },
});
