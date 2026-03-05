// app/rankings.tsx - Rankings & Duels 🏆 Candy / Peggle style
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
  Dimensions, ActivityIndicator, Alert, RefreshControl, Modal, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAllTimeLeaderboard, createChallenge, getChallengeNotifications,
  getAllChallenges, getDuelRecord, getPublicGames,
  acceptChallenge, declineChallenge, submitChallengeResult,
  markChallengeNotificationSeen, logActivity,
  getOrCreateUser, getUserAchievements, getReplay,
} from '@/utils/firebase';
import { ACHIEVEMENTS } from '@/utils/achievements';
import { useWallet } from '@/utils/walletContext';
import { payDonation, getSKRPriceUSD, getSKRBalance } from '@/utils/payments';
import StickmanBuilder from '@/components/StickmanBuilder';
import { useTranslation } from 'react-i18next';

const { width: SW } = Dimensions.get('window');
const ICON_COPPA = require('../assets/images/Icons/coppa.png');
const ICON_DUEL  = require('../assets/images/Icons/duel.png');
const ICON_TIPS  = require('../assets/images/Icons/tips.png');
const ICON_PLAY  = require('../assets/images/Icons/play.png');

const C = {
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  pink:'#FF69B4', mint:'#00F0B5', cyan:'#00D4FF',
  purple:'#9945FF', lime:'#8BFF00', blue:'#3B7DFF', red:'#FF3860',
  dark:'#0D0028',
};

type Tab='alltime'|'duels';

const MEDALS=['🥇','🥈','🥉'];
const MEDAL_COLS=[
  ['rgba(255,215,0,0.3)','rgba(255,140,0,0.12)'],
  ['rgba(200,200,200,0.22)','rgba(140,140,140,0.08)'],
  ['rgba(205,127,50,0.25)','rgba(140,70,0,0.10)'],
];

export default function RankingsScreen(){
  const {t}=useTranslation();
  const { tab: initialTab } = useLocalSearchParams<{tab?:string}>();
  const backPlayer=useAudioPlayer(require('../assets/images/tools/back.mp3'));
  const swordPlayer=useAudioPlayer(require('../assets/sword.mp3'));
  const mutedRef = useRef(false);
  useEffect(()=>{
    AsyncStorage.getItem('global_muted').then(v=>{mutedRef.current=v==='1';});
    const {DeviceEventEmitter}=require('react-native');
    const sub=DeviceEventEmitter.addListener('MUTE_CHANGED',({muted}:{muted:boolean})=>{mutedRef.current=muted;});
    return()=>sub.remove();
  },[]);
  const playBack=()=>{if(mutedRef.current)return;try{backPlayer.seekTo(0);backPlayer.play();}catch{}};
  const playSword=()=>{if(mutedRef.current)return;try{swordPlayer.seekTo(0);swordPlayer.play();}catch{}};
  const {user}=useWallet();
  const [tab,setTab]=useState<Tab>((initialTab==='duels'?'duels':'alltime') as Tab);
  const [alltimeData,setAlltimeData]=useState<any[]>([]);
  const [allChallenges,setAllChallenges]=useState<any[]>([]);
  const [duelRecord,setDuelRecord]=useState({wins:0,losses:0,draws:0});
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [showGamePicker,setShowGamePicker]=useState(false);
  const [publicGames,setPublicGames]=useState<any[]>([]);
  const challengeTargetRef=useRef<{wallet:string;name:string}|null>(null);
  const [showDonationModal,setShowDonationModal]=useState(false);
  const [donationTarget,setDonationTarget]=useState<{wallet:string;name:string}|null>(null);
  const [donationAmt,setDonationAmt]=useState('');
  const [donating,setDonating]=useState(false);
  const [skrPrice,setSkrPrice]=useState(0.02);
  const [showTxPreview,setShowTxPreview]=useState(false);
  const [txPreview,setTxPreview]=useState<{skr:number;usd:string;to:string}|null>(null);
  const [showProfile,setShowProfile]=useState(false);
  const [profileData,setProfileData]=useState<any>(null);
  const [profileLoading,setProfileLoading]=useState(false);

  const loadData=async()=>{
    try{
      const [alltime]=await Promise.all([getAllTimeLeaderboard()]);
      setAlltimeData(alltime);
      if(user?.walletAddress){
        const [ch,record]=await Promise.all([getAllChallenges(user.walletAddress),getDuelRecord(user.walletAddress)]);
        setAllChallenges(ch);setDuelRecord(record);
      }
    }catch(err){console.error('Rankings load error:',err);}
    finally{setLoading(false);setRefreshing(false);}
  };
  useEffect(()=>{loadData();getSKRPriceUSD().then(p=>{if(p)setSkrPrice(p);}).catch(()=>{});},[]);
  useFocusEffect(useCallback(()=>{loadData();},[user?.walletAddress]));
  // drain badge: mark all unseen notifications seen when duels tab is open
  useEffect(()=>{
    if(tab!=='duels'||!user?.walletAddress) return;
    getChallengeNotifications(user.walletAddress)
      .then(notifs=>notifs.forEach(n=>markChallengeNotificationSeen(user.walletAddress,n.id)))
      .catch(()=>{});
  },[tab,user?.walletAddress]);
  const onRefresh=()=>{setRefreshing(true);loadData()};

  const startChallenge=async(targetWallet:string,targetName:string)=>{
    if(!user?.walletAddress){Alert.alert(t('connect_wallet_first'));return;}
    if(targetWallet===user.walletAddress){Alert.alert(t('cant_challenge_self'));return;}
    challengeTargetRef.current={wallet:targetWallet,name:targetName};
    try{
      const games=await getPublicGames();
      const validGames=games.filter((g:any)=>g.levels?.length>0);
      if(validGames.length===0){Alert.alert('No games available','No community games published yet!');return;}
      setPublicGames(validGames);setShowGamePicker(true);
    }catch(err:any){Alert.alert('Error',`Could not load games: ${err?.message||'Unknown error'}`);}
  };

  const sendChallenge=async(game:any)=>{
    const ct=challengeTargetRef.current;
    if(!user?.walletAddress||!ct){Alert.alert('Error','No target selected');return;}
    setShowGamePicker(false);
    try{
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const displayName=await AsyncStorage.getItem('display_name')||user.walletAddress.slice(0,8);
      await createChallenge(user.walletAddress,displayName,ct.wallet,ct.name,game.id,game.name);
      try{
        const cnt=parseInt(await AsyncStorage.getItem('challenge_sent_count')||'0')+1;
        await AsyncStorage.setItem('challenge_sent_count',String(cnt));
        const m:Record<number,string>={1:'first_challenge',5:'challenge_5',10:'challenge_10',25:'challenge_25'};
        if(m[cnt])(global as any).showAchievement?.(m[cnt]);
      }catch{}
      Alert.alert('⚔️ Challenge Sent!',`Now play "${game.name}" to set your score!`,[
        {text:'Play Now!',onPress:async()=>{
          await AsyncStorage.setItem('community_game',JSON.stringify(game));
          await AsyncStorage.setItem('community_game_id',game.id);
          router.push('/game-play');
        }},
        {text:'Later',style:'cancel'},
      ]);
    }catch(err:any){Alert.alert('Error',err?.message||'Unknown error');}
  };

  const handleAcceptChallenge=async(ch:any)=>{
    try{
      await acceptChallenge(ch.id, user!.walletAddress);
      await AsyncStorage.setItem('community_game',JSON.stringify({id:ch.gameId,name:ch.gameName,levels:[]}));
      await AsyncStorage.setItem('community_game_id',ch.gameId);
      await AsyncStorage.setItem('active_challenge_id',ch.id);
      router.push('/game-play');
    }catch(err:any){Alert.alert('Error',err?.message||'Unknown error');}
  };

  const handleDecline=async(ch:any)=>{
    Alert.alert('Decline Challenge?','Decline this duel?',[
      {text:'Cancel',style:'cancel'},
      {text:'Decline',style:'destructive',onPress:async()=>{try{await declineChallenge(ch.id,user!.walletAddress);await loadData();}catch{}}},
    ]);
  };

  const openDonationModal=(wallet:string,name:string)=>{
    setDonationTarget({wallet,name});setDonationAmt('');setShowDonationModal(true);
  };

  const handleDonate=async(skrAmount:number)=>{
    if(!user?.walletAddress||!donationTarget){return;}
    const usd=(skrAmount*skrPrice).toFixed(2);
    setTxPreview({skr:skrAmount,usd,to:donationTarget.name});
    setShowDonationModal(false);setShowTxPreview(true);
  };

  const confirmDonate=async()=>{
    if(!txPreview||!user?.walletAddress||!donationTarget){return;}
    setShowTxPreview(false);setDonating(true);
    try{
      // Pre-flight SKR balance check
      const balance=await getSKRBalance(user.walletAddress);
      if(balance<txPreview.skr){
        Alert.alert('Not enough SKR',`You need ${txPreview.skr} SKR but have ${balance.toFixed(2)} SKR.\nGet SKR on Jupiter or Raydium.`);
        setDonating(false);return;
      }
      const result=await payDonation(user.walletAddress,donationTarget.wallet,txPreview.skr);
      if(result.success){
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const sig=result.txSignature||'';
        const shortSig=sig?`${sig.slice(0,8)}...${sig.slice(-8)}`:'';
        Alert.alert('💝 Donation Sent!',
          `Thank you for supporting this creator!\n\n${shortSig?`TX: ${shortSig}`:''}`,
          sig?[
            {text:'View on Solscan',onPress:()=>Linking.openURL(`https://solscan.io/tx/${sig}`)},
            {text:'OK',style:'cancel'},
          ]:[{text:'OK'}]
        );
        logActivity(user.walletAddress,user.displayName||'Player','donation_sent',donationTarget.name).catch(()=>{});
        const donKeys:string[]=JSON.parse(await AsyncStorage.getItem('donation_players')||'[]');
        if(!donKeys.includes(donationTarget.wallet)){
          const next=[...donKeys,donationTarget.wallet];
          await AsyncStorage.setItem('donation_players',JSON.stringify(next));
          const m:Record<number,string>={1:'first_donation',5:'donations_5',10:'donations_10'};
          if(m[next.length])(global as any).showAchievement?.(m[next.length]);
        }
        if(txPreview.skr*skrPrice>=15)(global as any).showAchievement?.('donation_big');
      }else{Alert.alert('Failed',result.error||'Transaction rejected');}
    }catch(e:any){Alert.alert('Error',e.message||'Unknown error');}
    setDonating(false);
  };

  const openProfile=async(wallet:string)=>{
    setProfileLoading(true);setShowProfile(true);setProfileData(null);
    try{
      const [u,achs,record]=await Promise.all([
        getOrCreateUser(wallet),
        getUserAchievements(wallet),
        getDuelRecord(wallet),
      ]);
      setProfileData({...u,walletAddress:wallet,achievements:achs,duelRecord:record});
    }catch{setProfileData(null);}
    setProfileLoading(false);
  };

  const watchReplay=async(ch:any,wallet:string)=>{
    try{
      const shots=await getReplay(ch.id,wallet);
      if(!shots||shots.length===0){Alert.alert('No Replay','No replay data found for this duel.');return;}
      await AsyncStorage.setItem('replay_shots',JSON.stringify(shots));
      await AsyncStorage.setItem('replay_mode','1');
      await AsyncStorage.setItem('community_game',JSON.stringify({id:ch.gameId,name:ch.gameName,levels:[]}));
      await AsyncStorage.setItem('community_game_id',ch.gameId);
      router.push('/game-play');
    }catch(err:any){Alert.alert('Error',err?.message||'Could not load replay');}
  };

  if(loading){
    return(
      <LinearGradient colors={['#001A4D','#003080','#9945FF']} style={{flex:1,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator color={C.yellow} size="large"/>
      </LinearGradient>
    );
  }

  const pendingForMe=allChallenges.filter(c=>c.status==='pending'&&c.challengedWallet===user?.walletAddress);
  const pendingSent=allChallenges.filter(c=>c.status==='pending'&&c.challengerWallet===user?.walletAddress);
  const activeDuels=allChallenges.filter(c=>c.status!=='completed'&&c.status!=='declined'&&c.status!=='pending');
  const completedDuels=allChallenges.filter(c=>c.status==='completed').slice(0,20);

  const renderPlayerCard=(p:any,rank:number,key?:string)=>{
    const isMe=p.walletAddress===user?.walletAddress;
    const isTop=rank<=3;
    return(
      <View key={key||p.walletAddress} style={[st.playerCard,isTop&&{borderColor:[`${C.yellow}80`,`rgba(200,200,200,0.5)`,`rgba(180,100,20,0.6)`][rank-1]},isMe&&{borderColor:`${C.mint}80`,backgroundColor:'rgba(0,240,181,0.08)'}]}>
        {isTop&&<LinearGradient colors={MEDAL_COLS[rank-1] as [string,string]} style={{...StyleSheet.absoluteFillObject,borderRadius:18}}/>}
        {/* Rank badge */}
        <View style={{width:44,height:44,borderRadius:14,
          backgroundColor:'rgba(255,255,255,0.10)',alignItems:'center',justifyContent:'center',
          borderWidth:2,borderColor:isTop?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.12)'}}>
          {isTop?<Text style={{fontSize:24}}>{MEDALS[rank-1]}</Text>
            :<Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontWeight:'900',fontSize:13}}>#{rank}</Text>}
        </View>
        {/* Avatar */}
        <TouchableOpacity onPress={()=>openProfile(p.walletAddress)} style={{flexDirection:'row',alignItems:'center',gap:10,flex:1}}>
        <View style={{width:46,height:46,borderRadius:23,overflow:'hidden',alignItems:'center',justifyContent:'center',
          borderWidth:3,borderColor:isMe?C.mint:isTop?C.yellow:'rgba(255,255,255,0.2)'}}>
          <LinearGradient colors={isMe?[C.mint,C.blue]:isTop?[C.orange,C.purple]:[C.purple,C.cyan]} style={{...StyleSheet.absoluteFillObject}}/>
          <Text style={{color:isMe?'#000':'#fff',fontSize:20,fontWeight:'900',fontFamily:'monospace'}}>
            {(p.displayName||'?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={{flex:1}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
            <Text style={{color:isMe?C.mint:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:14}} numberOfLines={1}>
              {p.displayName||`${p.walletAddress?.slice(0,6)}...`}
            </Text>
            {isMe&&<View style={{backgroundColor:`${C.mint}25`,borderRadius:8,paddingHorizontal:6,paddingVertical:2,borderWidth:1,borderColor:`${C.mint}50`}}>
              <Text style={{color:C.mint,fontFamily:'monospace',fontSize:8,fontWeight:'900'}}>YOU 👈</Text>
            </View>}
          </View>
          <View style={{flexDirection:'row',alignItems:'center',gap:4,marginTop:3}}>
            <View style={{backgroundColor:`${C.yellow}20`,borderRadius:8,paddingHorizontal:7,paddingVertical:2,borderWidth:1,borderColor:`${C.yellow}40`}}>
              <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:11}}>
                {(p.totalScore||p.score||0).toLocaleString()} pts
              </Text>
            </View>
          </View>
        </View>
        </TouchableOpacity>
        {!isMe&&(
          <View style={{flexDirection:'row',gap:8}}>
            <TouchableOpacity onPress={()=>openDonationModal(p.walletAddress,p.displayName||p.walletAddress.slice(0,6))}
              style={{width:64,height:64,borderRadius:18,backgroundColor:`${C.mint}25`,borderWidth:2.5,borderColor:`${C.mint}80`,alignItems:'center',justifyContent:'center'}}>
              <Image source={ICON_TIPS} style={{width:52,height:52,resizeMode:'contain'}}/>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>{playSword();startChallenge(p.walletAddress,p.displayName||p.walletAddress.slice(0,6));}}
              style={{width:64,height:64,borderRadius:18,backgroundColor:`${C.coral}25`,borderWidth:2.5,borderColor:`${C.coral}80`,alignItems:'center',justifyContent:'center'}}>
              <Image source={ICON_DUEL} style={{width:52,height:52,resizeMode:'contain'}}/>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderDuelCard=(ch:any)=>{
    const isChallenger=ch.challengerWallet===user?.walletAddress;
    const opponentName=isChallenger?ch.challengedName:ch.challengerName;
    const myScore=isChallenger?ch.challengerScore:ch.challengedScore;
    const theirScore=isChallenger?ch.challengedScore:ch.challengerScore;
    const isComplete=ch.status==='completed';
    const isPending=ch.status==='pending';
    const isDeclined=ch.status==='declined';
    const needsAccept=isPending&&!isChallenger;
    const needsMyPlay=!isComplete&&!isDeclined&&((isChallenger&&typeof ch.challengerScore!=='number')||(!isChallenger&&typeof ch.challengedScore!=='number'));
    const iWon=isComplete&&ch.winnerWallet===user?.walletAddress;
    if(isDeclined)return null;
    return(
      <View key={ch.id} style={[st.duelCard,isComplete&&{borderColor:iWon?`${C.mint}60`:`${C.coral}60`}]}>
        {isComplete&&<LinearGradient colors={iWon?['rgba(0,240,181,0.12)','transparent']:['rgba(255,77,109,0.12)','transparent']} style={{...StyleSheet.absoluteFillObject,borderRadius:16}}/>}
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
            <Image source={ICON_DUEL} style={{width:14,height:14,resizeMode:'contain'}}/>
            <Text style={{color:'#fff',fontFamily:'monospace',fontSize:13,fontWeight:'900'}}>
              {isChallenger?'You challenged':'Challenge from'} {opponentName}
            </Text>
          </View>
          {isComplete&&(
            <View style={{backgroundColor:iWon?`${C.mint}25`:`${C.coral}20`,borderRadius:10,paddingHorizontal:8,paddingVertical:3,borderWidth:1.5,borderColor:iWon?`${C.mint}60`:`${C.coral}60`}}>
              <Text style={{color:iWon?C.mint:C.coral,fontFamily:'monospace',fontSize:11,fontWeight:'900'}}>
                {iWon?'WON':'LOST'}
              </Text>
            </View>
          )}
        </View>
        {ch.gameName&&<Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:10,marginBottom:6}}>🎮 {ch.gameName}</Text>}
        {!isComplete&&!isDeclined&&<Text style={{color:'rgba(255,255,255,0.4)',fontFamily:'monospace',fontSize:10}}>{isPending?'⏳ Pending':'🎮 In progress'}</Text>}
        {(myScore!=null||theirScore!=null)&&(
          <View style={{flexDirection:'row',gap:16,marginTop:6}}>
            <Text style={{color:'#fff',fontFamily:'monospace',fontSize:11}}>You: {typeof myScore==='number'?myScore.toLocaleString():'—'}</Text>
            <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:11}}>vs {typeof theirScore==='number'?theirScore.toLocaleString():'—'}</Text>
          </View>
        )}
        {isComplete&&(
          <View style={{flexDirection:'row',gap:8,marginTop:10}}>
            <TouchableOpacity onPress={()=>watchReplay(ch,user?.walletAddress||'')}
              style={{flex:1,borderRadius:12,overflow:'hidden',borderWidth:2,borderColor:`${C.cyan}50`,backgroundColor:`${C.cyan}12`}}>
              <View style={{paddingVertical:9,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:6}}>
                <Text style={{color:C.cyan,fontFamily:'monospace',fontSize:11,fontWeight:'900'}}>MY REPLAY</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>watchReplay(ch,isChallenger?ch.challengedWallet:ch.challengerWallet)}
              style={{flex:1,borderRadius:12,overflow:'hidden',borderWidth:2,borderColor:`${C.purple}50`,backgroundColor:`${C.purple}12`}}>
              <View style={{paddingVertical:9,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:6}}>
                <Text style={{color:C.purple,fontFamily:'monospace',fontSize:11,fontWeight:'900'}}>THEIR REPLAY</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
        {needsAccept&&(
          <View style={{flexDirection:'row',gap:8,marginTop:10}}>
            <TouchableOpacity onPress={()=>handleAcceptChallenge(ch)} style={{flex:1,borderRadius:12,overflow:'hidden'}}>
              <LinearGradient colors={[C.mint,C.blue]} start={{x:0,y:0}} end={{x:1,y:0}} style={{paddingVertical:10,alignItems:'center'}}>
                <Text style={{color:'#000',fontFamily:'monospace',fontSize:12,fontWeight:'900'}}>⚔️ ACCEPT</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>handleDecline(ch)} style={{flex:1,backgroundColor:`${C.coral}15`,borderRadius:12,paddingVertical:10,alignItems:'center',borderWidth:2,borderColor:`${C.coral}50`}}>
              <Text style={{color:C.coral,fontFamily:'monospace',fontSize:12,fontWeight:'700'}}>DECLINE</Text>
            </TouchableOpacity>
          </View>
        )}
        {needsMyPlay&&!needsAccept&&(
          <TouchableOpacity onPress={()=>handleAcceptChallenge(ch)} style={{marginTop:10,borderRadius:12,overflow:'hidden'}}>
            <LinearGradient colors={[C.orange,C.coral]} start={{x:0,y:0}} end={{x:1,y:0}} style={{paddingVertical:10,alignItems:'center'}}>
              <Text style={{color:'#fff',fontFamily:'monospace',fontSize:12,fontWeight:'900'}}>▶ PLAY YOUR TURN</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return(
    <View style={{flex:1}}>
      <LinearGradient colors={['#001A4D','#00296B','#0050A0','#001A4D']} style={StyleSheet.absoluteFill}/>
      <StickmanBuilder/>
      <SafeAreaView style={{flex:1}}>

        {/* HEADER */}
        <View style={st.header}>
          <TouchableOpacity onPress={()=>{playBack();router.back();}} style={st.backBtn}>
            <LinearGradient colors={[C.orange,C.coral]} style={{paddingHorizontal:14,paddingVertical:8,borderRadius:14,flexDirection:'row',alignItems:'center',gap:4}}>
              <Text style={{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:12}}>← BACK</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={{flex:1,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:8}}>
            <Image source={ICON_COPPA} style={{width:26,height:26,resizeMode:'contain'}}/>
            <Text style={st.headerTitle}>RANKINGS</Text>
          </View>
          <View style={{width:70}}/>
        </View>

        {/* TABS */}
        <View style={{flexDirection:'row',paddingHorizontal:16,gap:8,marginBottom:10}}>
          {[
            {key:'alltime',label:'🏆  LEADERBOARD',c:C.yellow},
            {key:'duels',  label:`⚔️  DUELS${pendingForMe.length>0?` (${pendingForMe.length})`:''}`,c:C.coral},
          ].map(t=>(
            <TouchableOpacity key={t.key} onPress={()=>setTab(t.key as Tab)}
              style={[st.tab,tab===t.key&&{backgroundColor:`${t.c}20`,borderColor:t.c}]}>
              <Text style={[st.tabText,tab===t.key&&{color:t.c}]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.yellow}/>}
          contentContainerStyle={{paddingHorizontal:14,paddingBottom:44}}>

          {tab==='alltime'&&(
            <>
              {alltimeData.length===0?(
                <View style={{alignItems:'center',paddingTop:60}}>
                  <Text style={{fontSize:44,marginBottom:12}}>🏆</Text>
                  <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',textAlign:'center'}}>No rankings yet. Play some games!</Text>
                </View>
              ):alltimeData.map((p,i)=>renderPlayerCard(p,i+1,`${p.walletAddress}_${i}`))}
            </>
          )}

          {tab==='duels'&&(
            <>
              {/* Duel record */}
              <View style={st.recordBox}>
                <LinearGradient colors={['rgba(153,69,255,0.25)','rgba(0,212,255,0.12)']} style={{...StyleSheet.absoluteFillObject,borderRadius:20}}/>
                <Text style={{color:C.yellow,fontFamily:'monospace',fontSize:11,fontWeight:'900',letterSpacing:1.5,textAlign:'center',marginBottom:14}}>
                  YOUR DUEL RECORD
                </Text>
                <View style={{flexDirection:'row',justifyContent:'space-around'}}>
                  {[
                    {label:'WINS',  val:duelRecord.wins,   col:C.mint},
                    {label:'DRAWS', val:duelRecord.draws,  col:C.yellow},
                    {label:'LOSSES',val:duelRecord.losses, col:C.coral},
                  ].map(d=>(
                    <View key={d.label} style={{alignItems:'center'}}>
                      <View style={{width:60,height:60,borderRadius:30,backgroundColor:`${d.col}20`,
                        alignItems:'center',justifyContent:'center',
                        borderWidth:3,borderColor:`${d.col}60`,
                        shadowColor:d.col,shadowRadius:12,shadowOpacity:0.7}}>
                        <Text style={{color:d.col,fontSize:26,fontWeight:'900',fontFamily:'monospace'}}>{d.val}</Text>
                      </View>
                      <Text style={{color:'rgba(255,255,255,0.45)',fontSize:9,fontFamily:'monospace',marginTop:6}}>{d.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {pendingForMe.length>0&&(
                <View style={{marginBottom:14}}>
                  <View style={st.secHead}>
                    <View style={{width:8,height:8,borderRadius:4,backgroundColor:C.coral,shadowColor:C.coral,shadowRadius:6,shadowOpacity:1}}/>
                    <Text style={st.secTitle}>📩  INCOMING CHALLENGES</Text>
                  </View>
                  {pendingForMe.map(renderDuelCard)}
                </View>
              )}
              {pendingSent.length>0&&(
                <View style={{marginBottom:14}}>
                  <View style={st.secHead}>
                    <View style={{width:8,height:8,borderRadius:4,backgroundColor:C.orange,shadowColor:C.orange,shadowRadius:6,shadowOpacity:1}}/>
                    <Text style={st.secTitle}>SENT CHALLENGES</Text>
                  </View>
                  {pendingSent.map(renderDuelCard)}
                </View>
              )}
              {activeDuels.length>0&&(
                <View style={{marginBottom:14}}>
                  <View style={st.secHead}>
                    <View style={{width:8,height:8,borderRadius:4,backgroundColor:C.cyan,shadowColor:C.cyan,shadowRadius:6,shadowOpacity:1}}/>
                    <Text style={st.secTitle}>⚔️  ACTIVE DUELS</Text>
                  </View>
                  {activeDuels.map(renderDuelCard)}
                </View>
              )}
              {completedDuels.length>0&&(
                <View>
                  <View style={st.secHead}>
                    <View style={{width:8,height:8,borderRadius:4,backgroundColor:C.purple,shadowColor:C.purple,shadowRadius:6,shadowOpacity:1}}/>
                    <Text style={st.secTitle}>📜  HISTORY</Text>
                  </View>
                  {completedDuels.map(renderDuelCard)}
                </View>
              )}
              {allChallenges.length===0&&(
                <View style={{alignItems:'center',marginTop:40,gap:12}}>
                  <Image source={ICON_DUEL} style={{width:40,height:40,resizeMode:'contain',opacity:0.5}}/>
                  <Text style={{color:'rgba(255,255,255,0.45)',textAlign:'center',fontFamily:'monospace',lineHeight:20}}>
                    {'No duels yet.\nTap the duel icon on a player\nto challenge them!'}
                  </Text>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* GAME PICKER */}
        <Modal visible={showGamePicker} transparent animationType="slide">
          <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'flex-end'}}>
            <View style={{backgroundColor:C.dark,borderTopLeftRadius:24,borderTopRightRadius:24,padding:22,maxHeight:'72%',borderTopWidth:3,borderColor:C.purple}}>
              <LinearGradient colors={['rgba(153,69,255,0.18)','transparent']} style={{...StyleSheet.absoluteFillObject,borderRadius:24}}/>
              <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:6}}>
                <Image source={ICON_DUEL} style={{width:20,height:20,resizeMode:'contain'}}/>
                <Text style={{color:C.yellow,fontFamily:'monospace',fontSize:14,fontWeight:'900'}}>SELECT GAME FOR DUEL</Text>
              </View>
              <Text style={{color:'rgba(255,255,255,0.45)',fontFamily:'monospace',fontSize:10,marginBottom:14}}>
                Both players play this game — highest score wins!
              </Text>
              <ScrollView style={{maxHeight:380}}>
                {publicGames.map(game=>(
                  <TouchableOpacity key={game.id} onPress={()=>{playSword();sendChallenge(game);}}
                    style={{backgroundColor:'rgba(255,255,255,0.08)',borderRadius:14,padding:14,marginBottom:8,borderWidth:2,borderColor:'rgba(255,255,255,0.15)'}}>
                    <Text style={{color:'#fff',fontFamily:'monospace',fontSize:13,fontWeight:'900'}}>{game.name}</Text>
                    <Text style={{color:'rgba(255,255,255,0.4)',fontFamily:'monospace',fontSize:10,marginTop:2}}>
                      by {game.creatorName||'?'} · {game.levels?.length||0} lvl · ⭐ {(game.rating||0).toFixed(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity onPress={()=>setShowGamePicker(false)}
                style={{marginTop:12,paddingVertical:13,alignItems:'center',borderRadius:14,borderWidth:2,borderColor:'rgba(255,255,255,0.2)'}}>
                <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontWeight:'900'}}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>

      {/* DONATION MODAL */}
      <Modal visible={showDonationModal} transparent animationType="slide" onRequestClose={()=>setShowDonationModal(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:C.dark,borderTopLeftRadius:28,borderTopRightRadius:28,padding:24,paddingBottom:44,borderTopWidth:3,borderColor:C.mint,overflow:'hidden'}}>
            <LinearGradient colors={['rgba(0,240,181,0.14)','transparent']} style={StyleSheet.absoluteFill}/>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
                <Image source={ICON_TIPS} style={{width:24,height:24,resizeMode:'contain'}}/>
                <Text style={{color:'#fff',fontSize:16,fontWeight:'900',fontFamily:'monospace'}}>
                  DONATE TO {donationTarget?.name?.toUpperCase()||'PLAYER'}
                </Text>
              </View>
              <TouchableOpacity onPress={()=>setShowDonationModal(false)}
                style={{width:32,height:32,borderRadius:16,backgroundColor:'rgba(255,255,255,0.10)',alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'rgba(255,255,255,0.7)',fontSize:16,fontWeight:'900'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{color:'rgba(255,255,255,0.4)',fontFamily:'monospace',fontSize:10,marginBottom:14}}>
              90% goes to the player · 10% to developers
            </Text>
            {/* Quick-donate preset chips */}
            <View style={{flexDirection:'row',gap:8,marginBottom:12}}>
              {[{label:'$0.50',usd:0.5},{label:'$5',usd:5},{label:'$15',usd:15}].map(({label,usd})=>{
                const skr=skrPrice>0?Math.ceil(usd/skrPrice):0;
                return(
                  <TouchableOpacity key={label} disabled={donating} onPress={()=>handleDonate(skr)}
                    style={{flex:1,backgroundColor:`${C.mint}18`,borderRadius:14,paddingVertical:12,paddingHorizontal:6,
                      borderWidth:2,borderColor:`${C.mint}55`,alignItems:'center'}}>
                    <Text style={{color:C.mint,fontSize:15,fontWeight:'900',fontFamily:'monospace'}}>{label}</Text>
                    <Text style={{color:'rgba(255,255,255,0.35)',fontSize:9,fontFamily:'monospace',marginTop:2}}>~{skr} SKR</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Custom amount row */}
            <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
              <View style={{flex:1,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:12,
                paddingHorizontal:12,paddingVertical:10,borderWidth:1.5,borderColor:'rgba(255,255,255,0.18)'}}>
                <TextInput value={donationAmt} onChangeText={setDonationAmt}
                  placeholder="Custom SKR amount" placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="numeric" style={{color:'#fff',fontFamily:'monospace',fontSize:13}}/>
              </View>
              <TouchableOpacity disabled={donating||!donationAmt}
                onPress={()=>handleDonate(parseInt(donationAmt||'0'))}
                style={{borderRadius:12,overflow:'hidden',opacity:donating||!donationAmt?0.5:1}}>
                <LinearGradient colors={[C.mint,C.blue]} style={{paddingHorizontal:16,paddingVertical:11,justifyContent:'center',alignItems:'center'}}>
                  <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:12}}>SEND</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PLAYER PROFILE MODAL */}
      <Modal visible={showProfile} transparent animationType="fade" onRequestClose={()=>setShowProfile(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'center',padding:20}}>
          <View style={{borderRadius:26,overflow:'hidden',borderWidth:3,borderColor:C.purple}}>
            <LinearGradient colors={['#0D0028','#001A40','#0D0028']} style={{padding:24}}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <Text style={{color:C.yellow,fontFamily:'monospace',fontSize:16,fontWeight:'900'}}>PLAYER PROFILE</Text>
                <TouchableOpacity onPress={()=>setShowProfile(false)}
                  style={{width:32,height:32,borderRadius:16,backgroundColor:'rgba(255,255,255,0.10)',alignItems:'center',justifyContent:'center'}}>
                  <Text style={{color:'rgba(255,255,255,0.7)',fontSize:16,fontWeight:'900'}}>✕</Text>
                </TouchableOpacity>
              </View>
              {profileLoading?(
                <View style={{alignItems:'center',paddingVertical:40}}>
                  <ActivityIndicator color={C.yellow} size="large"/>
                </View>
              ):profileData?(
                <>
                  {/* Avatar + name */}
                  <View style={{flexDirection:'row',alignItems:'center',gap:14,marginBottom:18}}>
                    <View style={{width:56,height:56,borderRadius:28,overflow:'hidden',alignItems:'center',justifyContent:'center',
                      borderWidth:3,borderColor:C.orange}}>
                      <LinearGradient colors={[C.orange,C.purple]} style={{...StyleSheet.absoluteFillObject}}/>
                      <Text style={{color:'#fff',fontSize:26,fontWeight:'900',fontFamily:'monospace'}}>
                        {(profileData.displayName||'?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:16}}>{profileData.displayName||'Anonymous'}</Text>
                      <Text style={{color:'rgba(255,255,255,0.35)',fontFamily:'monospace',fontSize:9,marginTop:2}}>
                        {profileData.walletAddress?`${profileData.walletAddress.slice(0,6)}...${profileData.walletAddress.slice(-6)}`:''}
                      </Text>
                    </View>
                  </View>
                  {/* Stats grid */}
                  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:16}}>
                    {[
                      {label:'SCORE',val:(profileData.totalScore||0).toLocaleString(),c:C.yellow},
                      {label:'PLAYED',val:String(profileData.levelsPlayed||0),c:C.cyan},
                      {label:'WINS',val:String(profileData.levelsCompleted||0),c:C.mint},
                      {label:'TIME',val:`${Math.floor((profileData.minutesPlayed||0)/60)}h ${(profileData.minutesPlayed||0)%60}m`,c:C.pink},
                    ].map(s=>(
                      <View key={s.label} style={{flex:1,minWidth:'45%',backgroundColor:`${s.c}12`,borderRadius:14,padding:12,
                        alignItems:'center',borderWidth:2,borderColor:`${s.c}35`}}>
                        <Text style={{color:s.c,fontSize:18,fontWeight:'900',fontFamily:'monospace'}}>{s.val}</Text>
                        <Text style={{color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',marginTop:3}}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Achievement progress */}
                  <View style={{backgroundColor:'rgba(255,255,255,0.06)',borderRadius:14,padding:14,marginBottom:16,borderWidth:2,borderColor:`${C.yellow}30`}}>
                    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <Text style={{color:'#fff',fontFamily:'monospace',fontWeight:'900',fontSize:11}}>ACHIEVEMENTS</Text>
                      <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:11}}>
                        {Object.keys(profileData.achievements||{}).length} / {ACHIEVEMENTS.length}
                      </Text>
                    </View>
                    <View style={{height:10,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:5,overflow:'hidden'}}>
                      <LinearGradient colors={[C.yellow,C.orange,C.coral]}
                        start={{x:0,y:0}} end={{x:1,y:0}}
                        style={{height:'100%',width:`${Math.round((Object.keys(profileData.achievements||{}).length/ACHIEVEMENTS.length)*100)}%`,borderRadius:5}}/>
                    </View>
                  </View>
                  {/* Duel record */}
                  {profileData.duelRecord&&(
                    <View style={{flexDirection:'row',justifyContent:'space-around',marginBottom:18}}>
                      {[
                        {label:'WINS',val:profileData.duelRecord.wins,c:C.mint},
                        {label:'DRAWS',val:profileData.duelRecord.draws,c:C.yellow},
                        {label:'LOSSES',val:profileData.duelRecord.losses,c:C.coral},
                      ].map(d=>(
                        <View key={d.label} style={{alignItems:'center'}}>
                          <View style={{width:48,height:48,borderRadius:24,backgroundColor:`${d.c}18`,
                            alignItems:'center',justifyContent:'center',borderWidth:2.5,borderColor:`${d.c}50`}}>
                            <Text style={{color:d.c,fontSize:20,fontWeight:'900',fontFamily:'monospace'}}>{d.val}</Text>
                          </View>
                          <Text style={{color:'rgba(255,255,255,0.4)',fontSize:8,fontFamily:'monospace',marginTop:4}}>{d.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {/* Action buttons */}
                  {profileData.walletAddress!==user?.walletAddress&&(
                    <View style={{flexDirection:'row',gap:10}}>
                      <TouchableOpacity onPress={()=>{setShowProfile(false);openDonationModal(profileData.walletAddress,profileData.displayName||profileData.walletAddress.slice(0,6));}}
                        style={{flex:1,borderRadius:14,overflow:'hidden',borderWidth:2,borderColor:`${C.mint}60`}}>
                        <LinearGradient colors={[`${C.mint}18`,`${C.mint}08`]} style={{paddingVertical:12,alignItems:'center'}}>
                          <Text style={{color:C.mint,fontFamily:'monospace',fontWeight:'900',fontSize:12}}>TIP</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={()=>{setShowProfile(false);playSword();startChallenge(profileData.walletAddress,profileData.displayName||profileData.walletAddress.slice(0,6));}}
                        style={{flex:1,borderRadius:14,overflow:'hidden',borderWidth:2,borderColor:`${C.coral}60`}}>
                        <LinearGradient colors={[`${C.coral}18`,`${C.coral}08`]} style={{paddingVertical:12,alignItems:'center'}}>
                          <Text style={{color:C.coral,fontFamily:'monospace',fontWeight:'900',fontSize:12}}>DUEL</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ):(
                <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',textAlign:'center',paddingVertical:30}}>Could not load profile</Text>
              )}
            </LinearGradient>
          </View>
        </View>
      </Modal>

      {/* TX PREVIEW */}
      <Modal visible={showTxPreview} transparent animationType="fade" onRequestClose={()=>setShowTxPreview(false)}>
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.9)',justifyContent:'center',padding:24}}>
          <View style={{borderRadius:26,overflow:'hidden',borderWidth:3,borderColor:C.mint}}>
            <LinearGradient colors={['#0D0028','#001A40']} style={{padding:26}}>
              <Text style={{color:C.mint,fontFamily:'monospace',fontSize:16,fontWeight:'900',textAlign:'center',marginBottom:16}}>CONFIRM DONATION 💝</Text>
              {txPreview&&(
                <>
                  <View style={{gap:10,marginBottom:22}}>
                    {[
                      {lbl:'To',val:txPreview.to,c:C.yellow},
                      {lbl:'Amount',val:`${txPreview.skr} SKR (~$${txPreview.usd})`,c:C.mint},
                      {lbl:'Player gets',val:`${Math.floor(txPreview.skr*0.9)} SKR (90%)`,c:C.cyan},
                      {lbl:'Dev fund',val:`${Math.floor(txPreview.skr*0.1)} SKR (10%)`,c:C.purple},
                    ].map(r=>(
                      <View key={r.lbl} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',
                        backgroundColor:'rgba(255,255,255,0.06)',borderRadius:12,paddingHorizontal:14,paddingVertical:10,
                        borderWidth:1,borderColor:`${r.c}30`}}>
                        <Text style={{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontSize:11}}>{r.lbl}</Text>
                        <Text style={{color:r.c,fontFamily:'monospace',fontWeight:'900',fontSize:12}}>{r.val}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{flexDirection:'row',gap:10}}>
                    <TouchableOpacity onPress={()=>setShowTxPreview(false)} style={{flex:1,paddingVertical:14,borderRadius:16,alignItems:'center',borderWidth:2,borderColor:'rgba(255,255,255,0.2)'}}>
                      <Text style={{color:'rgba(255,255,255,0.5)',fontWeight:'900',fontFamily:'monospace'}}>CANCEL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmDonate} disabled={donating} style={{flex:2,borderRadius:16,overflow:'hidden',opacity:donating?0.7:1}}>
                      <LinearGradient colors={[C.mint,C.blue]} start={{x:0,y:0}} end={{x:1,y:0}} style={{paddingVertical:14,alignItems:'center'}}>
                        {donating?<ActivityIndicator color="#000" size="small"/>:<Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>CONFIRM 💝</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st=StyleSheet.create({
  header:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:10},
  backBtn:{borderRadius:14,overflow:'hidden'},
  headerTitle:{color:'#fff',fontSize:18,fontWeight:'900',fontFamily:'monospace',letterSpacing:3},
  tab:{flex:1,paddingVertical:11,borderRadius:16,alignItems:'center',
    backgroundColor:'rgba(255,255,255,0.08)',borderWidth:2.5,borderColor:'rgba(255,255,255,0.15)'},
  tabText:{color:'rgba(255,255,255,0.5)',fontFamily:'monospace',fontWeight:'900',fontSize:12},
  playerCard:{flexDirection:'row',alignItems:'center',gap:10,
    backgroundColor:'rgba(6,0,30,0.90)',borderRadius:18,padding:14,marginBottom:10,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.12)',overflow:'hidden'},
  duelCard:{backgroundColor:'rgba(6,0,30,0.90)',borderRadius:16,padding:14,marginBottom:10,
    borderWidth:2.5,borderColor:'rgba(255,255,255,0.15)',overflow:'hidden'},
  recordBox:{borderRadius:20,padding:18,marginBottom:16,
    backgroundColor:'rgba(6,0,30,0.85)',borderWidth:2.5,borderColor:'rgba(153,69,255,0.35)',overflow:'hidden'},
  secHead:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:10},
  secTitle:{color:'#fff',fontWeight:'900',fontFamily:'monospace',fontSize:12,letterSpacing:1},
});
