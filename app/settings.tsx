// app/settings.tsx - Profile & Achievements 🏅 Candy style
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Dimensions, TextInput, Alert, Switch, ActivityIndicator, Image, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { update, ref } from 'firebase/database';
import { logActivity, database, unlockAchievement } from '@/utils/firebase';
import { payAchievementFee } from '@/utils/payments';
import { useWallet } from '@/utils/walletContext';
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, RARITY_COLORS, type Rarity } from '@/utils/achievements';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';

const { width: SW } = Dimensions.get('window');
const ICON_COPPA  = require('../assets/images/Icons/coppa.png');
const ICON_BROWSE = require('../assets/images/Icons/Browse.png');
const ICON_STELLA = require('../assets/images/Icons/stella.png');
const ICON_PLAY   = require('../assets/images/Icons/play.png');
const ICON_SAVE   = require('../assets/images/Icons/save.png');

const C = {
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  pink:'#FF69B4', mint:'#00F0B5', cyan:'#00D4FF',
  purple:'#9945FF', lime:'#8BFF00', blue:'#3B7DFF', red:'#FF3860',
  dark:'#0D0028',
};

export default function SettingsScreen(){
  const {user,connected,disconnect,switchAccount,refreshUser}=useWallet();
  const [editingName,setEditingName]=useState(false);
  const [earnableKeys,setEarnableKeys]=useState<Set<string>>(new Set());
  const [nameInput,setNameInput]=useState('');
  const [muted,setMuted]=useState(false);
  const mutedRef = useRef(false);
  const skrPlayer = useAudioPlayer(require('../assets/skr.mp3'));
  useEffect(()=>{
    AsyncStorage.getItem('global_muted').then(v=>{mutedRef.current=v==='1';});
    const {DeviceEventEmitter}=require('react-native');
    const sub=DeviceEventEmitter.addListener('MUTE_CHANGED',({muted:m}:{muted:boolean})=>{mutedRef.current=m;});
    return()=>sub.remove();
  },[]);
  const playSkr=()=>{if(mutedRef.current)return;try{skrPlayer.seekTo(0);skrPlayer.play();}catch{}};
  const [tab,setTab]=useState<'stats'|'achievements'|'wallet'|'privacy'>('stats');
  const visitedTabsRef=useRef<Set<string>>(new Set(['stats']));
  const [achFilter,setAchFilter]=useState<string>('all');
  const [payingAch,setPayingAch]=useState<string|null>(null);

  useFocusEffect(useCallback(()=>{
    AsyncStorage.getItem('earnable_achievements').then(v=>{if(v){try{setEarnableKeys(new Set(JSON.parse(v)));}catch{}}});
    AsyncStorage.getItem('global_muted').then(v=>setMuted(v==='1'));
    refreshUser();
  },[]));

  const handleToggleMute=async(val:boolean)=>{
    setMuted(val);
    await AsyncStorage.setItem('global_muted',val?'1':'0');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveName=async()=>{
    if(!user||!nameInput.trim())return;
    try{
      await update(ref(database,`users/${user.walletAddress}`),{displayName:nameInput.trim()});
      await AsyncStorage.setItem('display_name',nameInput.trim());
      await refreshUser();
      setEditingName(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Name Updated','Your display name has been updated!');
      logActivity(user.walletAddress,nameInput.trim(),'name_changed').catch(()=>{});
      try{(global as any).showAchievement?.('profile_complete');}catch{}
    }catch{Alert.alert('Error','Could not update name');}
  };

  const handlePayAchievement=async(key:string)=>{
    if(payingAch)return;
    setPayingAch(key);
    try{
      const addr=user?.walletAddress;
      if(!addr){Alert.alert('Connect wallet first');setPayingAch(null);return;}
      const result=await payAchievementFee(addr);
      if(result.success){
        await unlockAchievement(addr,key);
        await refreshUser();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('🏆 Achievement Unlocked!',ACHIEVEMENT_MAP[key]?.name||key);
        setEarnableKeys(prev=>{const n=new Set(prev);n.delete(key);return n;});
        const stored=await AsyncStorage.getItem('earnable_achievements');
        const arr:string[]=stored?JSON.parse(stored):[];
        await AsyncStorage.setItem('earnable_achievements',JSON.stringify(arr.filter(k=>k!==key)));
      }else{Alert.alert('Payment Failed',result.error||'Transaction rejected');}
    }catch(err:any){Alert.alert('Error',err.message||'Could not process payment');}
    setPayingAch(null);
  };

  const unlockedKeys=new Set(Object.keys(user?.achievements||{}));
  const unlockedCount=unlockedKeys.size;
  const totalCount=ACHIEVEMENTS?.length||0;
  const pct=totalCount>0?Math.round((unlockedCount/totalCount)*100):0;
  const shortAddr=user?.walletAddress?`${user.walletAddress.slice(0,6)}...${user.walletAddress.slice(-6)}`:'—';
  const minutesPlayed=user?.minutesPlayed||0;
  const hoursStr=minutesPlayed>=60?`${Math.floor(minutesPlayed/60)}h ${minutesPlayed%60}m`:`${minutesPlayed}m`;

  const TABS=[
    {key:'stats',       label:'📊 STATS',    c:C.yellow},
    {key:'achievements',label:'🏅 BADGES',   c:C.mint},
    {key:'wallet',      label:'💳 WALLET',   c:C.cyan},
    {key:'privacy',     label:'🔒 PRIVACY',  c:C.purple},
  ] as const;

  const STAT_ITEMS=[
    {label:'TOTAL SCORE',   val:(user?.totalScore||0).toLocaleString(), c:C.yellow},
    {label:'WEEKLY SCORE',  val:(user?.weeklyScore||0).toLocaleString(),c:C.purple},
    {label:'LEVELS PLAYED', val:String(user?.levelsPlayed||0),          c:C.cyan},
    {label:'COMPLETED',     val:String(user?.levelsCompleted||0),        c:C.mint},
    {label:'CREATED',       val:String(user?.levelsCreated||0),          c:C.orange},
    {label:'TIME PLAYED',   val:hoursStr,                                c:C.pink},
  ];

  return(
    <View style={{flex:1}}>
      <ImageBackground source={require('../assets/images/Peg/wallpaper/badges.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover">
        <LinearGradient colors={['rgba(0,10,40,0.82)','rgba(0,20,60,0.75)','rgba(0,10,40,0.88)']} style={StyleSheet.absoluteFill}/>
      </ImageBackground>

      <SafeAreaView style={{flex:1}}>
        {/* HEADER */}
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:10}}>
          <TouchableOpacity onPress={()=>router.back()} style={{borderRadius:14,overflow:'hidden'}}>
            <LinearGradient colors={[C.orange,C.coral]} style={{paddingHorizontal:14,paddingVertical:8}}>
              <Text style={{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:12}}>← BACK</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={{color:'#fff',fontSize:16,fontWeight:'900',fontFamily:'monospace',letterSpacing:3}}>PROFILE</Text>
          <View style={{width:70}}/>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:44}}>

          {/* PROFILE CARD */}
          <View style={st.profileCard}>
            <LinearGradient colors={['rgba(153,69,255,0.20)','rgba(0,212,255,0.10)']} style={{...StyleSheet.absoluteFillObject,borderRadius:22}}/>
            {/* Avatar */}
            <View style={{width:72,height:72,borderRadius:36,overflow:'hidden',alignItems:'center',justifyContent:'center',
              borderWidth:4,borderColor:C.orange,shadowColor:C.orange,shadowRadius:16,shadowOpacity:0.8}}>
              <LinearGradient colors={[C.orange,C.purple]} style={{...StyleSheet.absoluteFillObject}}/>
              <Text style={{color:'#fff',fontSize:32,fontWeight:'900',fontFamily:'monospace'}}>
                {user?.displayName?.[0]?.toUpperCase()||'?'}
              </Text>
            </View>
            {/* Name / edit */}
            <View style={{flex:1}}>
              {editingName?(
                <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
                  <TextInput value={nameInput} onChangeText={setNameInput}
                    style={{flex:1,color:'#fff',fontFamily:'monospace',fontSize:14,
                      backgroundColor:'rgba(255,255,255,0.12)',borderRadius:12,
                      paddingHorizontal:12,paddingVertical:8,borderWidth:2,borderColor:`${C.yellow}60`}}
                    autoFocus maxLength={20} placeholderTextColor="rgba(255,255,255,0.3)" placeholder="Enter name..."/>
                  <TouchableOpacity onPress={handleSaveName} style={{borderRadius:12,overflow:'hidden'}}>
                    <LinearGradient colors={[C.yellow,C.orange]} style={{paddingHorizontal:14,paddingVertical:10}}>
                      <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:12}}>SAVE</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ):(
                <TouchableOpacity onPress={()=>{setNameInput(user?.displayName||'');setEditingName(true);}}>
                  <Text style={{color:'#fff',fontSize:18,fontWeight:'900',fontFamily:'monospace'}}>{user?.displayName||'Anonymous'}</Text>
                  <Text style={{color:'rgba(255,255,255,0.45)',fontSize:10,fontFamily:'monospace',marginTop:2}}>tap to edit name ✏️</Text>
                </TouchableOpacity>
              )}
              <Text style={{color:'rgba(255,255,255,0.35)',fontSize:10,fontFamily:'monospace',marginTop:4}}>{shortAddr}</Text>
            </View>
            {/* Achievement badge */}
            <View style={{alignItems:'center',backgroundColor:'rgba(255,255,255,0.12)',borderRadius:18,padding:14,borderWidth:2.5,borderColor:`${C.yellow}60`,minWidth:80}}>
              <Image source={ICON_COPPA} style={{width:48,height:48,resizeMode:'contain',marginBottom:6}}/>
              <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:16}}>{unlockedCount}/{totalCount}</Text>
              <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:9,marginTop:2,letterSpacing:1}}>BADGES</Text>
            </View>
          </View>

          {/* TABS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{paddingLeft:16,marginBottom:14}}>
            <View style={{flexDirection:'row',gap:8,paddingRight:16}}>
              {TABS.map(t=>(
                <TouchableOpacity key={t.key} onPress={()=>{setTab(t.key);visitedTabsRef.current.add(t.key);if(visitedTabsRef.current.size>=4)try{(global as any).showAchievement?.('settings_explorer');}catch{}Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);if(t.key==='achievements')playSkr();}}
                  style={{paddingHorizontal:16,paddingVertical:10,borderRadius:16,
                    backgroundColor:tab===t.key?`${t.c}20`:'rgba(255,255,255,0.08)',
                    borderWidth:2.5,borderColor:tab===t.key?t.c:'rgba(255,255,255,0.15)',
                    shadowColor:tab===t.key?t.c:'transparent',
                    shadowRadius:tab===t.key?10:0,shadowOpacity:0.7}}>
                  <Text style={{color:tab===t.key?t.c:'rgba(255,255,255,0.45)',
                    fontFamily:'monospace',fontWeight:'900',fontSize:11}}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* ── STATS ── */}
          {tab==='stats'&&(
            <View style={{paddingHorizontal:16,gap:12}}>
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
                {STAT_ITEMS.map(s=>(
                  <View key={s.label} style={{flex:1,minWidth:(SW-52)/2-5,
                    backgroundColor:`${s.c}15`,borderRadius:18,padding:16,
                    alignItems:'center',borderWidth:2.5,borderColor:`${s.c}40`,
                    shadowColor:s.c,shadowRadius:8,shadowOpacity:0.4}}>
                    <Text style={{color:s.c,fontSize:22,fontWeight:'900',fontFamily:'monospace'}}>{s.val}</Text>
                    <Text style={{color:'rgba(255,255,255,0.45)',fontSize:9,fontFamily:'monospace',marginTop:4}}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {/* Achievement progress */}
              <View style={{borderRadius:20,overflow:'hidden',borderWidth:2.5,borderColor:`${C.yellow}40`}}>
                <LinearGradient colors={[`${C.yellow}15`,`${C.purple}10`]} style={{padding:18}}>
                  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                      <Image source={ICON_COPPA} style={{width:22,height:22,resizeMode:'contain'}}/>
                      <Text style={{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:13,letterSpacing:1}}>ACHIEVEMENTS</Text>
                    </View>
                    <Text style={{color:C.yellow,fontFamily:'monospace',fontSize:13,fontWeight:'900'}}>{unlockedCount} / {totalCount}</Text>
                  </View>
                  <View style={{height:14,backgroundColor:'rgba(255,255,255,0.10)',borderRadius:7,overflow:'hidden',borderWidth:1.5,borderColor:`${C.yellow}30`}}>
                    <LinearGradient colors={[C.yellow,C.orange,C.coral,C.purple]}
                      start={{x:0,y:0}} end={{x:1,y:0}}
                      style={{height:'100%',width:`${pct}%`,borderRadius:7}}/>
                  </View>
                  <Text style={{color:`${C.yellow}AA`,fontSize:10,fontFamily:'monospace',marginTop:8}}>{pct}% complete — keep going! 🚀</Text>
                </LinearGradient>
              </View>
            </View>
          )}

          {/* ── ACHIEVEMENTS ── */}
          {tab==='achievements'&&(
            <View style={{paddingHorizontal:16}}>
              {/* Count boxes */}
              <View style={{flexDirection:'row',gap:10,marginBottom:16}}>
                {[
                  {val:unlockedCount,    lbl:'UNLOCKED',c:C.mint},
                  {val:earnableKeys.size,lbl:'READY →',  c:C.yellow},
                  {val:totalCount-unlockedCount,lbl:'LOCKED',c:'rgba(255,255,255,0.25)'},
                ].map(s=>(
                  <View key={s.lbl} style={{flex:1,backgroundColor:`${s.c}15`,borderRadius:16,padding:12,
                    alignItems:'center',borderWidth:2,borderColor:`${s.c}40`}}>
                    <Text style={{color:s.c,fontSize:22,fontWeight:'900',fontFamily:'monospace'}}>{s.val}</Text>
                    <Text style={{color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',marginTop:3}}>{s.lbl}</Text>
                  </View>
                ))}
              </View>

              {/* Category filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
                <View style={{flexDirection:'row',gap:8,paddingRight:16}}>
                  {['all','player','score','creator','duel','donation','social','special'].map(cat=>(
                    <TouchableOpacity key={cat} onPress={()=>setAchFilter(cat)}
                      style={{paddingHorizontal:12,paddingVertical:7,borderRadius:20,
                        backgroundColor:achFilter===cat?`${C.yellow}20`:'rgba(255,255,255,0.07)',
                        borderWidth:2,borderColor:achFilter===cat?C.yellow:'rgba(255,255,255,0.12)'}}>
                      <Text style={{color:achFilter===cat?C.yellow:'rgba(255,255,255,0.45)',
                        fontSize:10,fontFamily:'monospace',fontWeight:'900',textTransform:'uppercase'}}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Achievement list */}
              {(ACHIEVEMENTS||[])
                .filter(a=>achFilter==='all'||a.category===achFilter)
                .map(ach=>{
                  const isUnlocked=unlockedKeys.has(ach.key);
                  const isEarnable=!isUnlocked&&earnableKeys.has(ach.key);
                  const isLocked=!isUnlocked&&!isEarnable;
                  const rarityColor=(RARITY_COLORS||{})[ach.rarity as Rarity]||'#9CA3AF';
                  const isPaying=payingAch===ach.key;
                  return(
                    <View key={ach.key} style={[st.achRow,
                      isUnlocked?{borderColor:`${rarityColor}60`,backgroundColor:`${rarityColor}08`}
                      :isEarnable?{borderColor:`${C.yellow}60`,backgroundColor:`${C.yellow}06`}
                      :{borderColor:'rgba(255,255,255,0.08)',opacity:0.55}
                    ]}>
                      <View style={{width:46,height:46,borderRadius:14,
                        backgroundColor:isUnlocked?`${rarityColor}20`:isEarnable?`${C.yellow}15`:'rgba(255,255,255,0.06)',
                        alignItems:'center',justifyContent:'center',
                        borderWidth:2,borderColor:isUnlocked?rarityColor:isEarnable?C.yellow:'rgba(255,255,255,0.12)'}}>
                        <Text style={{fontSize:22,opacity:isLocked?0.3:1}}>{isLocked?'🔒':ach.icon}</Text>
                      </View>
                      <View style={{flex:1}}>
                        <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:2}}>
                          <Text style={{color:isUnlocked?'#fff':isEarnable?C.yellow:'rgba(255,255,255,0.35)',
                            fontFamily:'monospace',fontWeight:'900',fontSize:13}}>
                            {isLocked?'???':ach.name}
                          </Text>
                          <View style={{width:6,height:6,borderRadius:3,backgroundColor:rarityColor,opacity:isLocked?0.2:1}}/>
                        </View>
                        <Text style={{color:isLocked?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.5)',
                          fontFamily:'monospace',fontSize:10,lineHeight:15}}>{ach.description}</Text>
                        {isEarnable&&(
                          <TouchableOpacity onPress={()=>handlePayAchievement(ach.key)} disabled={!!payingAch}
                            style={{marginTop:7,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6,
                              borderWidth:2,borderColor:C.yellow,borderRadius:10,
                              paddingHorizontal:12,paddingVertical:6,
                              backgroundColor:`${C.yellow}15`,opacity:(payingAch&&!isPaying)?0.4:1}}>
                            {isPaying?<ActivityIndicator color={C.yellow} size="small"/>:(
                              <>
                                <Text style={{color:C.yellow,fontSize:11,fontWeight:'900',fontFamily:'monospace'}}>🔓 UNLOCK</Text>
                                <Text style={{color:C.yellow,fontSize:10,fontFamily:'monospace'}}>$0.50</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                      {isUnlocked&&<View style={{width:28,height:28,borderRadius:14,backgroundColor:`${rarityColor}25`,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:rarityColor}}>
                        <Text style={{color:rarityColor,fontSize:14,fontWeight:'900'}}>✓</Text>
                      </View>}
                      {isEarnable&&!isPaying&&<Text style={{fontSize:16}}>⭐</Text>}
                    </View>
                  );
                })
              }
            </View>
          )}

          {/* ── WALLET ── */}
          {tab==='wallet'&&(
            <View style={{paddingHorizontal:16,gap:10}}>
              <View style={{borderRadius:20,overflow:'hidden',borderWidth:2.5,borderColor:`${C.purple}50`,marginBottom:4}}>
                <LinearGradient colors={[`${C.purple}18`,`${C.cyan}0C`]} style={{padding:18}}>
                  <Text style={{color:'rgba(255,255,255,0.45)',fontSize:10,fontFamily:'monospace',letterSpacing:1,marginBottom:4}}>CONNECTED WALLET</Text>
                  <Text style={{color:'#fff',fontFamily:'monospace',fontSize:13,marginBottom:16}}>{user?.walletAddress||'—'}</Text>
                  {/* Disconnect */}
                  <TouchableOpacity onPress={()=>{
                    Alert.alert('Disconnect?','You will need to reconnect to save progress.',[
                      {text:'Cancel',style:'cancel'},
                      {text:'Disconnect',style:'destructive',onPress:async()=>{await disconnect();router.replace('/login');}},
                    ]);
                  }} style={{borderRadius:14,borderWidth:2,borderColor:'rgba(255,56,96,0.5)',
                    paddingVertical:12,alignItems:'center',backgroundColor:'rgba(255,56,96,0.10)'}}>
                    <Text style={{color:C.red,fontWeight:'900',fontFamily:'monospace',fontSize:12}}>DISCONNECT WALLET</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>

              {/* Sound toggle */}
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
                backgroundColor:'rgba(255,255,255,0.08)',borderRadius:16,padding:16,
                borderWidth:2,borderColor:'rgba(255,255,255,0.15)'}}>
                <View>
                  <Text style={{color:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:14}}>🔊 Music & Sound</Text>
                  <Text style={{color:'rgba(255,255,255,0.45)',fontSize:11,fontFamily:'monospace',marginTop:2}}>Toggle all game audio</Text>
                </View>
                <Switch value={!muted} onValueChange={v=>handleToggleMute(!v)}
                  thumbColor={muted?'#666':C.mint} trackColor={{false:'#333',true:`${C.mint}60`}}/>
              </View>

              {/* Links */}
              {[
                {icon:ICON_COPPA, label:'Leaderboard',   onPress:()=>router.push('/rankings')},
                {icon:ICON_BROWSE,label:'Community Maps', onPress:()=>router.push('/browse')},
                {icon:ICON_STELLA,label:'Credits',        onPress:()=>router.push('/credits')},
              ].map(l=>(
                <TouchableOpacity key={l.label} onPress={l.onPress}
                  style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
                    backgroundColor:'rgba(255,255,255,0.07)',borderRadius:16,padding:16,
                    borderWidth:2,borderColor:'rgba(255,255,255,0.12)'}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
                    <Image source={l.icon} style={{width:22,height:22,resizeMode:'contain'}}/>
                    <Text style={{color:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:14}}>{l.label}</Text>
                  </View>
                  <Text style={{color:'rgba(255,255,255,0.4)',fontSize:20}}>›</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={()=>router.push('/social')}
                style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',
                  backgroundColor:'rgba(255,255,255,0.07)',borderRadius:16,padding:16,
                  borderWidth:2,borderColor:'rgba(255,255,255,0.12)'}}>
                <Text style={{color:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:14}}>𝕏  @SeekerCraftApp</Text>
                <Text style={{color:'rgba(255,255,255,0.4)',fontSize:20}}>›</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── PRIVACY ── */}
          {tab==='privacy'&&(
            <View style={{paddingHorizontal:16}}>
              <View style={{borderRadius:20,overflow:'hidden',borderWidth:2.5,borderColor:`${C.yellow}40`}}>
                <LinearGradient colors={[`${C.yellow}10`,`${C.purple}08`]} style={{padding:20}}>
                  <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:16,marginBottom:14}}>🔒 PRIVACY POLICY</Text>
                  <ScrollView style={{maxHeight:420}} showsVerticalScrollIndicator={false}>
                    <Text style={{color:'rgba(255,255,255,0.75)',fontFamily:'monospace',fontSize:12,lineHeight:20}}>
                      {`SeekerCraft respects your privacy.\n\nWHAT WE COLLECT\n• Wallet address (public key only — never private keys)\n• Game scores, achievements, levels you create\n• Play counts and ratings\n\nHOW WE USE IT\nYour wallet address is used as a unique identifier for the leaderboard and achievement system. We never sell your data to third parties.\n\nDATA STORAGE\nAll data is stored securely on Google Firebase (USA). Blockchain transactions are public by design and visible on Solana explorers.\n\nYOUR RIGHTS\nYou can disconnect your wallet at any time from the Wallet tab. This removes your local session.\n\nSECURITY\nWe never request, store or have access to your private keys or seed phrases. All Solana transactions are signed exclusively by your wallet app.\n\nCONTACT\nFor privacy questions, contact us via X (@SeekerCraftApp).\n\nLast updated: February 2026`}
                    </Text>
                  </ScrollView>
                </LinearGradient>
              </View>
            </View>
          )}

          <View style={{height:40}}/>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st=StyleSheet.create({
  profileCard:{flexDirection:'row',alignItems:'center',gap:14,marginHorizontal:16,marginBottom:16,
    borderRadius:22,padding:18,borderWidth:2.5,borderColor:'rgba(255,255,255,0.2)',overflow:'hidden'},
  achRow:{flexDirection:'row',alignItems:'flex-start',gap:12,
    borderRadius:18,padding:14,marginBottom:10,borderWidth:2.5},
});
