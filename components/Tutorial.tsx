// components/Tutorial.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide">
    <View style={st.overlay}>
    <View style={st.card}>

    <View style={st.tabs}>
    {(['howto','goal','pegs'] as const).map(k => (
      <TouchableOpacity key={k} onPress={() => { setTab(k); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        style={[st.tab, tab===k && st.tabActive]}>
        <Text style={[st.tabText, tab===k && st.tabTextActive]}>
          {k==='howto' ? t('game_tut_howto') : k==='goal' ? t('game_tut_goal') : t('game_tut_pegs')}
        </Text>
      </TouchableOpacity>
    ))}
    </View>

    <ScrollView style={st.body} showsVerticalScrollIndicator={false}>

    {tab === 'howto' && (
      <View style={st.section}>
      <View style={st.row}><Text style={st.bullet}>1.</Text><Text style={st.bodyText}>{t('game_tut_step1')}</Text></View>
      <View style={st.row}><Text style={st.bullet}>2.</Text><Text style={st.bodyText}>{t('game_tut_step2')}</Text></View>
      <View style={st.row}><Text style={st.bullet}>3.</Text><Text style={st.bodyText}>{t('game_tut_step3')}</Text></View>
      <View style={st.row}><Text style={st.bullet}>4.</Text><Text style={st.bodyText}>{t('game_tut_step4')}</Text></View>
      <View style={st.row}><Text style={st.bullet}>5.</Text><Text style={st.bodyText}>{t('game_tut_step5')}</Text></View>
      </View>
    )}

    {tab === 'goal' && (
      <View style={st.section}>
      <View style={st.goalBox}>
        <Text style={st.goalTitle}>{t('game_tut_goal_title')}</Text>
        <Text style={st.goalSub}>{t('game_tut_goal_desc')}</Text>
      </View>
      <View style={[st.goalBox, {borderColor: C.gold+'60', marginTop:12}]}>
        <Text style={[st.goalTitle, {color:C.gold}]}>{t('game_tut_scoring_title')}</Text>
        <Text style={st.goalSub}>{t('game_tut_scoring_values')}</Text>
      </View>
      </View>
    )}

    {tab === 'pegs' && (
      <View style={st.section}>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/skr.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:'#888'}]}>{t('game_tut_skr_name')}</Text>
          <Text style={st.pegDesc}>{t('game_tut_skr_desc')}</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/btc.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.orange}]}>{t('game_tut_btc_name')}</Text>
          <Text style={st.pegDesc}>{t('game_tut_btc_desc')}</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/sol.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.blue}]}>{t('game_tut_sol_name')}</Text>
          <Text style={st.pegDesc}>{t('game_tut_sol_desc')}</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/bump.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:C.green}]}>{t('game_tut_bumper_name')}</Text>
          <Text style={st.pegDesc}>{t('game_tut_bumper_desc')}</Text>
        </View>
      </View>
      <View style={st.pegRow}>
        <Image source={require('../assets/images/Peg/curva.png')} style={st.pegIcon}/>
        <View style={st.pegInfo}>
          <Text style={[st.pegName, {color:'#AA00FF'}]}>{t('game_tut_vortex_name')}</Text>
          <Text style={st.pegDesc}>{t('game_tut_vortex_desc')}</Text>
        </View>
      </View>
      </View>
    )}

    </ScrollView>

    <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); try{(global as any).showAchievement?.('tutorial_done');}catch{} onClose(); }} style={st.okBtn}>
      <Text style={st.okText}>{t('ok')}</Text>
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
