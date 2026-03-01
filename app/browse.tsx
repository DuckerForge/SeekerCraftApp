// app/browse.tsx - Community Browser 🌊 Coral reef / candy style
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Dimensions, Alert, ActivityIndicator, Image, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ref, onValue, get } from 'firebase/database';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { database, deletePublishedGame, recordGamePlay } from '@/utils/firebase';
import { useWallet } from '@/utils/walletContext';

const { width: SW } = Dimensions.get('window');
const ICON_PLAY    = require('../assets/images/Icons/play.png');
const ICON_PLAYERS = require('../assets/images/Icons/players.png');
const ICON_COPPA   = require('../assets/images/Icons/coppa.png');
const ICON_STELLA  = require('../assets/images/Icons/stella.png');

const C = {
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  pink:'#FF69B4', mint:'#00F0B5', cyan:'#00D4FF',
  purple:'#9945FF', lime:'#8BFF00', blue:'#3B7DFF',
  dark:'#0D0028',
};

type SortMode = 'newest'|'popular'|'best_rated'|'most_levels';
const SORT_OPTS: {key:SortMode;label:string;emoji:string;c:string}[] = [
  {key:'newest',      label:'NEW',       emoji:'🆕', c:C.mint},
  {key:'popular',     label:'HOT',       emoji:'🔥', c:C.coral},
  {key:'best_rated',  label:'TOP RATED', emoji:'⭐', c:C.yellow},
  {key:'most_levels', label:'MOST MAPS', emoji:'🗺', c:C.cyan},
];

const MEDAL = ['🥇','🥈','🥉'];
const MEDAL_COLORS = [
  ['rgba(255,215,0,0.25)','rgba(255,140,0,0.10)'],
  ['rgba(200,200,200,0.20)','rgba(150,150,150,0.08)'],
  ['rgba(205,127,50,0.20)','rgba(150,80,20,0.08)'],
];

export default function BrowseScreen() {
  const browsePlayer = useAudioPlayer(require('../assets/images/tools/browse.mp3'));
  const backPlayer   = useAudioPlayer(require('../assets/images/tools/back.mp3'));
  const startPlayer  = useAudioPlayer(require('../assets/images/tools/Start.mp3'));
  const mutedRef = useRef(false);
  useEffect(()=>{ AsyncStorage.getItem('global_muted').then(v=>{mutedRef.current=v==='1';}); },[]);
  const playBack  = ()=>{ if(mutedRef.current)return; try{backPlayer.seekTo(0);backPlayer.play();}catch{} };
  const playStart = ()=>{ if(mutedRef.current)return; try{startPlayer.seekTo(0);startPlayer.play();}catch{} };

  const {user}=useWallet();
  const [games,setGames]=useState<any[]>([]);
  const [profileModal,setProfileModal]=useState<any>(null);
  const [profileLoading,setProfileLoading]=useState(false);
  const [mainTab,setMainTab]=useState<'games'|'players'>('games');
  const [usersMap,setUsersMap]=useState<{[wallet:string]:string}>({});
  const [players,setPlayers]=useState<any[]>([]);
  const [playersLoading,setPlayersLoading]=useState(false);
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<SortMode>('newest');
  const [loading,setLoading]=useState(true);

  useFocusEffect(useCallback(()=>{
    // Continue global music from index — no browse-specific music
  },[]));

  useEffect(()=>{
    if(!database) return;
    get(ref(database,'users')).then(snap=>{
      if(!snap.exists()) return;
      const m:{[k:string]:string}={};
      Object.entries(snap.val()).forEach(([wallet,data]:any)=>{ if(data?.displayName) m[wallet]=data.displayName; });
      setUsersMap(m);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(!database){setLoading(false);return;}
    const unsub=onValue(ref(database,'games/public'),snap=>{
      const data=snap.val();
      setGames(data?Object.entries(data)
        .map(([id,v]:any)=>({id,...v}))
        .filter((g:any)=>typeof g.name==='string'&&Array.isArray(g.levels)&&g.levels.length>0)
        :[]);
      setLoading(false);
    });
    return()=>unsub();
  },[]);

  const filtered=games
    .filter(g=>!query||g.name?.toLowerCase().includes(query.toLowerCase())||g.creatorName?.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>{
      if(sort==='popular') return(b.plays||0)-(a.plays||0);
      if(sort==='best_rated') return(b.rating||0)-(a.rating||0);
      if(sort==='most_levels') return(b.levels?.length||0)-(a.levels?.length||0);
      return(b.createdAt||0)-(a.createdAt||0);
    });

  const handlePlay=async(game:any)=>{
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if(!user?.walletAddress){Alert.alert('Wallet required','Connect a wallet to play');return;}
    try{
      await AsyncStorage.setItem('community_game',JSON.stringify(game));
      await AsyncStorage.setItem('community_game_id',game.id);
      if(user?.walletAddress) await recordGamePlay(game.id,user.walletAddress);
      playStart();router.push('/game-play');
    }catch{Alert.alert('Error','Could not load game');}
  };

  const handleDelete=async(game:any)=>{
    Alert.alert('Delete?',`Remove "${game.name}" from community?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{
        try{
          const ok=await deletePublishedGame(game.id,user!.walletAddress);
          if(!ok)Alert.alert('Error','Make sure you are the creator.');
          else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }catch{Alert.alert('Error','Delete failed');}
      }},
    ]);
  };

  const openProfile=async(walletAddress:string,creatorName:string)=>{
    setProfileModal({walletAddress,displayName:creatorName,loading:true});
    setProfileLoading(true);
    try{
      const snap=await get(ref(database,`users/${walletAddress}`));
      setProfileModal(snap.exists()?{walletAddress,...snap.val()}:{walletAddress,displayName:creatorName});
    }catch{}
    setProfileLoading(false);
  };

  const loadPlayers=async()=>{
    if(players.length>0)return;
    setPlayersLoading(true);
    try{
      const snap=await get(ref(database,'users'));
      if(snap.exists()){
        const list=Object.entries(snap.val())
          .map(([wallet,data]:any)=>({wallet,...data}))
          .sort((a:any,b:any)=>(b.totalScore||0)-(a.totalScore||0)).slice(0,50);
        setPlayers(list);
      }
    }catch{}
    setPlayersLoading(false);
  };

  const fmtPlays=(n:number)=>n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
  const timeSince=(ts:number)=>{const d=(Date.now()-ts)/1000;if(d<60)return'now';if(d<3600)return`${Math.floor(d/60)}m`;if(d<86400)return`${Math.floor(d/3600)}h`;return`${Math.floor(d/86400)}d`;};

  return(
    <>
    <View style={{flex:1}}>
      {/* Community background */}
      <ImageBackground source={require('../assets/images/Peg/wallpaper/icon.jpeg')} style={StyleSheet.absoluteFill} resizeMode="cover">
        <LinearGradient colors={['rgba(0,10,40,0.82)','rgba(0,20,70,0.75)','rgba(0,10,40,0.88)']} style={StyleSheet.absoluteFill}/>
      </ImageBackground>

      <SafeAreaView style={{flex:1}}>

        {/* HEADER */}
        <View style={st.header}>
          <TouchableOpacity onPress={()=>{playBack();router.back();}} style={st.backBtn}>
            <LinearGradient colors={[C.orange,C.coral]} style={st.backBtnGrad}>
              <Text style={{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:12}}>← BACK</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center'}}>
            <Text style={st.headerTitle}>COMMUNITY</Text>
            <Text style={{color:'rgba(255,255,255,0.55)',fontFamily:'monospace',fontSize:10}}>Play levels made by players</Text>
          </View>
          <TouchableOpacity onPress={()=>router.push('/rankings')} style={st.rankBtn}>
            <Image source={ICON_COPPA} style={{width:44,height:44,resizeMode:'contain'}}/>
          </TouchableOpacity>
        </View>

        {/* SEARCH */}
        <View style={{paddingHorizontal:16,marginBottom:8}}>
          <View style={st.searchWrap}>
            <Text style={{fontSize:16,marginRight:6}}>🔍</Text>
            <TextInput value={query} onChangeText={setQuery}
              placeholder="Search games or creators..." placeholderTextColor="rgba(255,255,255,0.35)"
              style={{flex:1,color:'#fff',fontFamily:'monospace',fontSize:13}}/>
            {query.length>0&&(
              <TouchableOpacity onPress={()=>setQuery('')}>
                <Text style={{color:'rgba(255,255,255,0.5)',fontSize:18,fontWeight:'900'}}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* MAIN TABS — GAMES / PLAYERS */}
        <View style={{flexDirection:'row',paddingHorizontal:16,gap:10,marginBottom:10}}>
          {([
            {key:'games',  label:'GAMES',   c:C.orange},
            {key:'players',label:'PLAYERS', c:C.purple},
          ] as const).map(t=>{
            const active=mainTab===t.key;
            return(
              <TouchableOpacity key={t.key}
                onPress={()=>{setMainTab(t.key as any);if(t.key==='players')loadPlayers();Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);}}
                style={{flex:1,paddingVertical:13,borderRadius:16,alignItems:'center',
                  backgroundColor:active?`${t.c}20`:'rgba(255,255,255,0.06)',
                  borderWidth:2.5,borderColor:active?t.c:'rgba(255,255,255,0.12)'}}>
                <Text style={{color:active?t.c:'rgba(255,255,255,0.45)',fontFamily:'monospace',fontWeight:'900',fontSize:active?14:13}}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SORT CHIPS — only when GAMES tab active */}
        {mainTab==='games'&&(
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,paddingHorizontal:16,paddingVertical:4,marginBottom:6}}>
            {SORT_OPTS.map(s=>(
              <TouchableOpacity key={s.key}
                onPress={()=>{setSort(s.key);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}}
                activeOpacity={0.7}
                style={[st.sortChip,sort===s.key&&{backgroundColor:`${s.c}28`,borderColor:s.c,shadowColor:s.c,shadowRadius:8,shadowOpacity:0.7,elevation:3}]}>
                <Text style={[st.sortChipText,sort===s.key&&{color:s.c}]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {mainTab==='games'&&<Text style={{color:'rgba(255,255,255,0.4)',fontFamily:'monospace',fontSize:10,paddingHorizontal:16,marginBottom:4}}>{filtered.length} games</Text>}

        {/* PLAYERS TAB */}
        {mainTab==='players'?(
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:14,paddingBottom:40}}>
            {playersLoading?(
              <View style={{alignItems:'center',paddingTop:40}}>
                <ActivityIndicator color={C.purple} size="large"/>
              </View>
            ):players.map((p,idx)=>{
              const achCount=Object.keys(p.achievements||{}).length;
              const isTop=idx<3;
              return(
                <TouchableOpacity key={p.wallet} onPress={()=>openProfile(p.wallet,p.displayName)}
                  style={[st.playerCard,isTop&&{borderColor:[`${C.yellow}80`,`rgba(180,180,180,0.5)`,`rgba(205,127,50,0.6)`][idx]}]}>
                  {isTop&&<LinearGradient colors={MEDAL_COLORS[idx] as [string,string]} style={{...StyleSheet.absoluteFillObject,borderRadius:18}}/>}
                  {/* Rank */}
                  <View style={{width:42,height:42,borderRadius:14,
                    backgroundColor:isTop?'rgba(255,255,255,0.15)':'rgba(255,255,255,0.08)',
                    alignItems:'center',justifyContent:'center',
                    borderWidth:2,borderColor:isTop?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.1)'}}>
                    {isTop?<Text style={{fontSize:22}}>{MEDAL[idx]}</Text>
                      :<Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontWeight:'900',fontSize:13}}>#{idx+1}</Text>}
                  </View>
                  {/* Avatar */}
                  <View style={{width:48,height:48,borderRadius:24,overflow:'hidden',alignItems:'center',justifyContent:'center',
                    borderWidth:3,borderColor:isTop?C.yellow:'rgba(255,255,255,0.2)'}}>
                    <LinearGradient colors={[C.purple,C.cyan]} style={{...StyleSheet.absoluteFillObject}}/>
                    <Text style={{color:'#fff',fontSize:22,fontWeight:'900',fontFamily:'monospace'}}>
                      {(p.displayName||'?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:16}} numberOfLines={1}>
                      {p.displayName||`${p.wallet?.slice(0,4)}...`}
                    </Text>
                    <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:2}}>
                      <View style={{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:`${C.yellow}20`,borderRadius:8,paddingHorizontal:7,paddingVertical:2}}>
                        <Image source={ICON_STELLA} style={{width:12,height:12,resizeMode:'contain'}}/>
                        <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:12}}>{(p.totalScore||0).toLocaleString()}</Text>
                      </View>
                      <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:10}}>{achCount} 🏅</Text>
                    </View>
                  </View>
                  <Text style={{color:'rgba(255,255,255,0.5)',fontSize:20}}>›</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

        ) : loading ? (
          <View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
            <ActivityIndicator color={C.yellow} size="large"/>
            <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',marginTop:12}}>Loading community...</Text>
          </View>
        ):(
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{padding:14,paddingBottom:40}}>
            {filtered.length===0&&(
              <View style={{alignItems:'center',paddingTop:60}}>
                <Text style={{fontSize:44,marginBottom:12}}>🌊</Text>
                <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',textAlign:'center',fontSize:13}}>
                  {query?`No results for "${query}"`:'No published games yet.\nBe the first!'}
                </Text>
              </View>
            )}
            {filtered.map((game,idx)=>{
              const isOwner=user?.walletAddress&&game.creatorWallet===user.walletAddress;
              const plays=game.plays||0;
              const completions=game.completions||0;
              const rating=game.rating||0;
              const voteCount=game.votesCount||0;
              const lvls=game.levels?.length||0;
              const clr=plays>0?Math.round((completions/plays)*100):0;
              const isTop=idx<3&&sort==='popular';
              return(
                <View key={game.id} style={[st.card,isTop&&{borderColor:[`${C.yellow}60`,`rgba(180,180,180,0.4)`,`rgba(180,100,20,0.5)`][idx]}]}>
                  {isTop&&<LinearGradient colors={MEDAL_COLORS[idx] as [string,string]} style={{...StyleSheet.absoluteFillObject,borderRadius:18}}/>}
                  {/* Medal */}
                  {isTop&&<View style={{position:'absolute',top:12,right:14,backgroundColor:'rgba(0,0,0,0.35)',borderRadius:10,padding:6}}>
                    <Text style={{fontSize:20}}>{MEDAL[idx]}</Text>
                  </View>}

                  {/* Title row */}
                  <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                    <View style={{flex:1,marginRight:8}}>
                      <Text style={st.gameName} numberOfLines={1}>{game.name||'Untitled'}</Text>
                      <TouchableOpacity onPress={()=>game.creatorWallet&&openProfile(game.creatorWallet,usersMap[game.creatorWallet]||game.creatorName||'Unknown')}>
                        <Text style={{color:'rgba(255,255,255,0.5)',fontSize:13,fontFamily:'monospace',marginTop:2}}>
                          by {usersMap[game.creatorWallet]||game.creatorName||'Unknown'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {isOwner&&<TouchableOpacity onPress={()=>handleDelete(game)}
                      style={{borderWidth:2,borderColor:'rgba(255,77,109,0.5)',borderRadius:10,paddingHorizontal:10,paddingVertical:4,backgroundColor:'rgba(255,77,109,0.12)'}}>
                      <Text style={{color:C.coral,fontSize:11,fontFamily:'monospace',fontWeight:'900'}}>DELETE</Text>
                    </TouchableOpacity>}
                  </View>

                  {/* Stats chips */}
                  <View style={{flexDirection:'row',gap:7,marginBottom:10,flexWrap:'wrap'}}>
                    {[
                      {emoji:'▶',val:fmtPlays(plays),lbl:'plays',c:C.orange},
                      {emoji:'🗺',val:String(lvls),  lbl:'levels',c:C.cyan},
                      {emoji:'✓',val:`${clr}%`,      lbl:'cleared',c:C.mint},
                    ].map(s=>(
                      <View key={s.lbl} style={{flexDirection:'row',alignItems:'center',gap:4,
                        backgroundColor:`${s.c}20`,borderRadius:10,paddingHorizontal:9,paddingVertical:4,
                        borderWidth:1.5,borderColor:`${s.c}50`}}>
                        <Text style={{fontSize:11}}>{s.emoji}</Text>
                        <Text style={{color:s.c,fontFamily:'monospace',fontWeight:'900',fontSize:13}}>{s.val}</Text>
                        <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:11}}>{s.lbl}</Text>
                      </View>
                    ))}
                    {game.createdAt&&<Text style={{color:'rgba(255,255,255,0.3)',fontFamily:'monospace',fontSize:9,marginLeft:'auto',alignSelf:'center'}}>{timeSince(game.createdAt)}</Text>}
                  </View>

                  {/* Rating */}
                  <View style={{flexDirection:'row',alignItems:'center',gap:4,marginBottom:12}}>
                    {voteCount>0?(
                      <>
                        {Array(5).fill(0).map((_,i)=>(
                          <Text key={i} style={{fontSize:13,color:i<Math.floor(rating)?C.yellow:'rgba(255,215,0,0.2)'}}>★</Text>
                        ))}
                        <Text style={{color:'rgba(255,255,255,0.4)',fontFamily:'monospace',fontSize:10}}>({voteCount})</Text>
                      </>
                    ):<Text style={{color:'rgba(255,255,255,0.3)',fontFamily:'monospace',fontSize:10}}>No ratings yet</Text>}
                  </View>

                  {game.description&&<Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:11,lineHeight:16,marginBottom:10}} numberOfLines={2}>{game.description}</Text>}

                  {/* PLAY BUTTON */}
                  <TouchableOpacity onPress={()=>handlePlay(game)} activeOpacity={0.85}>
                    <View style={{borderRadius:14,overflow:'hidden',shadowColor:C.orange,shadowOffset:{width:0,height:6},shadowOpacity:0.8,shadowRadius:14,elevation:10}}>
                      <LinearGradient colors={[C.orange,C.coral]} start={{x:0,y:0}} end={{x:1,y:0}} style={{paddingVertical:14,alignItems:'center',flexDirection:'row',justifyContent:'center'}}>
                        <View style={{position:'absolute',top:0,left:16,right:16,height:10,backgroundColor:'rgba(255,255,255,0.3)',borderRadius:14}}/>
                        <Text style={{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:14,letterSpacing:1,textShadowColor:'rgba(0,0,0,0.3)',textShadowRadius:4}}>▶  PLAY NOW</Text>
                      </LinearGradient>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* PROFILE MODAL */}
      {profileModal&&(
        <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#0D0028',borderTopLeftRadius:28,borderTopRightRadius:28,
            padding:24,paddingBottom:44,maxHeight:'85%',borderTopWidth:3,borderColor:C.purple}}>
            <LinearGradient colors={['rgba(153,69,255,0.18)','transparent']} style={{...StyleSheet.absoluteFillObject,borderRadius:28}}/>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <Text style={{color:'#fff',fontSize:18,fontWeight:'900',fontFamily:'monospace'}}>PLAYER PROFILE</Text>
              <TouchableOpacity onPress={()=>setProfileModal(null)}
                style={{width:34,height:34,borderRadius:17,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'rgba(255,255,255,0.7)',fontSize:18,fontWeight:'900'}}>✕</Text>
              </TouchableOpacity>
            </View>
            {profileLoading?<ActivityIndicator color={C.purple} size="large"/>:(
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{flexDirection:'row',alignItems:'center',gap:14,marginBottom:20}}>
                  <View style={{width:68,height:68,borderRadius:34,overflow:'hidden',alignItems:'center',justifyContent:'center',
                    borderWidth:3,borderColor:C.purple}}>
                    <LinearGradient colors={[C.orange,C.purple]} style={{...StyleSheet.absoluteFillObject}}/>
                    <Text style={{color:'#fff',fontSize:30,fontWeight:'900',fontFamily:'monospace'}}>
                      {(profileModal.displayName||'?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={{color:'#fff',fontSize:18,fontWeight:'900',fontFamily:'monospace'}}>{profileModal.displayName||'Anonymous'}</Text>
                    <Text style={{color:'rgba(255,255,255,0.4)',fontSize:10,fontFamily:'monospace',marginTop:2}}>
                      {profileModal.walletAddress?.slice(0,6)}...{profileModal.walletAddress?.slice(-6)}
                    </Text>
                  </View>
                </View>
                <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:18}}>
                  {[
                    {label:'SCORE',  val:(profileModal.totalScore||0).toLocaleString(), c:C.yellow},
                    {label:'WINS',   val:String(profileModal.levelsCompleted||0),        c:C.mint},
                    {label:'CREATED',val:String(profileModal.levelsCreated||0),          c:C.purple},
                    {label:'PLAYED', val:String(profileModal.levelsPlayed||0),           c:C.cyan},
                  ].map(s=>(
                    <View key={s.label} style={{flex:1,minWidth:70,backgroundColor:`${s.c}15`,borderRadius:14,padding:12,
                      alignItems:'center',borderWidth:2,borderColor:`${s.c}40`}}>
                      <Text style={{color:s.c,fontSize:16,fontWeight:'900',fontFamily:'monospace'}}>{s.val}</Text>
                      <Text style={{color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',marginTop:3}}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                {Object.keys(profileModal.achievements||{}).length>0&&(
                  <View>
                    <Text style={{color:C.yellow,fontFamily:'monospace',fontSize:11,fontWeight:'900',letterSpacing:1,marginBottom:10}}>
                      ACHIEVEMENTS ({Object.keys(profileModal.achievements||{}).length})
                    </Text>
                    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
                      {Object.keys(profileModal.achievements||{}).map(k=>(
                        <View key={k} style={{backgroundColor:`${C.yellow}15`,borderRadius:12,paddingHorizontal:10,paddingVertical:6,
                          borderWidth:1.5,borderColor:`${C.yellow}30`,flexDirection:'row',alignItems:'center',gap:4}}>
                          <Text style={{fontSize:16}}>🏅</Text>
                          <Text style={{color:'rgba(255,255,255,0.7)',fontSize:10,fontFamily:'monospace'}}>{k.replace(/_/g,' ')}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </View>
    </>
  );
}

const st=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:10},
  backBtn:{borderRadius:14,overflow:'hidden'},
  backBtnGrad:{paddingHorizontal:14,paddingVertical:8},
  headerTitle:{color:'#fff',fontSize:20,fontWeight:'900',fontFamily:'monospace',letterSpacing:3},
  rankBtn:{width:52,height:52,borderRadius:14,backgroundColor:'rgba(255,255,255,0.18)',
    alignItems:'center',justifyContent:'center',borderWidth:2.5,borderColor:'rgba(255,215,0,0.5)'},
  searchWrap:{flexDirection:'row',alignItems:'center',gap:6,
    backgroundColor:'rgba(255,255,255,0.14)',borderRadius:16,
    paddingHorizontal:14,paddingVertical:10,borderWidth:2,borderColor:'rgba(255,255,255,0.25)'},
  sortChip:{borderRadius:20,borderWidth:2,borderColor:'rgba(255,255,255,0.5)',
    paddingHorizontal:16,paddingVertical:9,flexDirection:'row',alignItems:'center',gap:6,
    backgroundColor:'rgba(255,255,255,0.18)'},
  sortChipText:{color:'#fff',fontSize:13,fontWeight:'900',fontFamily:'monospace'},
  tab:{flex:1,paddingVertical:14,borderRadius:16,alignItems:'center',
    flexDirection:'row',justifyContent:'center',gap:6},
  tabText:{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontWeight:'900',fontSize:13},
  playerCard:{flexDirection:'row',alignItems:'center',gap:10,
    backgroundColor:'rgba(8,2,40,0.88)',borderRadius:18,padding:14,marginBottom:10,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.12)',overflow:'hidden'},
  card:{backgroundColor:'rgba(6,0,30,0.90)',borderRadius:18,padding:16,marginBottom:12,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.15)',position:'relative',overflow:'hidden'},
  gameName:{color:'#fff',fontSize:19,fontWeight:'900',fontFamily:'monospace'},
});
