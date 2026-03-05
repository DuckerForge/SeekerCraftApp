// app/login.tsx - SeekerCraft Connect Wallet 🎯 Index-style
import 'react-native-get-random-values'
import React, { useState, useEffect, useRef } from 'react'
import {
  Text, View, Alert, ActivityIndicator, TouchableOpacity,
  ScrollView, Animated, Modal, StyleSheet, Dimensions, Image, ImageBackground,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useWallet } from '@/utils/walletContext'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import i18n from '@/utils/i18n'

const { width: SW, height: SH } = Dimensions.get('window')

const BG_IMAGE    = require('../assets/images/sfondo.jpg')
const ICON_COPPA  = require('../assets/images/Icons/coppa.png')
const ICON_STELLA = require('../assets/images/Icons/stella.png')
const ICON_SAVE   = require('../assets/images/Icons/save.png')
const ICON_BROWSE = require('../assets/images/Icons/Browse.png')
const ICON_PLAY   = require('../assets/images/Icons/play.png')
const ICON_AI     = require('../assets/images/Icons/AI.png')

// Peg images for falling items
const PEG_IMAGES = [
  require('../assets/images/Peg/skr.png'),
  require('../assets/images/Peg/btc.png'),
  require('../assets/images/Peg/sol.png'),
  require('../assets/images/Peg/bump.png'),
  require('../assets/images/Peg/bucket.png'),
  require('../assets/images/Peg/peg_gold.png'),
  require('../assets/images/Peg/curva.png'),
  require('../assets/images/Peg/TeleportA.png'),
  require('../assets/images/Peg/TeleportB.png'),
  require('../assets/images/Peg/moving.png'),
  require('../assets/images/Peg/BigStar.png'),
  require('../assets/images/Peg/bucket2.png'),
  require('../assets/images/Peg/bucket3.png'),
  require('../assets/images/Peg/skr.png'),
]

const C = {
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  pink:'#FF69B4', mint:'#00F0B5', cyan:'#00D4FF',
  purple:'#9945FF', lime:'#8BFF00', blue:'#3B7DFF',
}

const PEGS = Array.from({length:14},(_,i)=>({
  x:(i/14)*SW + Math.sin(i*1.3)*16,
  size:24+(i%3)*12,
  delay:i*350,
  duration:3800+(i%5)*700,
  imgIndex:i%PEG_IMAGES.length,
}))

function FallingPeg({x,size,delay,duration,imgIndex}:any){
  const y=useRef(new Animated.Value(-80)).current
  const op=useRef(new Animated.Value(0)).current
  const rot=useRef(new Animated.Value(0)).current
  useEffect(()=>{
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(y,{toValue:SH+80,duration,useNativeDriver:true}),
        Animated.sequence([
          Animated.timing(op,{toValue:0.85,duration:400,useNativeDriver:true}),
          Animated.timing(op,{toValue:0.55,duration:duration-600,useNativeDriver:true}),
          Animated.timing(op,{toValue:0,duration:200,useNativeDriver:true}),
        ]),
        Animated.timing(rot,{toValue:1,duration,useNativeDriver:true}),
      ]),
      Animated.parallel([
        Animated.timing(y,{toValue:-80,duration:0,useNativeDriver:true}),
        Animated.timing(rot,{toValue:0,duration:0,useNativeDriver:true}),
      ]),
    ])).start()
  },[])
  const spin=rot.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})
  return(
    <Animated.Image
      source={PEG_IMAGES[imgIndex]}
      style={{
        position:'absolute',left:x,top:0,
        width:size,height:size,resizeMode:'contain',
        opacity:op,transform:[{translateY:y},{rotate:spin}],
      }}
    />
  )
}

// Sparkles same as index
const SPARKS = Array.from({length:12},(_,i)=>({
  x:16+(i/12)*SW*0.9,
  y:30+Math.sin(i*2.3)*SH*0.12,
  sz:8+i%4*3,
  delay:i*280,
  emoji:['✦','✧','⭐','💫','✨'][i%5],
  color:[C.yellow,C.mint,C.cyan,C.pink,C.lime,C.orange][i%6],
}))

function Spark({x,y,sz,delay,emoji,color}:any){
  const op=useRef(new Animated.Value(0)).current
  const sc=useRef(new Animated.Value(0.3)).current
  const rot=useRef(new Animated.Value(0)).current
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
    ])).start()
  },[])
  const spin=rot.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})
  return(
    <Animated.Text style={{position:'absolute',left:x,top:y,fontSize:sz,
      opacity:op,transform:[{scale:sc},{rotate:spin}],
      textShadowColor:color,textShadowRadius:12,textShadowOffset:{width:0,height:0},
    }}>{emoji}</Animated.Text>
  )
}

const LANGUAGES = [
  {code:'en',flag:'🇬🇧',label:'EN'},
  {code:'fr',flag:'🇫🇷',label:'FR'},
  {code:'de',flag:'🇩🇪',label:'DE'},
  {code:'es',flag:'🇪🇸',label:'ES'},
  {code:'zh',flag:'🇨🇳',label:'ZH'},
  {code:'ja',flag:'🇯🇵',label:'JA'},
  {code:'ko',flag:'🇰🇷',label:'KO'},
] as const;

export default function LoginScreen(){
  const {t}=useTranslation();
  const {connect,connecting,connected}=useWallet()
  const [showPrivacy,setShowPrivacy]=useState(false)
  const [showTerms,setShowTerms]=useState(false)
  const [currentLang,setCurrentLang]=useState(i18n.language||'en')

  const switchLang=async(code:string)=>{
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    i18n.changeLanguage(code)
    setCurrentLang(code)
    try{ await AsyncStorage.setItem('@lang',code) }catch{}
  }
  useEffect(()=>{if(connected&&!connecting)router.replace('/')},[connected,connecting])

  const ringRot=useRef(new Animated.Value(0)).current
  const ringScale=useRef(new Animated.Value(1)).current
  const titleY=useRef(new Animated.Value(30)).current
  const titleOp=useRef(new Animated.Value(0)).current

  useEffect(()=>{
    Animated.loop(Animated.timing(ringRot,{toValue:1,duration:4500,useNativeDriver:true})).start()
    Animated.loop(Animated.sequence([
      Animated.timing(ringScale,{toValue:1.10,duration:1400,useNativeDriver:true}),
      Animated.timing(ringScale,{toValue:1.0, duration:1400,useNativeDriver:true}),
    ])).start()
    // fade in title
    Animated.parallel([
      Animated.timing(titleY,{toValue:0,duration:800,useNativeDriver:true}),
      Animated.timing(titleOp,{toValue:1,duration:800,useNativeDriver:true}),
    ]).start()
  },[])

  const ringAngle=ringRot.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})

  const handleConnect=async()=>{
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    try{await connect()}catch(err:any){console.log('[Login]',err?.message)}
  }

  return(
    <View style={st.root}>
      {/* Same background as index */}
      <ImageBackground source={BG_IMAGE} style={StyleSheet.absoluteFill} resizeMode="cover"/>
      <LinearGradient
        colors={['rgba(0,0,0,0.15)','rgba(20,8,50,0.65)','rgba(10,0,40,0.90)']}
        locations={[0,0.45,1]}
        style={StyleSheet.absoluteFill}/>

      {/* Falling peg images */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {PEGS.map((p,i)=><FallingPeg key={i} {...p}/>)}
      </View>

      {/* Sparkles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {SPARKS.map((s,i)=><Spark key={i} {...s}/>)}
      </View>

      <SafeAreaView style={{flex:1}}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* LOGO with spinning ring */}
          <View style={st.logoWrap}>
            <Animated.View style={{position:'absolute',width:210,height:210,borderRadius:105,
              transform:[{rotate:ringAngle}],borderWidth:4,borderColor:'transparent',
              borderTopColor:C.yellow,borderRightColor:C.mint,
              borderBottomColor:C.cyan,borderLeftColor:C.pink,
              shadowColor:C.yellow,shadowRadius:24,shadowOpacity:1}}/>
            <Animated.View style={{position:'absolute',width:185,height:185,borderRadius:92,
              transform:[{scale:ringScale}],borderWidth:3,borderColor:'rgba(255,255,255,0.3)',
              shadowColor:'#fff',shadowRadius:18,shadowOpacity:0.5}}/>
            <View style={st.logoCircle}>
              <Image source={require('../assets/images/log.png')} style={{width:140,height:140,borderRadius:70}} resizeMode="cover"/>
            </View>
          </View>

          {/* TITLE */}
          <Animated.View style={{transform:[{translateY:titleY}],opacity:titleOp,alignItems:'center'}}>
            <Text style={st.titleShadow}>{t('seekercraft')}</Text>
            <Text style={st.title}>{t('seekercraft')}</Text>
            <View style={st.subtitlePill}>
              <Text style={st.subtitleText}>{t('tagline')}</Text>
            </View>
          </Animated.View>

          {/* FEATURES */}
          <View style={st.featuresCard}>
            <LinearGradient colors={['rgba(153,69,255,0.18)','rgba(0,212,255,0.08)']} style={{...StyleSheet.absoluteFillObject,borderRadius:24}}/>
            {[
              {icon:ICON_PLAY,   text:t('feature_shoot'),   c:C.yellow},
              {icon:ICON_COPPA,  text:t('feature_leaderboard'),      c:C.mint},
              {icon:ICON_BROWSE, text:t('feature_community'),     c:C.cyan},
              {icon:ICON_SAVE,   text:t('feature_publish'),     c:C.orange},
              {icon:ICON_STELLA, text:t('feature_duel'),      c:C.coral},
              {icon:ICON_AI,     text:t('feature_ai'),        c:C.purple},
            ].map((f,i)=>(
              <View key={i} style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:i<5?10:0}}>
                <View style={{width:44,height:44,borderRadius:12,
                  backgroundColor:`${f.c}22`,borderWidth:2,borderColor:`${f.c}55`,
                  alignItems:'center',justifyContent:'center'}}>
                  <Image source={f.icon} style={{width:32,height:32,resizeMode:'contain'}}/>
                </View>
                <Text style={{color:'rgba(255,255,255,0.88)',fontFamily:'monospace',fontSize:12,flex:1}}>{f.text}</Text>
              </View>
            ))}
          </View>

          {/* CONNECT BUTTON */}
          <View style={st.connectWrap}>
            {/* glow halo */}
            <View style={st.connectGlow}/>
            <TouchableOpacity onPress={handleConnect} disabled={connecting} activeOpacity={0.85}>
              <View style={{borderRadius:28,overflow:'hidden',
                shadowColor:C.yellow,shadowOffset:{width:0,height:8},
                shadowOpacity:0.7,shadowRadius:20,elevation:16}}>
                <LinearGradient
                  colors={connecting?['rgba(100,100,100,0.5)','rgba(60,60,60,0.5)']:[C.yellow,C.orange,C.coral]}
                  start={{x:0,y:0}} end={{x:1,y:0}}
                  style={{paddingVertical:22,paddingHorizontal:40,alignItems:'center'}}>
                  {/* shine */}
                  <View style={{position:'absolute',top:0,left:20,right:20,height:12,
                    backgroundColor:'rgba(255,255,255,0.3)',borderRadius:28}}/>
                  {connecting?(
                    <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
                      <ActivityIndicator color="#fff" size="small"/>
                      <Text style={st.connectText}>{t('connecting')}</Text>
                    </View>
                  ):(
                    <Text style={st.connectText}>{t('connect_wallet')}</Text>
                  )}
                </LinearGradient>
              </View>
            </TouchableOpacity>
          </View>

          {/* LANGUAGE FLAGS */}
          <View style={{flexDirection:'row',gap:6,marginBottom:10,flexWrap:'wrap',justifyContent:'center'}}>
            {LANGUAGES.map(l=>{
              const active=currentLang.startsWith(l.code);
              return(
                <TouchableOpacity key={l.code} onPress={()=>switchLang(l.code)}
                  style={{paddingHorizontal:8,paddingVertical:5,borderRadius:12,
                    backgroundColor:active?'rgba(255,230,0,0.18)':'rgba(255,255,255,0.08)',
                    borderWidth:active?2:1,borderColor:active?C.yellow:'rgba(255,255,255,0.15)',
                    flexDirection:'row',alignItems:'center',gap:3}}>
                  <Text style={{fontSize:16}}>{l.flag}</Text>
                  <Text style={{color:active?C.yellow:'rgba(255,255,255,0.6)',fontSize:10,
                    fontFamily:'monospace',fontWeight:active?'900':'600'}}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legal links */}
          <View style={{flexDirection:'row',justifyContent:'center',gap:18,marginBottom:10}}>
            <TouchableOpacity onPress={()=>setShowPrivacy(true)}>
              <Text style={st.linkText}>{t('privacy_title')}</Text>
            </TouchableOpacity>
            <Text style={st.linkText}>·</Text>
            <TouchableOpacity onPress={()=>setShowTerms(true)}>
              <Text style={st.linkText}>{t('terms_title')}</Text>
            </TouchableOpacity>
          </View>

          <Text style={{color:'rgba(255,255,255,0.12)',fontFamily:'monospace',fontSize:8,textAlign:'center',marginBottom:20}}>
            {t('copyright')}
          </Text>

        </ScrollView>
      </SafeAreaView>

      {/* PRIVACY MODAL */}
      <Modal visible={showPrivacy} transparent animationType="slide">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#140828',borderTopLeftRadius:28,borderTopRightRadius:28,
            padding:24,maxHeight:'75%',borderTopWidth:3,borderColor:C.cyan}}>
            <LinearGradient colors={['rgba(0,212,255,0.12)','transparent']} style={StyleSheet.absoluteFill}/>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <Text style={{color:C.cyan,fontFamily:'monospace',fontWeight:'900',fontSize:16}}>{t('privacy_title')}</Text>
              <TouchableOpacity onPress={()=>setShowPrivacy(false)}
                style={{width:34,height:34,borderRadius:17,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'rgba(255,255,255,0.7)',fontSize:18,fontWeight:'900'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{color:'rgba(255,255,255,0.75)',fontFamily:'monospace',fontSize:12,lineHeight:20}}>
                {`SeekerCraft respects your privacy.\n\nWHAT WE COLLECT\n• Wallet address (public key only — never private keys)\n• Game scores, achievements, levels you create\n• Play counts and ratings\n\nHOW WE USE IT\nYour wallet address is used as a unique identifier for leaderboards and achievements. We never sell your data.\n\nSECURITY\nWe never request, store or access your private keys or seed phrases. All Solana transactions are signed exclusively by your wallet app.\n\nCONTACT\n@SeekerCraftApp on X (Twitter)\n\nLast updated: February 2026`}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* TERMS MODAL */}
      <Modal visible={showTerms} transparent animationType="slide">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'flex-end'}}>
          <View style={{backgroundColor:'#140828',borderTopLeftRadius:28,borderTopRightRadius:28,
            padding:24,maxHeight:'75%',borderTopWidth:3,borderColor:C.yellow}}>
            <LinearGradient colors={['rgba(255,230,0,0.10)','transparent']} style={StyleSheet.absoluteFill}/>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <Text style={{color:C.yellow,fontFamily:'monospace',fontWeight:'900',fontSize:16}}>{t('terms_title')}</Text>
              <TouchableOpacity onPress={()=>setShowTerms(false)}
                style={{width:34,height:34,borderRadius:17,backgroundColor:'rgba(255,255,255,0.12)',alignItems:'center',justifyContent:'center'}}>
                <Text style={{color:'rgba(255,255,255,0.7)',fontSize:18,fontWeight:'900'}}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={{color:'rgba(255,255,255,0.75)',fontFamily:'monospace',fontSize:12,lineHeight:20}}>
                {`By using SeekerCraft you agree to:\n\n• Be at least 13 years of age\n• Use the app lawfully\n• Not cheat, bot or exploit\n• Accept that leaderboard data is public\n• Accept that blockchain transactions are irreversible\n\nFull terms available at seekercraft.app/terms\n\nLast updated: February 2026`}
              </Text>
            </ScrollView>
            <TouchableOpacity onPress={()=>setShowTerms(false)} style={{marginTop:16,borderRadius:14,overflow:'hidden'}}>
              <LinearGradient colors={[C.yellow,C.orange]} style={{paddingVertical:14,alignItems:'center'}}>
                <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14,letterSpacing:1}}>{t('i_agree')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const st=StyleSheet.create({
  root:{flex:1},
  scroll:{alignItems:'center',paddingTop:36,paddingBottom:30,paddingHorizontal:20},

  logoWrap:{width:210,height:210,alignItems:'center',justifyContent:'center',marginBottom:10},
  logoCircle:{width:140,height:140,borderRadius:70,overflow:'hidden',
    alignItems:'center',justifyContent:'center',
    borderWidth:4,borderColor:'rgba(255,255,255,0.3)',
    shadowColor:C.orange,shadowRadius:20,shadowOpacity:0.8},

  titleShadow:{position:'absolute',color:'transparent',fontSize:32,fontWeight:'900',
    fontFamily:'monospace',letterSpacing:4,
    textShadowColor:'rgba(255,140,0,0.9)',textShadowRadius:35,textShadowOffset:{width:0,height:0}},
  title:{color:'#fff',fontSize:32,fontWeight:'900',fontFamily:'monospace',letterSpacing:4,
    textShadowColor:'rgba(255,200,0,0.7)',textShadowRadius:18,textShadowOffset:{width:2,height:3}},
  subtitlePill:{flexDirection:'row',alignItems:'center',marginTop:6,marginBottom:14,
    backgroundColor:'rgba(0,0,0,0.45)',borderRadius:30,paddingHorizontal:16,paddingVertical:8,
    borderWidth:2,borderColor:'rgba(255,255,255,0.25)'},
  subtitleText:{color:'#fff',fontSize:12,fontFamily:'monospace',fontWeight:'900',letterSpacing:2},

  featuresCard:{width:'100%',borderRadius:24,padding:18,marginBottom:16,
    borderWidth:2.5,borderColor:'rgba(153,69,255,0.40)',overflow:'hidden'},

  connectWrap:{width:'100%',marginBottom:10,position:'relative'},
  connectGlow:{position:'absolute',top:'50%',left:'25%',right:'25%',height:60,
    backgroundColor:C.yellow,borderRadius:30,opacity:0.25,
    shadowColor:C.yellow,shadowRadius:30,shadowOpacity:1},
  connectText:{color:'#000',fontSize:18,fontWeight:'900',fontFamily:'monospace',letterSpacing:2},

  linkText:{color:'rgba(255,255,255,0.35)',fontFamily:'monospace',fontSize:10},
})
