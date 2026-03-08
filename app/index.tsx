// app/index.tsx - SeekerCraft Home 🌈 Candy Crush / Peggle 2 / Crash Bandicoot style
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Dimensions, StyleSheet,
  Alert, TextInput, Modal, ScrollView, ActivityIndicator,
  Image, Animated, ImageBackground, DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useWallet } from '@/utils/walletContext';
import {
  getNews, hasSeenOnboarding, markOnboardingDone,
  logActivity, getChallengeNotifications, deletePublishedGame,
} from '@/utils/firebase';
import { ref, onValue } from 'firebase/database';
import { database } from '@/utils/firebase';
import { getTreasuryBalance } from '@/utils/payments';
import StickmanBuilder from '@/components/StickmanBuilder';
import AchievementToast from '@/components/AchievementToast';
import { useAudioPlayer } from 'expo-audio';
import { useTranslation } from 'react-i18next';

const ICON_NEW_GAME = require('../assets/images/Icons/NewGame.png');
const ICON_MY_GAMES = require('../assets/images/Icons/MyGames.png');
const ICON_BROWSE   = require('../assets/images/Icons/Browse.png');
const ICON_COPPA    = require('../assets/images/Icons/coppa.png');
const ICON_STELLA   = require('../assets/images/Icons/stella.png');
const ICON_PLAY     = require('../assets/images/Icons/play.png');
const ICON_DUEL     = require('../assets/images/Icons/duel.png');
const ICON_AI       = require('../assets/images/Icons/AI.png');
const ICON_TIPS     = require('../assets/images/Icons/tips.png');
const BG_IMAGE      = require('../assets/images/sfondo.jpg');
const LOGO          = require('../assets/images/NewLogo.png');

const { width: SW, height: SH } = Dimensions.get('window');

const C = {
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  pink:'#FF69B4', mint:'#00F0B5', cyan:'#00D4FF',
  blue:'#3B7DFF', purple:'#9945FF', lime:'#8BFF00', dark:'#140828',
};

// ── Sparkle particles ──────────────────────────────────────────────────────
const SPARKS = Array.from({length:18},(_,i)=>({
  x:12+(i/18)*SW*0.95,
  y:10+Math.sin(i*2.1)*SH*0.18,
  sz:8+Math.random()*8,
  delay:i*220,
  emoji:['✦','✧','⭐','💫','✨'][i%5],
  color:[C.yellow,C.mint,C.cyan,C.pink,C.lime,C.orange][i%6],
}));

function Spark({x,y,sz,delay,emoji,color}:{x:number;y:number;sz:number;delay:number;emoji:string;color:string}){
  const op=useRef(new Animated.Value(0)).current;
  const sc=useRef(new Animated.Value(0.3)).current;
  const rot=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(op,{toValue:1,duration:450,useNativeDriver:true}),
        Animated.spring(sc,{toValue:1,friction:4,useNativeDriver:true}),
        Animated.timing(rot,{toValue:1,duration:900,useNativeDriver:true}),
      ]),
      Animated.delay(700),
      Animated.parallel([
        Animated.timing(op,{toValue:0,duration:500,useNativeDriver:true}),
        Animated.timing(sc,{toValue:0.3,duration:500,useNativeDriver:true}),
      ]),
      Animated.delay(300),
    ])).start();
  },[]);
  const spin=rot.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
  return(
    <Animated.Text style={{position:'absolute',left:x,top:y,fontSize:sz,
      opacity:op,transform:[{scale:sc},{rotate:spin}],
      textShadowColor:color,textShadowRadius:12,textShadowOffset:{width:0,height:0},
    }}>{emoji}</Animated.Text>
  );
}

// ── Big candy-style button ─────────────────────────────────────────────────
function CandyBtn({icon,label,sub,c1,c2,shadow,onPress,badge,stretch}:{
  icon:any;label:string;sub?:string;c1:string;c2:string;shadow:string;
  onPress:()=>void;badge?:number;stretch?:boolean;
}){
  const sc=useRef(new Animated.Value(1)).current;
  const tap=()=>{
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Animated.sequence([
      Animated.timing(sc,{toValue:0.92,duration:75,useNativeDriver:true}),
      Animated.spring(sc,{toValue:1,friction:3,tension:220,useNativeDriver:true}),
    ]).start();
    onPress();
  };
  return(
    <Animated.View style={{transform:[{scale:sc}],flex:stretch?undefined:1}}>
      <TouchableOpacity onPress={tap} activeOpacity={1}>
        <View style={{borderRadius:22,overflow:'hidden',
          shadowColor:shadow,shadowOffset:{width:0,height:7},
          shadowOpacity:0.75,shadowRadius:16,elevation:14}}>
          <LinearGradient colors={[c1,c2]} start={{x:0,y:0}} end={{x:1,y:1}} style={{
            paddingVertical:stretch?22:18,paddingHorizontal:22,
            flexDirection:'row',alignItems:'center',gap:14,
          }}>
            <View style={{position:'absolute',top:0,left:12,right:12,height:10,
              backgroundColor:'rgba(255,255,255,0.32)',borderRadius:22}}/>
            <Text style={{color:'#fff',fontSize:stretch?22:17,fontWeight:'900',fontFamily:'monospace',flex:1,
              textShadowColor:'rgba(0,0,0,0.35)',textShadowRadius:5}}>
              {label}
            </Text>
            {sub&&<Text style={{color:'rgba(255,255,255,0.75)',fontSize:11,fontFamily:'monospace',marginTop:2,position:'absolute',bottom:10,left:22}}>{sub}</Text>}
            <Text style={{color:'rgba(255,255,255,0.85)',fontSize:28,fontWeight:'900'}}>›</Text>
          </LinearGradient>
        </View>
        {badge!=null&&badge>0?(
          <View style={{position:'absolute',top:-8,right:12,backgroundColor:C.coral,
            borderRadius:14,paddingHorizontal:9,paddingVertical:4,
            borderWidth:3,borderColor:'#fff',shadowColor:C.coral,shadowRadius:8,shadowOpacity:1}}>
            <Text style={{color:'#fff',fontSize:11,fontWeight:'900'}}>⚔️ {badge}</Text>
          </View>
        ):null}
      </TouchableOpacity>
    </Animated.View>
  );
}

function GridBtn({icon,label,color,onPress,badge}:{icon:any;label:string;color:string;onPress:()=>void;badge?:number;}){
  const sc=useRef(new Animated.Value(1)).current;
  return(
    <Animated.View style={{transform:[{scale:sc}],flex:1}}>
      <TouchableOpacity onPress={()=>{
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Animated.sequence([
          Animated.timing(sc,{toValue:0.87,duration:70,useNativeDriver:true}),
          Animated.spring(sc,{toValue:1,friction:3,useNativeDriver:true}),
        ]).start();
        onPress();
      }} style={{borderRadius:20,borderWidth:2.5,borderColor:color+'90',
        backgroundColor:'rgba(255,255,255,0.10)',alignItems:'center',paddingVertical:18,gap:10,
        shadowColor:color,shadowRadius:10,shadowOpacity:0.6,
        overflow:'hidden'}}>
        {/* subtle gradient overlay inside button */}
        <LinearGradient
          colors={[color+'25','transparent']}
          style={{...StyleSheet.absoluteFillObject,borderRadius:18}}/>
        <Image source={icon} style={{width:70,height:70,resizeMode:'contain'}}/>
        <Text style={{color:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:12,
          letterSpacing:0.5,textAlign:'center',
          textShadowColor:'rgba(0,0,0,0.7)',textShadowRadius:6}}>
          {label}
        </Text>
        {badge!=null&&badge>0?<View style={{position:'absolute',top:4,right:4,backgroundColor:C.coral,borderRadius:12,paddingHorizontal:7,paddingVertical:3,borderWidth:2,borderColor:'#fff'}}>
          <Text style={{color:'#fff',fontSize:10,fontWeight:'900'}}>{badge}</Text>
        </View>:null}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen(){
  const {t}=useTranslation();
  const {user,connected,sessionLoading}=useWallet();
  const [showNewGame,setShowNewGame]=useState(false);
  const [newGameName,setNewGameName]=useState('');
  const [pendingAchievement,setPendingAchievement]=useState<string|null>(null);
  const [selectedNews,setSelectedNews]=useState<any|null>(null);
  const [globalMuted,setGlobalMuted]=useState(false);
  const [news,setNews]=useState<any[]>([]);
  const [newsLoading,setNewsLoading]=useState(true);
  const [feed,setFeed]=useState<any[]>([]);
  const [treasury,setTreasury]=useState<{skrAmount:number;usdValue:number}|null>(null);
  const [showWelcome,setShowWelcome]=useState(false);
  const [challengeCount,setChallengeCount]=useState(0);
  const [earnableCount,setEarnableCount]=useState(0);
  const [showMyGames,setShowMyGames]=useState(false);
  const [myGamesList,setMyGamesList]=useState<any[]>([]);
  const joinedLoggedRef=useRef(false);

  // Sound effects only — main music is managed by GlobalMusicPlayer in app-providers
  let startPlayer:any=null, backPlayer:any=null, swordPlayer:any=null;
  try{
    const{useAudioPlayer}=require('expo-audio');
    startPlayer=useAudioPlayer(require('../assets/images/tools/Start.mp3'));
    backPlayer=useAudioPlayer(require('../assets/images/tools/back.mp3'));
    swordPlayer=useAudioPlayer(require('../assets/sword.mp3'));
  }catch{}

  const playStart=()=>{if(globalMuted)return;try{startPlayer?.seekTo(0);startPlayer?.play();}catch{}};
  const playBack=()=>{if(globalMuted)return;try{backPlayer?.seekTo(0);backPlayer?.play();}catch{}};
  const playSword=()=>{if(globalMuted)return;try{swordPlayer?.seekTo(0);swordPlayer?.play();}catch{}};

  useEffect(()=>{
    if(!connected)return;
    AsyncStorage.getItem('global_muted').then(v=>{if(v==='1')setGlobalMuted(true);});
    getNews().then(n=>{setNews(n);setNewsLoading(false);}).catch(()=>setNewsLoading(false));
    if(user?.walletAddress){
      hasSeenOnboarding(user.walletAddress).then(seen=>{if(!seen&&!showWelcome){setShowWelcome(true);markOnboardingDone(user.walletAddress).catch(()=>{});}}).catch(()=>{});
      getChallengeNotifications(user.walletAddress).then(n=>setChallengeCount(n.length)).catch(()=>{});
      // Daily check-in
    }
    getTreasuryBalance().then(t=>setTreasury(t)).catch(()=>{});
    const ti=setInterval(()=>getTreasuryBalance().then(t=>setTreasury(t)).catch(()=>{}),30000);
    if(database){
      const unsub=onValue(ref(database,'activity_feed'),snap=>{
        if(!snap.exists())return;
        const items=Object.entries(snap.val()).map(([id,data]:any)=>({id,...data}))
          .sort((a:any,b:any)=>(b.ts||0)-(a.ts||0)).slice(0,20);
        setFeed(items);
      });
      return()=>{unsub();clearInterval(ti);};
    }
    return()=>clearInterval(ti);
  },[connected]);

  useFocusEffect(useCallback(()=>{
    if(!connected)return;
    AsyncStorage.getItem('global_muted').then(v=>{setGlobalMuted(v==='1');});
    if(user?.walletAddress) getChallengeNotifications(user.walletAddress).then(n=>setChallengeCount(n.length)).catch(()=>{});
    AsyncStorage.getItem('earnable_achievements').then(v=>{try{setEarnableCount(v?JSON.parse(v).length:0);}catch{setEarnableCount(0);}}).catch(()=>{});
    // Global music (main.mp3) is managed by AppProviders — no need to control here
  },[connected]));

  if(sessionLoading)return(
    <LinearGradient colors={['#FF8C00','#FF2D6B','#9945FF']} style={{flex:1,alignItems:'center',justifyContent:'center'}}>
      <ActivityIndicator color="#fff" size="large"/>
    </LinearGradient>
  );
  if(!connected)return<Redirect href="/login"/>;

  const handleNewGame=async()=>{
    const trimmed=newGameName.trim();
    if(!trimmed){Alert.alert(t('name_required_title'),t('name_required_msg'));return;}
    try{
      const id=`game_${Date.now()}`;
      const gj=await AsyncStorage.getItem('my_games');
      const games=gj?JSON.parse(gj):[];
      games.push({id,name:trimmed,levels:[],published:false,
        creator:user?.displayName||user?.walletAddress?.slice(0,8)||'player',createdAt:Date.now()});
      await AsyncStorage.setItem('my_games',JSON.stringify(games));
      await AsyncStorage.setItem('current_game_id',id);
      setShowNewGame(false);setNewGameName('');
      playStart();router.push('/my-levels');
    }catch{Alert.alert('Error','Could not create level');}
  };

  const handleDeleteGame=(gameId:string,gameName:string,published:boolean,fbId?:string)=>{
    Alert.alert('Delete Level',`Delete "${gameName}"?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{
        const gj=await AsyncStorage.getItem('my_games');
        if(gj){const u=JSON.parse(gj).filter((g:any)=>g.id!==gameId);
          await AsyncStorage.setItem('my_games',JSON.stringify(u));setMyGamesList(u);}
        if(published&&fbId&&user?.walletAddress) await deletePublishedGame(fbId,user.walletAddress).catch(()=>{});
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }},
    ]);
  };

  const fmtNum=(n:number)=>n>=10000?`${Math.floor(n/1000)}K`:n.toLocaleString();
  const newsTagColor=(tag?:string)=>tag==='update'?C.mint:tag==='event'?C.yellow:tag==='hot'?C.coral:C.cyan;
  const timeAgo=(ts:number)=>{const s=(Date.now()-ts)/1000;if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;};
  const walletName=user?.displayName||`${user?.walletAddress?.slice(0,4)}...`;

  const toggleMute=async()=>{
    const next=!globalMuted;
    setGlobalMuted(next);
    await AsyncStorage.setItem('global_muted',next?'1':'0');
    DeviceEventEmitter.emit('MUTE_CHANGED',{muted:next});
  };

  return(
    <View style={{flex:1}}>
      {/* SCENIC BACKGROUND */}
      <ImageBackground source={BG_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover"/>
      <LinearGradient colors={['rgba(0,0,0,0.10)','rgba(20,8,50,0.60)','rgba(10,0,40,0.82)']}
        locations={[0,0.45,1]} style={StyleSheet.absoluteFill}/>

      {/* SPARKLES */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {SPARKS.map((s,i)=><Spark key={i} {...s}/>)}
      </View>

      <StickmanBuilder/>

      <SafeAreaView style={{flex:1}}>

        {/* TOP BAR */}
        <View style={st.topBar}>
          <TouchableOpacity onPress={()=>router.push('/settings')} style={st.playerChip}>
            <View style={{width:9,height:9,borderRadius:5,backgroundColor:C.mint,
              shadowColor:C.mint,shadowRadius:6,shadowOpacity:1}}/>
            <Text style={st.playerChipText} numberOfLines={1}>{walletName}</Text>
          </TouchableOpacity>
          <View style={{flexDirection:'row',gap:8}}>
            <TouchableOpacity onPress={toggleMute} style={st.topBtn}>
              <Text style={{fontSize:18}}>{globalMuted?'🔇':'🔊'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>router.push('/settings')} style={st.topBtn}>
              <Text style={{fontSize:18}}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:44}}>

          {/* HERO */}
          <View style={st.hero}>
            <View style={{position:'absolute',top:0,width:SW*0.9,height:90,
              backgroundColor:C.orange,borderRadius:45,opacity:0.18,
              shadowColor:C.orange,shadowRadius:50,shadowOpacity:1}}/>
            <Text style={st.titleShadow}>{t('seekercraft')}</Text>
            <Text style={st.title}>{t('seekercraft')}</Text>
            <View style={st.pill}>
              <Text style={{color:'#fff',fontSize:11,fontFamily:'monospace',fontWeight:'900',letterSpacing:3}}>
                {t('tagline')}
              </Text>
            </View>

            {user&&(
              <View style={st.statsRow}>
                {[
                  {icon:ICON_PLAY,  val:fmtNum(user.totalScore||0),           lbl:t('stat_pts'),    c:C.yellow,  sz:48},
                  {icon:ICON_COPPA, val:String(user.levelsCompleted||0),       lbl:t('stat_wins'),   c:C.mint,    sz:48},
                  {icon:ICON_STELLA,val:String(Object.keys(user.achievements||{}).length),lbl:t('stat_medals'),c:C.cyan,sz:48},
                ].map((s,i)=>(
                  <React.Fragment key={i}>
                    {i>0&&<View style={{width:1,height:36,backgroundColor:'rgba(255,255,255,0.18)'}}/>}
                    <View style={{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6}}>
                      <Image source={s.icon} style={{width:s.sz,height:s.sz,resizeMode:'contain'}}/>
                      <View style={{alignItems:'center'}}>
                        <Text style={{color:s.c,fontFamily:'monospace',fontWeight:'900',fontSize:14}}>{s.val}</Text>
                        <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:9}}>{s.lbl}</Text>
                      </View>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            )}
          </View>

          {/* MAIN ACTIONS */}
          <View style={st.actions}>
            <CandyBtn icon={ICON_PLAY} label={t('play_now')} sub={t('play_now_sub')}
              c1="#FF8C00" c2="#FF2D6B" shadow={C.coral} stretch
              onPress={()=>{playStart();router.push('/browse');}}/>
            <View style={{flexDirection:'row',gap:10}}>
              <CandyBtn icon={ICON_NEW_GAME} label={t('edit_mode')}
                c1="#9945FF" c2="#00D4FF" shadow={C.purple}
                onPress={()=>{playStart();setShowNewGame(true);}}/>
              <CandyBtn icon={ICON_MY_GAMES} label={t('my_levels')}
                c1="#00C896" c2="#3B7DFF" shadow={C.mint}
                onPress={async()=>{
                  playStart();
                  const gj=await AsyncStorage.getItem('my_games');let games=gj?JSON.parse(gj):[];
                  // Sync published games from Firebase if missing locally
                  if(database&&user?.walletAddress){
                    try{
                      const {ref:fbRef,get:fbGet}=await import('firebase/database');
                      const snap=await fbGet(fbRef(database,'games/public'));
                      if(snap.exists()){
                        const all=snap.val();
                        const localFbIds=new Set(games.filter((g:any)=>g.firebaseId).map((g:any)=>g.firebaseId));
                        Object.entries(all).forEach(([fbId,data]:any)=>{
                          if(data.creatorWallet===user.walletAddress&&!localFbIds.has(fbId)){
                            const fbLevels:any[]=data.levels||[];
                            const levelEntries=fbLevels.map((l:any)=>({id:l.id,name:l.name||'Level',createdAt:l.createdAt||Date.now()}));
                            games.push({id:`game_fb_${fbId}`,name:data.name||'Untitled',levels:levelEntries,published:true,firebaseId:fbId,creator:data.creatorName||'player',createdAt:data.createdAt||Date.now()});
                          }
                        });
                        await AsyncStorage.setItem('my_games',JSON.stringify(games));
                      }
                    }catch{}
                  }
                  if(games.length===0){Alert.alert(t('no_levels_title'),t('no_levels_msg'));return;}
                  if(games.length===1){await AsyncStorage.setItem('current_game_id',games[0].id);router.push('/my-levels');}
                  else{setMyGamesList(games);setShowMyGames(true);}
                }}/>
            </View>
            {earnableCount>0&&(
              <TouchableOpacity onPress={()=>{playStart();router.push({pathname:'/settings',params:{tab:'achievements'}});}}
                style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:10,backgroundColor:'rgba(255,215,0,0.12)',
                  borderRadius:16,paddingHorizontal:16,paddingVertical:10,borderWidth:1.5,borderColor:'rgba(255,215,0,0.35)'}}>
                <Image source={ICON_COPPA} style={{width:28,height:28,resizeMode:'contain'}}/>
                <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:13,letterSpacing:0.5}}>
                  {earnableCount} ready to claim →
                </Text>
              </TouchableOpacity>
            )}
            <View style={{flexDirection:'row',gap:10}}>
              <GridBtn icon={ICON_COPPA}   label={t('rankings_btn')} color={C.yellow} onPress={()=>{playStart();router.push('/rankings');}}/>
              <GridBtn icon={ICON_STELLA}  label={t('badges_btn')} color={C.mint}   badge={earnableCount} onPress={()=>{playStart();router.push({pathname:'/settings',params:{tab:'achievements'}});}}/>
              <GridBtn icon={ICON_DUEL}    label={t('pvp')}      color={C.coral}  badge={challengeCount} onPress={()=>{playSword();router.push({pathname:'/rankings',params:{tab:'duels'}});}}/>
              <GridBtn icon={ICON_AI}      label={t('vs_ai')}    color={C.purple} onPress={()=>{playStart();router.push('/vs-ai');}}/>
            </View>
            <CandyBtn icon={ICON_DUEL} label="PVP ONLINE" sub="Real-time matches"
              c1="#FF4D6D" c2="#9945FF" shadow={C.coral} stretch
              onPress={()=>{playSword();router.push('/pvp-online' as any);}}/>
          </View>

          {/* LIVE ACTIVITY */}
          {feed.length>0&&(
            <View style={{marginHorizontal:16,marginBottom:16}}>
              <View style={st.secHead}>
                <View style={{width:8,height:8,borderRadius:4,backgroundColor:C.coral,shadowColor:C.coral,shadowRadius:8,shadowOpacity:1}}/>
                <Image source={ICON_BROWSE} style={{width:34,height:34,resizeMode:'contain'}}/>
                <Text style={st.secTitle}>{t('live_activity')}</Text>
                <Text style={{color:C.mint,fontFamily:'monospace',fontSize:9,marginLeft:'auto',letterSpacing:1}}>● {t('live')}</Text>
              </View>
              <View style={st.feedBox}>
                {feed.slice(0,7).map((item,i)=>(
                  <View key={item.id||i} style={st.feedRow}>
                    <View style={{width:26,height:26,borderRadius:13,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center',justifyContent:'center'}}>
                      <Text style={{fontSize:12}}>{
                        item.type==='joined'?'👋':item.type==='level_completed'?'🏆':
                        item.type==='achievement_unlocked'?'🏅':item.type==='game_published'?'🌐':
                        item.type==='challenge_won'?'🥇':item.type==='donation_sent'?'💝':
                        item.type==='level_editing'?'🎨':item.type==='ai_win'?'🤖':
                        item.type==='ai_loss'?'🤖':'⚡'
                      }</Text>
                    </View>
                    <Text style={st.feedMsg} numberOfLines={1}>{(()=>{
                      const n=item.displayName||`${(item.walletAddress||'').slice(0,6)}...`;
                      switch(item.type){
                        case'joined': return`${n} joined SeekerCraft`;
                        case'level_completed': return`${n} beat "${item.detail}"`;
                        case'achievement_unlocked': return`${n} unlocked: ${item.detail}`;
                        case'game_published': return`${n} published "${item.detail}"`;
                        case'challenge_won': return`🥇 ${n} won a duel`;
                        case'donation_sent': return`💝 ${n} donated to ${item.detail}`;
                        case'level_editing': return`🎨 ${n} is creating a level`;
                        case'ai_win': return`🤖 ${n} beat the AI! ${item.detail}`;
                        case'ai_loss': return`🤖 ${n} lost to AI ${item.detail}`;
                        default: return`${n} is playing!`;
                      }
                    })()}</Text>
                    <Text style={st.feedTime}>{timeAgo(item.ts)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{alignItems:'center',paddingVertical:12}}>
            <TouchableOpacity onPress={()=>router.push('/terms')}>
              <Text style={{color:'rgba(255,255,255,0.25)',fontFamily:'monospace',fontSize:10}}>
                Terms of Service · Privacy Policy
              </Text>
            </TouchableOpacity>
            <Text style={{color:'rgba(255,255,255,0.12)',fontFamily:'monospace',fontSize:8,marginTop:3}}>
              © 2025 DuckerForge · SeekerCraft
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>


      {/* WELCOME MODAL */}
      <Modal visible={showWelcome} transparent animationType="fade">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'center',padding:20}}>
          <View style={{borderRadius:30,overflow:'hidden'}}>
            <LinearGradient colors={[C.orange,C.coral,C.purple,C.cyan]} start={{x:0,y:0}} end={{x:1,y:1}} style={{padding:3,borderRadius:30}}>
              <View style={{backgroundColor:'#140828',borderRadius:28,padding:26}}>
                <Text style={{fontSize:50,textAlign:'center',marginBottom:8}}>🎯</Text>
                <Text style={{color:C.yellow,fontSize:22,fontWeight:'900',fontFamily:'monospace',textAlign:'center',letterSpacing:2,marginBottom:4}}>SEEKERCRAFT</Text>
                <Text style={{color:C.cyan,fontFamily:'monospace',fontSize:11,textAlign:'center',marginBottom:20,letterSpacing:2}}>
                  SHOOT · BUILD · CONQUER
                </Text>
                {[['🎯','Shoot the ball — hit ALL golden SKR pegs to WIN!'],
                  ['🪣','Catch the moving bucket = free bonus ball'],
                  ['🌐','Publish your levels for everyone to play'],
                  ['🏆','Climb the global leaderboard & earn medals'],
                  ['⚔️','Challenge players to head-to-head duels'],
                ].map(([icon,text])=>(
                  <View key={String(text)} style={{flexDirection:'row',gap:12,marginBottom:10,alignItems:'center'}}>
                    <Text style={{fontSize:20,width:28}}>{icon}</Text>
                    <Text style={{color:'rgba(255,255,255,0.85)',fontFamily:'monospace',fontSize:12,flex:1,lineHeight:18}}>{text}</Text>
                  </View>
                ))}
                <TouchableOpacity onPress={async()=>{
                  setShowWelcome(false);
                  if(user?.walletAddress){await markOnboardingDone(user.walletAddress);if(!joinedLoggedRef.current){joinedLoggedRef.current=true;logActivity(user.walletAddress,user.displayName||'Player','joined').catch(()=>{});}}
                }} style={{borderRadius:18,overflow:'hidden',marginTop:14}}>
                  <LinearGradient colors={[C.yellow,C.orange]} start={{x:0,y:0}} end={{x:1,y:0}} style={{paddingVertical:17,alignItems:'center'}}>
                    <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:17,letterSpacing:2}}>LET'S GO! 🚀</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* NEW GAME MODAL — candy style matching index theme */}
      <Modal visible={showNewGame} transparent animationType="slide">
        <View style={st.modalOverlay}>
          <ImageBackground source={BG_IMAGE} style={{borderRadius:28,overflow:'hidden'}} resizeMode="cover">
            <LinearGradient colors={['rgba(20,8,40,0.92)','rgba(10,0,60,0.97)']} style={{padding:28}}>
              {/* shimmer bar */}
              <View style={{position:'absolute',top:0,left:0,right:0,height:4,borderRadius:28}}>
                <LinearGradient colors={[C.orange,C.coral,C.purple,C.cyan]} start={{x:0,y:0}} end={{x:1,y:0}} style={{flex:1}}/>
              </View>
              <Text style={st.modalTitle}>✏️  EDIT MODE</Text>
              <Text style={st.modalSub}>Name your new level</Text>
              <TextInput value={newGameName} onChangeText={setNewGameName}
                placeholder="e.g. Sky Castle, Neon Drop..." placeholderTextColor="rgba(255,255,255,0.35)"
                style={st.modalInput} autoFocus maxLength={30} onSubmitEditing={handleNewGame}/>
              <View style={{flexDirection:'row',gap:10}}>
                <TouchableOpacity onPress={()=>{playBack();setShowNewGame(false);setNewGameName('');}}
                  style={[st.modalBtn,{flex:1,borderColor:'rgba(255,255,255,0.20)'}]}>
                  <Text style={{color:'rgba(255,255,255,0.55)',fontWeight:'900',fontFamily:'monospace',fontSize:13}}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleNewGame} style={[st.modalBtn,{flex:2,overflow:'hidden',borderColor:'transparent'}]}>
                  <LinearGradient colors={[C.yellow,C.orange]} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill}/>
                  <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14,letterSpacing:1}}>CREATE  →</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>
      </Modal>

      {/* MY GAMES */}
      <Modal visible={showMyGames} transparent animationType="slide">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#140828',borderTopLeftRadius:28,borderTopRightRadius:28,
            padding:22,maxHeight:'72%',borderTopWidth:3,borderColor:C.purple}}>
            <LinearGradient colors={['rgba(153,69,255,0.18)','transparent']} style={StyleSheet.absoluteFill}/>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
                <Image source={ICON_MY_GAMES} style={{width:56,height:56,resizeMode:'contain'}}/>
                <Text style={{color:C.yellow,fontFamily:'monospace',fontSize:16,fontWeight:'900'}}>MY LEVELS ({myGamesList.length})</Text>
              </View>
              <TouchableOpacity onPress={()=>setShowMyGames(false)}
                style={{width:34,height:34,borderRadius:17,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'rgba(255,255,255,0.7)',fontSize:18,fontWeight:'900'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {myGamesList.map((g:any,i:number)=>(
                <TouchableOpacity key={g.id} onPress={async()=>{
                  setShowMyGames(false);await AsyncStorage.setItem('current_game_id',g.id);router.push('/my-levels');
                }} style={st.gameRow}>
                  <LinearGradient colors={g.published?['rgba(0,240,181,0.15)','transparent']:['rgba(153,69,255,0.15)','transparent']}
                    style={{...StyleSheet.absoluteFillObject,borderRadius:16}}/>
                  <View style={{width:42,height:42,borderRadius:12,
                    backgroundColor:g.published?`${C.mint}20`:`${C.purple}20`,
                    alignItems:'center',justifyContent:'center',
                    borderWidth:2.5,borderColor:g.published?C.mint:C.purple}}>
                    <Text style={{color:g.published?C.mint:C.purple,fontFamily:'monospace',fontSize:16,fontWeight:'900'}}>{i+1}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:'#fff',fontFamily:'monospace',fontSize:14,fontWeight:'900'}} numberOfLines={1}>{g.name}</Text>
                    <Text style={{color:'rgba(255,255,255,0.4)',fontFamily:'monospace',fontSize:10,marginTop:2}}>
                      {g.levels?.length||0} levels{g.published?'  ·  ✅ Published':''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={()=>handleDeleteGame(g.id,g.name,!!g.published,g.firebaseId)}
                    style={{padding:8,borderRadius:10,backgroundColor:'rgba(255,77,109,0.15)',borderWidth:2,borderColor:'rgba(255,77,109,0.5)'}}>
                    <Image source={require('../assets/images/tools/bin.png')} style={{width:22,height:22,resizeMode:'contain'}}/>
                  </TouchableOpacity>
                  <Text style={{color:C.yellow,fontSize:24,marginLeft:4}}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* NEWS DETAIL */}
      <Modal visible={!!selectedNews} transparent animationType="fade" onRequestClose={()=>setSelectedNews(null)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'center',alignItems:'center',padding:22}}>
          <View style={{width:'100%',borderRadius:26,overflow:'hidden',borderWidth:3,borderColor:newsTagColor(selectedNews?.tag)}}>
            <LinearGradient colors={['#1A0830','#0D0050']} style={{padding:24}}>
              <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                {selectedNews?.tag?<View style={[st.tag,{borderColor:newsTagColor(selectedNews.tag)}]}>
                  <Text style={[st.tagText,{color:newsTagColor(selectedNews.tag)}]}>{selectedNews.tag.toUpperCase()}</Text>
                </View>:<View/>}
                <TouchableOpacity onPress={()=>setSelectedNews(null)} style={{width:32,height:32,borderRadius:16,backgroundColor:'rgba(255,255,255,0.1)',alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:'#fff',fontSize:16,fontWeight:'900'}}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={{color:'#fff',fontSize:18,fontWeight:'900',fontFamily:'monospace',marginBottom:12}}>{selectedNews?.title}</Text>
              <ScrollView style={{maxHeight:200}}>
                <Text style={{color:'rgba(255,255,255,0.82)',fontFamily:'monospace',fontSize:13,lineHeight:22}}>{selectedNews?.body}</Text>
              </ScrollView>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <AchievementToast achievementKey={pendingAchievement} onDone={()=>setPendingAchievement(null)}/>
    </View>
  );
}

const st=StyleSheet.create({
  topBar:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingVertical:10},
  playerChip:{flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'rgba(0,0,0,0.55)',
    borderRadius:24,paddingHorizontal:14,paddingVertical:8,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.55)',maxWidth:SW*0.48,
    shadowColor:'#000',shadowRadius:8,shadowOpacity:0.6},
  playerChipText:{color:'#fff',fontSize:12,fontFamily:'monospace',fontWeight:'900',
    textShadowColor:'rgba(0,0,0,0.5)',textShadowRadius:4},
  topBtn:{width:44,height:44,borderRadius:14,backgroundColor:'rgba(0,0,0,0.55)',
    alignItems:'center',justifyContent:'center',borderWidth:2.5,borderColor:'rgba(255,255,255,0.55)',
    shadowColor:'#000',shadowRadius:8,shadowOpacity:0.6},

  hero:{alignItems:'center',paddingTop:4,paddingBottom:22,paddingHorizontal:16},
  titleShadow:{position:'absolute',top:8,color:'transparent',fontSize:42,fontWeight:'900',
    fontFamily:'monospace',letterSpacing:5,
    textShadowColor:'rgba(255,140,0,0.9)',textShadowRadius:35,textShadowOffset:{width:0,height:0}},
  title:{color:'#fff',fontSize:42,fontWeight:'900',fontFamily:'monospace',letterSpacing:5,
    textShadowColor:'rgba(255,200,0,0.7)',textShadowRadius:18,textShadowOffset:{width:2,height:3}},
  pill:{flexDirection:'row',alignItems:'center',marginTop:8,marginBottom:14,
    backgroundColor:'rgba(0,0,0,0.40)',borderRadius:30,paddingHorizontal:16,paddingVertical:7,
    borderWidth:2,borderColor:'rgba(255,255,255,0.25)'},
  statsRow:{flexDirection:'row',alignItems:'center',backgroundColor:'rgba(0,0,0,0.45)',
    borderRadius:20,paddingHorizontal:14,paddingVertical:10,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.22)',width:'100%'},

  actions:{paddingHorizontal:16,gap:12,marginBottom:16},

  secHead:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,marginBottom:10},
  secTitle:{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:13,letterSpacing:1,
    textShadowColor:'rgba(0,0,0,0.5)',textShadowRadius:4},

  newsCard:{width:SW*0.73,backgroundColor:'rgba(8,0,40,0.88)',borderRadius:20,padding:14,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.22)'},
  tag:{borderWidth:2,borderRadius:7,paddingHorizontal:7,paddingVertical:2,alignSelf:'flex-start',marginBottom:6},
  tagText:{fontSize:8,fontWeight:'900',fontFamily:'monospace',letterSpacing:1},
  newsTitle:{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:13,marginBottom:5},
  newsBody:{color:'rgba(255,255,255,0.6)',fontSize:11,fontFamily:'monospace',lineHeight:17},

  feedBox:{backgroundColor:'rgba(8,0,40,0.82)',borderRadius:20,padding:14,
    borderWidth:2.5,borderColor:'rgba(153,69,255,0.45)'},
  feedRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  feedMsg:{color:'rgba(255,255,255,0.88)',fontFamily:'monospace',fontSize:11,flex:1},
  feedTime:{color:'rgba(255,255,255,0.38)',fontFamily:'monospace',fontSize:9},

  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.85)',justifyContent:'flex-start',paddingTop:80,paddingHorizontal:16},
  modalTitle:{color:'#fff',fontSize:20,fontWeight:'900',fontFamily:'monospace',letterSpacing:1,textAlign:'center',marginBottom:4},
  modalSub:{color:'rgba(255,255,255,0.5)',fontSize:12,fontFamily:'monospace',textAlign:'center',marginBottom:18},
  modalInput:{color:'#fff',fontFamily:'monospace',fontSize:15,backgroundColor:'rgba(255,255,255,0.1)',
    borderRadius:16,padding:14,borderWidth:2.5,borderColor:'rgba(255,255,255,0.25)',marginBottom:16},
  modalBtn:{borderRadius:16,paddingVertical:15,alignItems:'center',justifyContent:'center',borderWidth:2.5},
  gameRow:{flexDirection:'row',alignItems:'center',gap:10,borderRadius:16,padding:14,marginBottom:10,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.12)',overflow:'hidden'},
});
