// app/test-play.tsx - PEGGLE CRAFT v5 — all physics bugs fixed
import React, { useState, useEffect, useRef } from 'react';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
try { configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false }); } catch {}
import { View, Dimensions, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue, useFrameCallback, runOnJS, useDerivedValue } from 'react-native-reanimated';
import { Canvas, Circle, RoundedRect, Image as SkiaImage, useImage, Shadow, Path as SkiaPath, Skia, Group } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import WallpaperBackground from '@/components/WallpaperBackground';
import { useTranslation } from 'react-i18next';

const { width: SW, height: SH } = Dimensions.get('window');
const COLS = 11, PAD = 20;
const CELL = Math.floor((SW - PAD * 2) / COLS);
const PLAY_TOP = 120, PLAY_BOT = SH - 90;

// Physics
const GRAVITY = 480, AIR_FRICTION = 0.002, MAX_VELOCITY = 900;
const BALL_R = CELL * 0.22, PEG_R = CELL * 0.38, BUMPER_R = CELL * 0.42, BUMPER_BIG_R = CELL * 1.0;
const RESTITUTION = 0.72, BUMPER_BOUNCE = 1.30, WALL_RESTITUTION = 0.75, SLIDE_BOUNCE = 0.05;
const BUCKET_W = 90, BUCKET_H = 32, BUCKET_SPEED = 120, MAX_SUB_STEPS = 12;
const INITIAL_SHOT_SPEED = 720, VORTEX_MS = 800, SEG_FADE_MS = 2000;

// Smart zoom
const FEVER_TOUCH_R = BALL_R + PEG_R + 6;
const FEVER_RAY_STEPS = 12, FEVER_RAY_DT = 0.06;
const FEVER_SLOWMO = 0.22;
const MIN_SPEED_FOR_ZOOM = 120;       // px/s — ball must be moving fast enough
const MIN_ZOOM_DURATION = 1.0;        // seconds — minimum zoom time once activated
const ZOOM_DEACT_COOLDOWN = 2.0;     // seconds cooldown after deactivating zoom

// Stuck guard
const STUCK_DIST = 4;           // px — min movement expected per check
const STUCK_MS   = 1500;        // check interval — fast detection for invisible-wall traps

const PEG_IMG = CELL * 1.55, BUMP_IMG = CELL * 1.7, BUMP_BIG_IMG = CELL * 2.05, CURVE_IMG = CELL * 0.9;
const VORTEX_IMG = CELL * 0.9; // vortex stays small as requested
const C = { bg1:'#0B0033', bg2:'#1A0066', gold:'#FFD700', orange:'#FF6B00', green:'#22C55E', blue:'#3B82F6', purple:'#7B2FBE', text:'#FFF', textMuted:'rgba(255,255,255,0.6)' };
const ICON_AI_IMG = require('../assets/images/Icons/AI.png');

function clampVelocity(vx: number, vy: number, maxV: number): [number, number] {
  'worklet';
  const s = Math.sqrt(vx*vx+vy*vy);
  if (s > maxV) { const k = maxV/s; return [vx*k, vy*k]; }
  return [vx, vy];
}
function applyAirFriction(vx: number, vy: number, dt: number): [number, number] {
  'worklet';
  const f = 1 - AIR_FRICTION*dt*60;
  return [vx*f, vy*f];
}
// Ray-cast: does ball trajectory pass within FEVER_TOUCH_R of (tx,ty)?
// Returns true only if the ball will actually reach the target after bouncing off pegs/walls.
// If a peg blocks the path and deflects the ball away, returns false.
function willBallHitTarget(
  bxv:number,byv:number,vx:number,vy:number,tx:number,ty:number,
  pegXs?:number[],pegYs?:number[],pegRs?:number[],pegHit?:boolean[],pegTypes?:string[],targetIdx?:number,
  wallXs?:number[],wallYs?:number[],wallWs?:number[],wallHs?:number[],
): boolean {
  'worklet';
  const speed=Math.sqrt(vx*vx+vy*vy);
  const mul=speed>MAX_VELOCITY?3:1;
  // More steps for better accuracy
  const steps=FEVER_RAY_STEPS*mul*3;
  const rdt=FEVER_RAY_DT/(mul*3);
  let cx=bxv,cy=byv,cvx=vx,cvy=vy;
  let bounceCount=0;
  for (let s=0;s<steps;s++) {
    cvy+=GRAVITY*rdt; cx+=cvx*rdt; cy+=cvy*rdt;
    // Wall bounces (side walls + ceiling)
    if (cx<PAD+BALL_R) { cx=PAD+BALL_R; cvx=Math.abs(cvx)*WALL_RESTITUTION; }
    if (cx>SW-PAD-BALL_R) { cx=SW-PAD-BALL_R; cvx=-Math.abs(cvx)*WALL_RESTITUTION; }
    if (cy<PLAY_TOP-50) { cy=PLAY_TOP-50; cvy=Math.abs(cvy)*WALL_RESTITUTION; }
    // Obstacle wall bounces
    if (wallXs && wallYs && wallWs && wallHs) {
      for (let wi=0;wi<wallXs.length;wi++) {
        const clX=Math.max(wallXs[wi],Math.min(cx,wallXs[wi]+wallWs[wi]));
        const clY=Math.max(wallYs[wi],Math.min(cy,wallYs[wi]+wallHs[wi]));
        const wdx=cx-clX,wdy=cy-clY,wdist=Math.hypot(wdx,wdy);
        if (wdist<BALL_R&&wdist>0.01) {
          const wnx=wdx/wdist,wny=wdy/wdist;
          cx=clX+wnx*(BALL_R+0.5); cy=clY+wny*(BALL_R+0.5);
          const wdot=cvx*wnx+cvy*wny;
          if (wdot<0) { cvx-=(1+WALL_RESTITUTION)*wdot*wnx; cvy-=(1+WALL_RESTITUTION)*wdot*wny; }
          bounceCount++;
        }
      }
    }
    // Check target hit
    if (Math.hypot(cx-tx,cy-ty)<FEVER_TOUCH_R) return true;
    // Simulate bounces off pegs in the way
    if (pegXs && pegYs && pegRs && pegHit && pegTypes) {
      for (let j=0;j<pegXs.length;j++) {
        if (j===targetIdx) continue;
        if (pegHit[j]) continue;
        const t=pegTypes[j];
        if (t==='bucket'||t==='curved_left'||t==='curved_right') continue;
        const pr=pegRs[j]; if(pr<=0) continue;
        const dx=cx-pegXs[j],dy=cy-pegYs[j];
        const dist=Math.sqrt(dx*dx+dy*dy);
        const touchR=BALL_R+pr;
        if (dist<touchR&&dist>0.01) {
          const nx=dx/dist,ny=dy/dist;
          const dot=cvx*nx+cvy*ny;
          if (dot<0) {
            const restitution=t==='bumper'?BUMPER_BOUNCE:RESTITUTION;
            cvx-=2*dot*nx*restitution;
            cvy-=2*dot*ny*restitution;
            cx=pegXs[j]+nx*touchR;
            cy=pegYs[j]+ny*touchR;
            bounceCount++;
          }
        }
      }
    }
    // Too many bounces = unpredictable trajectory, don't zoom
    if (bounceCount>4) return false;
    // Ball drained below play area — won't hit
    if (cy>PLAY_BOT+50) return false;
  }
  return false;
}

const MovingObstacleRenderer = ({index,movingObsSV,image}:any) => {
  const x=useDerivedValue(()=>movingObsSV.value[index]?.x??0);
  const y=useDerivedValue(()=>movingObsSV.value[index]?.y??0);
  const w=useDerivedValue(()=>movingObsSV.value[index]?.width??0);
  const h=useDerivedValue(()=>movingObsSV.value[index]?.height??0);
  if (image) return <SkiaImage image={image} x={x} y={y} width={w} height={h}/>;
  return <RoundedRect x={x} y={y} width={w} height={h} r={4} color="#64748B"/>;
};
const TrailDot = ({i,trailXs,trailYs,color}:{i:number,trailXs:any,trailYs:any,color:string}) => {
  const cx=useDerivedValue(()=>trailXs.value[i]??-200);
  const cy=useDerivedValue(()=>trailYs.value[i]??-200);
  const op=useDerivedValue(()=>trailXs.value.length>i?Math.max(0,0.35-i*0.04):0);
  return <Circle cx={cx} cy={cy} r={Math.max(1.5,BALL_R-i*0.8)} color={color} opacity={op}/>;
};
const AimDot = ({i,aimAngle,shootingSV,spacing}:any) => {
  const d=(i+1)*spacing;
  const cx=useDerivedValue(()=>SW/2+Math.cos(aimAngle.value)*d);
  const cy=useDerivedValue(()=>(PLAY_TOP-20)+Math.sin(aimAngle.value)*d);
  const op=useDerivedValue(()=>shootingSV.value?0:Math.max(0,0.85-i*0.055));
  return <Circle cx={cx} cy={cy} r={Math.max(1.5,4-i*0.25)} color={C.gold} opacity={op}/>;
};

interface Peg { x:number;y:number;type:string;hit:boolean;touched:boolean;r:number;fadeAlpha:number;touchTime:number; }
interface WallBlock { x:number;y:number;w:number;h:number; }
interface ScorePopup { x:number;y:number;text:string;color:string;alpha:number;id:number; }
interface MovingObs { x:number;y:number;width:number;height:number;vx:number;minX:number;maxX:number; }
interface LineSegment { p1x:number;p1y:number;p2x:number;p2y:number; }
interface CurvePoint { r:number;c:number; }
interface SegState { alive:boolean;opacity:number;hitTime:number|null; }
let _pid=0;

export default function TestPlayScreen() {
  const {t}=useTranslation();
  const btcImg=useImage(require('../assets/images/Peg/btc.png'));
  const teleportAImg=useImage(require('../assets/images/Peg/TeleportA.png'));
  const teleportBImg=useImage(require('../assets/images/Peg/TeleportB.png'));
  const solImg=useImage(require('../assets/images/Peg/sol.png'));
  const skrImg=useImage(require('../assets/images/Peg/skr.png'));
  const bumpImg=useImage(require('../assets/images/Peg/bump.png'));
  const bigStarImg=useImage(require('../assets/images/Peg/BigStar.png'));
  const bucketImg1=useImage(require('../assets/images/Peg/bucket.png'));
  const bucketImg2=useImage(require('../assets/images/Peg/bucket2.png'));
  const bucketImg3=useImage(require('../assets/images/Peg/bucket3.png'));
  const [bucketSkin,setBucketSkin]=useState<'bucket'|'bucket2'|'bucket3'>('bucket');
  const bucketImg=bucketSkin==='bucket2'?bucketImg2:bucketSkin==='bucket3'?bucketImg3:bucketImg1;
  const curvaImg=useImage(require('../assets/images/Peg/curva.png'));
  const movingImg=useImage(require('../assets/images/Peg/moving.png'));
  const wallsImg=useImage(require('../assets/images/Peg/walls.jpg'));
  const dingPlayer=useAudioPlayer(require('../assets/ding.mp3'));
  const dingPlayer2=useAudioPlayer(require('../assets/ding.mp3'));
  const dingPlayer3=useAudioPlayer(require('../assets/ding.mp3'));
  const dingPlayer4=useAudioPlayer(require('../assets/ding.mp3'));
  const dingPoolRef=useRef(0); // round-robin index
  const starPlayer=useAudioPlayer(require('../assets/star.mp3'));
  const zoomPlayer=useAudioPlayer(require('../assets/zoom.mp3'));
  const bgMusic2=useAudioPlayer(require('../assets/images/tools/music2.mp3'));
  const bgMusic3=useAudioPlayer(require('../assets/images/tools/music3.mp3'));
  const bgMusic4=useAudioPlayer(require('../assets/images/tools/music4.mp3'));
  const bgMusic5=useAudioPlayer(require('../assets/images/tools/music5.mp3'));
  const skrPlayer=useAudioPlayer(require('../assets/skr.mp3'));
  const vortexAudioPlayer=useAudioPlayer(require('../assets/vortex.mp3'));
  const teleportAudioPlayer=useAudioPlayer(require('../assets/teleport.mp3'));
  const bucketPlayer=useAudioPlayer(require('../assets/bucket.mp3'));

  const [loading,setLoading]=useState(true);
  const [isPlaytest,setIsPlaytest]=useState(false);
  const [pegs,setPegs]=useState<Peg[]>([]);
  const [initialPegs,setInitialPegs]=useState<Peg[]>([]);
  const [walls,setWalls]=useState<WallBlock[]>([]);
  const [balls,setBalls]=useState(10);
  const [initialBalls,setInitialBalls]=useState(10);
  const [score,setScore]=useState(0);
  const [combo,setCombo]=useState(0);
  const [popups,setPopups]=useState<ScorePopup[]>([]);
  const [victory,setVictory]=useState(false);
  const [gameOver,setGameOver]=useState(false);
  const [isCommunityGame,setIsCommunityGame]=useState(false);
  const [shooting,setShooting]=useState(false);
  const [activePower,setActivePower]=useState<string|null>(null);
  // FIX: Peggle-style bonus — earned when SOL peg hit, USED on next shot
  // pendingBonus = earned but not yet activated. activePower = currently active this shot.
  const [pendingBonus,setPendingBonus]=useState<string|null>(null);
  const [feverUI,setFeverUI]=useState(false);
  const [lastSkrHitUI,setLastSkrHitUI]=useState(false);
  const [freeBallShow,setFreeBallShow]=useState(false);
  const [movingObsCount,setMovingObsCount]=useState(0);
  const [isFireball,setIsFireball]=useState(false);
  const [segOpacities,setSegOpacities]=useState<number[]>([]);
  const [ballSkin,setBallSkin]=useState('default');
  // Ultimate ability state
  const [ultCharge, setUltCharge] = useState(0);
  const [ultReady, setUltReady] = useState(false);
  const [ultActive, setUltActive] = useState<string|null>(null); // 'blackhole'|'multiball_inf'|'laser'|null
  const [showUltPicker, setShowUltPicker] = useState(false);
  const ultChargeRef = useRef(0);
  const ultActiveRef = useRef<string|null>(null);
  const infMultiballTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  // AI mode state
  const [aiMode, setAiMode] = useState<string|null>(null); // 'easy'|'medium'|'hard'|null
  const [aiTurn, setAiTurn] = useState(false);
  const [aiScore, setAiScore] = useState(0);
  const [playerScore, setPlayerScore] = useState(0);
  const [turnLabel, setTurnLabel] = useState<string|null>(null);
  const aiModeRef = useRef<string|null>(null);
  const aiTurnRef = useRef(false);
  const aiTurnSV = useSharedValue(false);
  const aiScoreRef = useRef(0);
  const playerScoreRef = useRef(0);
  const aiLevelsPackRef = useRef<any[]>([]);
  const aiLevelIndexRef = useRef(0);
  const [aiLevelLabel, setAiLevelLabel] = useState<string|null>(null);

  const [missShow, setMissShow] = useState(false);
  const [missX, setMissX] = useState(SW/2);
  const [comboText, setComboText] = useState<string|null>(null);
  const [sparkles, setSparkles] = useState<{x:number,y:number,vx:number,vy:number,color:string,opacity:number}[]>([]);
  const [skrFlash, setSkrFlash] = useState(false);
  const [seekerDestroyedText, setSeekerDestroyedText] = useState(false);
  const [confetti, setConfetti] = useState<{x:number,y:number,vx:number,vy:number,color:string,rot:number}[]>([]);
  const mainBallDrainedSV=useSharedValue(false);
  const bx=useSharedValue(SW/2),by=useSharedValue(PLAY_TOP-20);
  const bvx=useSharedValue(0),bvy=useSharedValue(0);
  const maxVelSV=useSharedValue(MAX_VELOCITY);
  const bActive=useSharedValue(false),shootingSV=useSharedValue(false);
  const bucketX=useSharedValue(SW/2-BUCKET_W/2),bucketDir=useSharedValue(1);
  const aimAngle=useSharedValue(Math.PI/2);
  const bucketSpeedMult=useSharedValue(1),fireballMode=useSharedValue(false);
  const zoomScale=useSharedValue(1),zoomOffX=useSharedValue(0),zoomOffY=useSharedValue(0);
  const feverSV=useSharedValue(false),zoomCooldownSV=useSharedValue(0),allSkrTouchedSV=useSharedValue(false);
  const vortexActive=useSharedValue(false),vortexTimer=useSharedValue(0);
  const vortexCX=useSharedValue(0),vortexCY=useSharedValue(0);
  const vortexAngle=useSharedValue(0),vortexCooldown=useSharedValue(0);
  // Teleport state
  const teleportActive=useSharedValue(false); // true during teleport flash
  const teleportCooldown=useSharedValue(0);
  // FIX: teleport group IDs — pairIdx[i] = index of partner peg for teleport at index i
  // Built in loadLevel by matching A[0]→B[0], A[1]→B[1], etc.
  const teleportPairs=useSharedValue<{aIdx:number,bIdx:number}[]>([]);
  const [teleportFlash,setTeleportFlash]=useState(false);
  const mb1x=useSharedValue(-200),mb1y=useSharedValue(-200);
  const mb1vx=useSharedValue(0),mb1vy=useSharedValue(0),mb1Active=useSharedValue(false);
  const mb2x=useSharedValue(-200),mb2y=useSharedValue(-200);
  const mb2vx=useSharedValue(0),mb2vy=useSharedValue(0),mb2Active=useSharedValue(false);
  const mb1StillSV=useSharedValue(0),mb2StillSV=useSharedValue(0);
  const multiballPendingSV=useSharedValue(false); // true when multiball bonus activated but waiting for first peg hit
  const pX=useSharedValue<number[]>([]),pY=useSharedValue<number[]>([]);
  const pR=useSharedValue<number[]>([]),pH=useSharedValue<boolean[]>([]);
  const pT=useSharedValue<string[]>([]);
  const wX=useSharedValue<number[]>([]),wY=useSharedValue<number[]>([]);
  const wW=useSharedValue<number[]>([]),wH=useSharedValue<number[]>([]);
  const curveLines=useSharedValue<LineSegment[]>([]),curveAlive=useSharedValue<boolean[]>([]),curveScored=useSharedValue<boolean[]>([]),curveHitTime=useSharedValue<number[]>([]);
  const shakeX=useSharedValue(0),shakeY=useSharedValue(0);
  const zoomTimerSV=useSharedValue(0); // tracks how long zoom has been active
  const trailXs=useSharedValue<number[]>([]),trailYs=useSharedValue<number[]>([]);
  const movingObsSV=useSharedValue<MovingObs[]>([]);

  const ballsRef=useRef(10),scoreRef=useRef(0),comboRef=useRef(0);
  const lastDingRef=useRef(0);
  const hitThisShot=useRef(new Set<number>());
  const popupsRef=useRef<ScorePopup[]>([]);
  const activePowerRef=useRef<string|null>(null);
  const pendingBonusRef=useRef<string|null>(null);
  const pegsRef=useRef<Peg[]>([]);
  const isPlaytestRef=useRef(false),zoomMusicOn=useRef(false),musicMutedRef=useRef(false);
  const bgMusicRef=useRef<any>(null);
  const victoryRef=useRef(false),allSkrHitRef=useRef(false);
  const stuckCheckRef=useRef<ReturnType<typeof setInterval>|null>(null);
  const lastBallPosRef=useRef({x:SW/2,y:PLAY_TOP-20});
  // Replay recording
  const shotLogRef=useRef<{angle:number;bonusUsed:string|null;pegsHitCount:number;score:number}[]>([]);
  const shotStartScore=useRef(0);
  const isReplayModeRef=useRef(false);
  const [isReplayMode,setIsReplayMode]=useState(false);
  const replayQueueRef=useRef<{angle:number;bonusUsed:string|null}[]>([]);

  const allSegments=useRef<LineSegment[][]>([]);
  const flatToGroup=useRef<{curveIdx:number;segIdx:number}[]>([]);
  const segStates=useRef<SegState[]>([]);
  const rollingPeg=useSharedValue<number>(-1);
  const rollingAngle=useSharedValue(0),rollingLaps=useSharedValue(0);

  useEffect(()=>{ loadLevel(); },[]);
  // Replay auto-fire
  useEffect(()=>{
    if(loading||!isReplayModeRef.current||replayQueueRef.current.length===0) return;
    const iv=setInterval(()=>{
      if(replayQueueRef.current.length===0){clearInterval(iv);return;}
      if(bActive.value||mb1Active.value||mb2Active.value||mainBallDrainedSV.value) return;
      const next=replayQueueRef.current.shift();
      if(!next) return;
      aimAngle.value=next.angle;
      if(next.bonusUsed){pendingBonusRef.current=next.bonusUsed;setPendingBonus(next.bonusUsed);}
      shoot();
    },1200);
    return()=>clearInterval(iv);
  },[loading]);

  // FIX: force curve re-render after loading completes
  useEffect(()=>{
    if(!loading && segStates.current.length > 0){
      setSegOpacities([...segStates.current.map(s=>s.opacity)]);
    }
  },[loading]);
  // Register achievement score bonus handler
  useEffect(()=>{
    (global as any).addAchievementScore=(pts:number)=>{
      if(isPlaytestRef.current||!pts) return;
      scoreRef.current+=pts; setScore(scoreRef.current);
      addPopup(SW/2,PLAY_TOP+60,`+${pts} ACHIEVEMENT!`,C.gold);
    };
    return ()=>{ delete (global as any).addAchievementScore; };
  },[]);
  useEffect(()=>{
    const { DeviceEventEmitter } = require('react-native');
    // Pause global main.mp3 while test-play runs its own music2-5
    DeviceEventEmitter.emit('PAUSE_GLOBAL_MUSIC');
    Promise.all([AsyncStorage.getItem('global_muted'),AsyncStorage.getItem('last_track_idx')]).then(([v,lastIdx])=>{
      const isMuted = v==='1';
      musicMutedRef.current = isMuted;
      if (!isMuted) {
        const picks=[bgMusic2,bgMusic3,bgMusic4,bgMusic5];
        let idx=Math.floor(Math.random()*picks.length);
        const prev=lastIdx?parseInt(lastIdx):-1;
        if(idx===prev) idx=(idx+1)%picks.length;
        AsyncStorage.setItem('last_track_idx',String(idx)).catch(()=>{});
        const track=picks[idx];
        bgMusicRef.current=track;
        track.loop=true; track.play();
      }
    });
    const muteSub = DeviceEventEmitter.addListener('MUTE_CHANGED', ({ muted }: {muted:boolean}) => {
      musicMutedRef.current = muted;
      try { muted ? bgMusicRef.current?.pause?.() : bgMusicRef.current?.play(); } catch {}
      try { muted ? zoomPlayer.pause?.() : null; } catch {}
    });
    // FIX: editor's useFocusEffect cleanup fires RESUME_GLOBAL_MUSIC AFTER our PAUSE.
    // Counter it by immediately re-emitting PAUSE when we receive a RESUME.
    const keepPausedSub = DeviceEventEmitter.addListener('RESUME_GLOBAL_MUSIC', () => {
      DeviceEventEmitter.emit('PAUSE_GLOBAL_MUSIC');
    });
    return () => {
      muteSub.remove();
      keepPausedSub.remove();
      // Stop all music tracks to avoid double-music on next screen
      try { bgMusic2.pause?.(); } catch {}
      try { bgMusic3.pause?.(); } catch {}
      try { bgMusic4.pause?.(); } catch {}
      try { bgMusic5.pause?.(); } catch {}
      try { zoomPlayer.pause?.(); } catch {}
      bgMusicRef.current = null;
      // Do NOT emit RESUME_GLOBAL_MUSIC here — game-play's useEffect handles it
    };
  },[]);

  // FIX: stop zoom music only if all SKR not yet collected (zoom music, not victory music)
  // FIX: zoom.mp3 plays ONLY during zoom approach, stops when SKR is hit
  const startFeverMusicJS=()=>{
    if(zoomMusicOn.current||musicMutedRef.current) return;
    zoomMusicOn.current=true;
    try{bgMusicRef.current?.pause?.();}catch{}
    try{zoomPlayer.seekTo(0);zoomPlayer.loop=false;zoomPlayer.play();}catch{}
  };
  const stopFeverMusic=()=>{
    if(!zoomMusicOn.current) return;
    zoomMusicOn.current=false;
    try{zoomPlayer.pause?.();}catch{}
    if(!musicMutedRef.current){try{bgMusicRef.current?.play();}catch{}}
  };
  // Alias for worklet deactivate path
  const stopFeverMusicIfZoomOnly=()=>{ stopFeverMusic(); };
  // Keep startFeverMusic for any other callers  
  const startFeverMusic=startFeverMusicJS;
  // Zoom is now SILENT — music only plays after last SKR is collected
  // Named functions for runOnJS (inline arrows crash in worklets)
  const playVortexSound=()=>{ if(musicMutedRef.current) return; try{ vortexAudioPlayer.seekTo(0); vortexAudioPlayer.play(); }catch{} };
  // FIX: zoom music fires when ball about to hit last SKR peg (not when zooming on any peg)
  const playZoomMusic=()=>{ startFeverMusic(); };
  const playTeleportSound=()=>{ if(musicMutedRef.current) return; try{ teleportAudioPlayer.seekTo(0); teleportAudioPlayer.play(); }catch{} };

  const addPopup=(x:number,y:number,text:string,color:string)=>{
    if(isPlaytestRef.current)return;
    const id=_pid++;
    const next=[...popupsRef.current,{x,y,text,color,alpha:1,id}];
    popupsRef.current=next.slice(-4); setPopups([...popupsRef.current]);
  };

  const mergeWalls=(grid:string[][]):WallBlock[]=>{
    const rows=grid.length,cols=grid[0]?.length||0;
    const vis=Array(rows).fill(null).map(()=>Array(cols).fill(false));
    const blocks:WallBlock[]=[];
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      if(grid[r][c]!=='obstacle'||vis[r][c]) continue;
      let endC=c; while(endC+1<cols&&grid[r][endC+1]==='obstacle'&&!vis[r][endC+1]) endC++;
      let endR=r,ok=true;
      while(ok&&endR+1<rows){ for(let cc=c;cc<=endC;cc++) if(grid[endR+1][cc]!=='obstacle'||vis[endR+1][cc]){ok=false;break;} if(ok)endR++; }
      for(let rr=r;rr<=endR;rr++) for(let cc=c;cc<=endC;cc++) vis[rr][cc]=true;
      blocks.push({x:PAD+c*CELL,y:PLAY_TOP+r*CELL,w:(endC-c+1)*CELL,h:(endR-r+1)*CELL});
    }
    return blocks;
  };

  const loadLevel=async()=>{
    try {
      victoryRef.current=false; allSkrHitRef.current=false; allSkrTouchedSV.value=false;
      const savedSkin=await AsyncStorage.getItem('ball_skin_selected'); if(savedSkin) setBallSkin(savedSkin);
      const ptFlag=await AsyncStorage.getItem('is_playtest');
      const cg=await AsyncStorage.getItem('community_game');
      const isPT=(ptFlag==='1'||ptFlag==='true')&&!cg;
      setIsPlaytest(isPT); isPlaytestRef.current=isPT;
      if(isPT){ scoreRef.current=0; setScore(0); } // FIX: playtest always starts at 0
      await AsyncStorage.removeItem('is_playtest');
      setIsCommunityGame(!!cg);
      const d=await AsyncStorage.getItem('current_level_draft');
      if(!d) return router.back();
      const data=JSON.parse(d);
      if(data.bucketSkin) setBucketSkin(data.bucketSkin);
      const rawGrid:string[][]=data.grid||[];
      // Trim old 12-col levels to current COLS (11) to prevent pegs off-screen
      const grid=rawGrid.map(row=>Array.isArray(row)&&row.length>COLS?row.slice(0,COLS):row);
      const newPegs:Peg[]=[];
      const obstacles:MovingObs[]=[];
      const bigStarVisited=new Set<string>();
      // FIX: whitelist known cell types — unknown/null/undefined cells are SKIPPED
      // Without this, unknown types create invisible pegs (collision but no rendering)
      const KNOWN_CELLS = new Set(['empty','obstacle','curve_track','bucket','moving_block','bumper_big','peg_red','peg_blue','peg_gold','bumper','curved_left','curved_right','teleport_a','teleport_b']);
      grid.forEach((row,r)=>{ if(!Array.isArray(row)) return; row.forEach((cell,c)=>{
        if(!cell || typeof cell !== 'string' || !KNOWN_CELLS.has(cell)) return; // skip null/unknown
        if(cell==='empty'||cell==='obstacle'||cell==='curve_track'||cell==='bucket') return;
        const cx=PAD+c*CELL+CELL/2,cy=PLAY_TOP+r*CELL+CELL/2;
        if(cell==='moving_block') { obstacles.push({x:cx-CELL*0.45,y:cy-CELL*0.32,width:CELL*0.9,height:CELL*0.64,vx:100,minX:PAD,maxX:SW-PAD-CELL*1.4}); }
        else if(cell==='bumper_big') {
          const key=`${r},${c}`; if(bigStarVisited.has(key)) return;
          const ab=r>0&&grid[r-1]?.[c]==='bumper_big',lb=c>0&&grid[r]?.[c-1]==='bumper_big';
          if(ab||lb){bigStarVisited.add(key);return;}
          bigStarVisited.add(key); bigStarVisited.add(`${r},${c+1}`); bigStarVisited.add(`${r+1},${c}`); bigStarVisited.add(`${r+1},${c+1}`);
          newPegs.push({x:PAD+c*CELL+CELL,y:PLAY_TOP+r*CELL+CELL,type:cell,hit:false,touched:false,r:BUMPER_BIG_R,fadeAlpha:1,touchTime:0});
        } else {
          let radius=PEG_R; if(cell==='bumper') radius=BUMPER_R; if(cell==='curved_left'||cell==='curved_right') radius=CELL*0.30;
          if(cell==='teleport_a'||cell==='teleport_b') radius=CELL*0.32;
          newPegs.push({x:cx,y:cy,type:cell,hit:false,touched:false,r:radius,fadeAlpha:1,touchTime:0});
        }
      }); });

      const parsedCurves=data.curves||[];
      const rotations:number[]=data.curveRotations||parsedCurves.map(()=>0);
      allSegments.current=[]; flatToGroup.current=[];
      const segFlat:LineSegment[]=[],newSegStates:SegState[]=[];
      const applyRot=(pts:{x:number;y:number}[],deg:number)=>{
        if(deg===0||pts.length===0) return pts;
        let cx2=0,cy2=0; for(const p of pts){cx2+=p.x;cy2+=p.y;} cx2/=pts.length; cy2/=pts.length;
        const rad=(deg*Math.PI)/180,cosA=Math.cos(rad),sinA=Math.sin(rad);
        return pts.map(p=>({x:cx2+(p.x-cx2)*cosA-(p.y-cy2)*sinA,y:cy2+(p.x-cx2)*sinA+(p.y-cy2)*cosA}));
      };
      parsedCurves.forEach((pts:CurvePoint[],ci:number)=>{
        const segs:LineSegment[]=[];
        if(pts.length>1){
          const rawPts=pts.map(p=>({x:PAD+p.c*CELL+CELL/2,y:PLAY_TOP+p.r*CELL+CELL/2}));
          const allPts=applyRot(rawPts,rotations[ci]||0);
          for(let i=0;i<allPts.length-1;i++){
            const ax=allPts[i].x,ay=allPts[i].y,bx2=allPts[i+1].x,by2=allPts[i+1].y;
            const segLen=Math.hypot(bx2-ax,by2-ay),numBeads=Math.max(1,Math.round(segLen/12));
            for(let b=0;b<numBeads;b++){
              const t0=b/numBeads,t1=(b+1)/numBeads;
              segs.push({p1x:ax+(bx2-ax)*t0,p1y:ay+(by2-ay)*t0,p2x:ax+(bx2-ax)*t1,p2y:ay+(by2-ay)*t1});
              segFlat.push(segs[segs.length-1]);
              flatToGroup.current.push({curveIdx:ci,segIdx:segs.length-1});
              newSegStates.push({alive:true,opacity:1,hitTime:null});
            }
          }
        }
        allSegments.current.push(segs);
      });
      segStates.current=newSegStates;
      curveLines.value=segFlat; curveAlive.value=segFlat.map(()=>true); curveScored.value=segFlat.map(()=>false); curveHitTime.value=segFlat.map(()=>0);
      // FIX: tracks visible immediately — all opacities = 1 at start
      setSegOpacities(newSegStates.map(()=>1));

      // FIX: build teleport pair mapping A[0]↔B[0], A[1]↔B[1], etc.
      const tpAs=newPegs.map((p,i)=>p.type==='teleport_a'?i:-1).filter(i=>i>=0);
      const tpBs=newPegs.map((p,i)=>p.type==='teleport_b'?i:-1).filter(i=>i>=0);
      const pairs:{aIdx:number,bIdx:number}[]=[];
      const minPairs=Math.min(tpAs.length,tpBs.length);
      for(let pi=0;pi<minPairs;pi++) pairs.push({aIdx:tpAs[pi],bIdx:tpBs[pi]});
      teleportPairs.value=pairs;

      const wb=mergeWalls((grid||[]).filter((row:any)=>Array.isArray(row)&&row.length>0));
      setWalls(wb); wX.value=wb.map(w=>w.x); wY.value=wb.map(w=>w.y); wW.value=wb.map(w=>w.w); wH.value=wb.map(w=>w.h);
      setPegs(newPegs); pegsRef.current=newPegs; setInitialPegs(JSON.parse(JSON.stringify(newPegs)));
      movingObsSV.value=obstacles; setMovingObsCount(obstacles.length); syncPhysics(newPegs);
      const ib=data.balls||10; setInitialBalls(ib); ballsRef.current=ib; setBalls(ib);
      setScore(0); setCombo(0); scoreRef.current=0; comboRef.current=0;
      setLoading(false); hitThisShot.current.clear();
      activePowerRef.current=null; setActivePower(null);
      fireballMode.value=false; setIsFireball(false); bucketSpeedMult.value=1;
      zoomScale.value=1; zoomOffX.value=0; zoomOffY.value=0; feverSV.value=false; zoomCooldownSV.value=0; zoomTimerSV.value=0;
      // Check replay mode
      shotLogRef.current=[];
      const replayFlag=await AsyncStorage.getItem('replay_mode');
      if(replayFlag==='1'){
        const shotsJson=await AsyncStorage.getItem('replay_shots');
        const shots=JSON.parse(shotsJson||'[]');
        isReplayModeRef.current=true; setIsReplayMode(true);
        replayQueueRef.current=shots.map((s:any)=>({angle:s.angle,bonusUsed:s.bonusUsed}));
        await AsyncStorage.removeItem('replay_mode');
        await AsyncStorage.removeItem('replay_shots');
      } else { isReplayModeRef.current=false; setIsReplayMode(false); }
      setFeverUI(false); setLastSkrHitUI(false);
      vortexActive.value=false; vortexCooldown.value=0; teleportCooldown.value=0;
      mb1Active.value=false; mb2Active.value=false; mb1x.value=-200; mb1y.value=-200; mb2x.value=-200; mb2y.value=-200; multiballPendingSV.value=false;
      // AI mode detection
      const aiDiff = await AsyncStorage.getItem('ai_mode');
      if (aiDiff) {
        aiModeRef.current = aiDiff; setAiMode(aiDiff);
        aiScoreRef.current = 0; setAiScore(0);
        playerScoreRef.current = 0; setPlayerScore(0);
        aiTurnRef.current = false; aiTurnSV.value = false; setAiTurn(false);
        setTurnLabel(t('your_turn')); setTimeout(() => setTurnLabel(null), 2000);
        await AsyncStorage.removeItem('ai_mode');
        // Multi-level pack
        const packJson = await AsyncStorage.getItem('ai_levels_pack');
        const idxStr = await AsyncStorage.getItem('ai_level_index');
        if (packJson) {
          aiLevelsPackRef.current = JSON.parse(packJson);
          aiLevelIndexRef.current = parseInt(idxStr || '0', 10);
          if (aiLevelsPackRef.current.length > 1) {
            setAiLevelLabel(`LEVEL ${aiLevelIndexRef.current + 1} / ${aiLevelsPackRef.current.length}`);
            setTimeout(() => setAiLevelLabel(null), 2500);
          }
          await AsyncStorage.removeItem('ai_levels_pack');
          await AsyncStorage.removeItem('ai_level_index');
        }
      }
    } catch { router.back(); }
  };

  const syncPhysics=(list:Peg[])=>{
    pX.value=list.map(p=>p.x); pY.value=list.map(p=>p.y); pR.value=list.map(p=>p.r);
    pH.value=list.map(p=>p.hit); pT.value=list.map(p=>p.type);
  };

  const onCurveHit=(hits:number[])=>{
    let totalPts=0;
    const hitsCopy=[...hits]; // capture for timeout closure
    for(const fi of hits){
      const ss=segStates.current[fi];
      if(!ss||ss.hitTime!==null) continue; // already hit
      ss.hitTime=Date.now(); // mark hit, keep alive=true for 2s
      const seg=curveLines.value[fi];
      if(seg&&!isPlaytestRef.current){ totalPts+=5; addPopup((seg.p1x+seg.p2x)/2,(seg.p1y+seg.p2y)/2-15,'+5',C.purple); }
    }
    if(totalPts>0){ if(!isPlaytestRef.current){ scoreRef.current+=totalPts; setScore(scoreRef.current); } Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if(!musicMutedRef.current){try{dingPlayer.seekTo(0); dingPlayer.play();}catch{}} }
    // FIX: no per-frame fade (causes lag). After 2s, hide all hit segments at once.
    setTimeout(()=>{
      let changed=false;
      for(const fi of hitsCopy){
        const ss=segStates.current[fi];
        if(ss&&ss.alive){ ss.alive=false; ss.opacity=0; changed=true; }
      }
      if(changed) setSegOpacities(prev=>{
        const next=[...prev];
        for(const fi of hitsCopy) if(fi<next.length) next[fi]=0;
        return next;
      });
    }, SEG_FADE_MS);
  };

  // No per-frame interval needed — fade is handled by setTimeout in onCurveHit
  useEffect(()=>{ return ()=>{}; },[]);

  const removeAllTouchedSegs=()=>{
    let changed=false;
    for(const ss of segStates.current) if(ss.hitTime!==null&&ss.alive){ss.alive=false;ss.opacity=0;changed=true;}
    curveAlive.value=segStates.current.map(s=>s.alive);
    if(changed) setSegOpacities(segStates.current.map(s=>s.opacity));
  };

  const startStuckGuard=()=>{
    stopStuckGuard(); lastBallPosRef.current={x:bx.value,y:by.value};
    stuckCheckRef.current=setInterval(()=>{
      if(!bActive.value){stopStuckGuard();return;}
      const moved=Math.hypot(bx.value-lastBallPosRef.current.x,by.value-lastBallPosRef.current.y);
      if(moved<STUCK_DIST){ bActive.value=false; bx.value=-200; by.value=-200; finalizeShot(); stopStuckGuard(); }
      else lastBallPosRef.current={x:bx.value,y:by.value};
    },STUCK_MS);
  };
  const stopStuckGuard=()=>{ if(stuckCheckRef.current){clearInterval(stuckCheckRef.current);stuckCheckRef.current=null;} };

  const onHitJS=(idx:number)=>{
    const p=pegsRef.current[idx];
    if(!p) return;
    const isBumper=p.type==='bumper'||p.type==='bumper_big';
    const isPermanent=isBumper||p.type==='curved_left'||p.type==='curved_right'||p.type==='teleport_a'||p.type==='teleport_b';
    // Bumpers/vortex/teleports: always score, never marked touched (permanent elements)
    // Regular pegs: blocked by touched/hit (ghost = no points)
    if(!isPermanent){
      if(hitThisShot.current.has(idx)) return;
      if(p.touched||p.hit) return; // ghost peg, no points
      hitThisShot.current.add(idx);
      p.touched=true;
      p.touchTime=Date.now();
    }
    if(!isPlaytestRef.current){
      let pts=10;
      if(p.type==='peg_gold') pts=500; else if(p.type==='peg_red') pts=100;
      else if(p.type==='peg_blue') pts=25; else if(p.type==='bumper'||p.type==='bumper_big') pts=15;
      else if(p.type==='curved_left'||p.type==='curved_right') pts=5;
      comboRef.current++; const tot=pts*Math.min(comboRef.current,10);
      scoreRef.current+=tot; setScore(scoreRef.current); setCombo(comboRef.current);
      const pitch=Math.min(1.0+comboRef.current*0.08,1.72);
      // Screen shake only on bumper hits
      if(isBumper){
        const mag=p.type==='bumper_big'?3:2;
        shakeX.value=(Math.random()-0.5)*mag;
        shakeY.value=(Math.random()-0.5)*mag;
      }
      // Combo milestone text — small popup on the peg (not center overlay)
      if(comboRef.current===5) addPopup(p.x,p.y-45,'AMAZING!','#00FFFF');
      else if(comboRef.current===8) addPopup(p.x,p.y-45,'INSANE!','#FF00FF');
      else if(comboRef.current===10) addPopup(p.x,p.y-45,'GODLIKE!','#FFD700');
      else if(comboRef.current===15) addPopup(p.x,p.y-45,'COSMIC BOUNCE!','#FF4500');
      // Musical bounces: round-robin ding player pool with ascending pitch
      if(p.type==='peg_gold'){ if(!musicMutedRef.current){ try { skrPlayer.seekTo(0); skrPlayer.play(); } catch {} } }
      else { if(!musicMutedRef.current){ const now=Date.now(); if(now-lastDingRef.current>80){lastDingRef.current=now;try{const pool=[dingPlayer,dingPlayer2,dingPlayer3,dingPlayer4];const dp=pool[dingPoolRef.current%4];dingPoolRef.current++;dp.setPlaybackRate(pitch);dp.seekTo(0);dp.play();}catch{}} } }
      if(p.type==='bumper'||p.type==='bumper_big'){starPlayer.seekTo(0);starPlayer.play();}
      const col=p.type==='peg_red'?C.orange:p.type==='peg_gold'?C.gold:p.type==='peg_blue'?C.blue:C.green;
      addPopup(p.x,p.y-25,`+${tot}`,col);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Purple peg charge bar: only peg_blue (SOL) hits charge it
    if(!isPlaytestRef.current&&p.type==='peg_blue'){
      if(ultChargeRef.current<100){
        ultChargeRef.current=Math.min(100,ultChargeRef.current+20);
        setUltCharge(ultChargeRef.current);
      }
      if(ultChargeRef.current>=100&&!pendingBonusRef.current&&!activePowerRef.current){
        // Grant a random bonus when bar is full and no bonus is pending/active
        const bonuses=['multiball','slowBucket','longShot','fireball'] as const;
        const chosen=bonuses[Math.floor(Math.random()*bonuses.length)];
        triggerSOLBonus(chosen);
        ultChargeRef.current=0; setUltCharge(0);
      }
      // Also 30% chance for regular SOL bonus when bar not full
      if(ultChargeRef.current<100&&!activePowerRef.current&&!pendingBonusRef.current&&Math.random()<0.30) triggerSOLBonus();
    }
    setPegs([...pegsRef.current]);
    // Peg hit: mark touched on JS side for rendering with fade effect
    // Collision radius already zeroed in worklet — do NOT re-assign pH/pR here (invisible wall race condition)
    // Don't set hit=true immediately — let the peg fade out visually first (800ms full + 400ms fade)
    if(p.type!=='bumper'&&p.type!=='bumper_big'&&p.type!=='curved_left'&&p.type!=='curved_right'&&p.type!=='teleport_a'&&p.type!=='teleport_b'){
      if(!pegsRef.current[idx].touchTime) pegsRef.current[idx].touchTime=Date.now();
      setPegs([...pegsRef.current]);
    }
    // FIX: check if ALL SKR now touched — activate fever music (ball still drains)
    if(!allSkrHitRef.current){
      const skrRem=pegsRef.current.filter(pg=>pg.type==='peg_gold'&&!pg.hit&&!pg.touched).length;
      if(skrRem===0){
        allSkrHitRef.current=true; allSkrTouchedSV.value=true;
        setLastSkrHitUI(true); setFreeBallShow(false);
        stopFeverMusic(); // SKR hit: stop zoom.mp3, restart loop.mp3
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addPopup(SW/2,PLAY_TOP+80,'⚡ LAST SKR!',C.gold);
        // Sparkle explosion + camera flash + freeze
        shakeX.value=(Math.random()-0.5)*8; shakeY.value=(Math.random()-0.5)*8;
        setSkrFlash(true); setTimeout(()=>setSkrFlash(false),150);
        const colors=['#FFD700','#00D4FF','#FFFFFF','#FF69B4','#14F195'];
        const sparks=Array.from({length:25},()=>({
          x:p.x,y:p.y,
          vx:(Math.random()-0.5)*300,vy:(Math.random()-0.5)*300,
          color:colors[Math.floor(Math.random()*5)],opacity:1,
        }));
        setSparkles(sparks);
        const sparkleInterval=setInterval(()=>{
          setSparkles(prev=>{
            const next=prev.map(s=>({...s,x:s.x+s.vx*0.016,y:s.y+s.vy*0.016+3,opacity:s.opacity-0.02,vx:s.vx*0.97,vy:s.vy*0.97}));
            if(next.every(s=>s.opacity<=0)){clearInterval(sparkleInterval);return[];}
            return next.filter(s=>s.opacity>0);
          });
        },16);
        // "SEEKER DESTROYED!" text
        setSeekerDestroyedText(true);
        setTimeout(()=>setSeekerDestroyedText(false),2500);
        // Victory confetti — SeekerCraft original burst effect
        // Radial explosion from center + gravity + neon trails
        const confColors=['#FFD700','#FF4500','#00D4FF','#9945FF','#14F195','#FF69B4','#00FF88','#FF0080'];
        const shapes=['hex','streak','ring','spark','pixel','bolt'] as const;
        const cx=SW/2,cy=SH/3;
        const conf=Array.from({length:25},(_, idx)=>{
          const angle=Math.random()*Math.PI*2;
          const speed=120+Math.random()*280;
          const s=shapes[idx%shapes.length];
          return {
            x:cx,y:cy,
            vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-80,
            color:confColors[Math.floor(Math.random()*confColors.length)],
            rot:Math.random()*360,
            shape:s,
            size:s==='streak'?12+Math.random()*8:s==='pixel'?3+Math.random()*4:5+Math.random()*8,
            spin:(Math.random()-0.5)*18,
            wobble:Math.random()*Math.PI*2,
            opacity:1,
            trail:s==='streak'||s==='bolt',
          };
        });
        setConfetti(conf);
        const confInterval=setInterval(()=>{
          setConfetti(prev=>{
            const next=prev.map(c=>({...c,
              x:c.x+c.vx*0.016,
              y:c.y+c.vy*0.016,
              vy:c.vy+220*0.016, // gravity pull
              vx:c.vx*0.985,
              rot:c.rot+(c.spin||3),
              wobble:(c.wobble||0)+0.1,
              opacity:Math.max(0,(c.opacity||1)-0.008),
            }));
            if(next.every(c=>c.y>SH+50||(c.opacity||0)<=0)){clearInterval(confInterval);return[];}
            return next.filter(c=>(c.opacity||0)>0);
          });
        },16);
        setTimeout(()=>{clearInterval(confInterval);setConfetti([]);},4000);
      }
    }
  };

  const triggerSOLBonus=(forced?:string)=>{
    // Bonuses: multiball, slowBucket, longShot, fireball
    const choices=['multiball','slowBucket','longShot','fireball'];
    const chosen=forced||choices[Math.floor(Math.random()*choices.length)];
    if(!pendingBonusRef.current){
      pendingBonusRef.current=chosen; setPendingBonus(chosen);
      const label=chosen==='multiball'?'MULTIBALL':chosen==='slowBucket'?'SLOW BUCKET':chosen==='fireball'?'FIREBALL':'LONG SHOT';
      addPopup(SW/2,PLAY_TOP+50,`${label} READY!`,'#00FFFF');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };
  const activatePendingBonus=()=>{
    if(!pendingBonusRef.current) return;
    const chosen=pendingBonusRef.current;
    pendingBonusRef.current=null; setPendingBonus(null);
    activePowerRef.current=chosen; setActivePower(chosen);
    if(chosen==='slowBucket'){
      bucketSpeedMult.value=0.3;
    }
    // multiball + longShot velocity are applied in shoot() after this returns
  };
  // Spawn multiball — called from worklet via runOnJS when first peg hit while pending
  const spawnMultiballFromHit=()=>{
    // Fan-spread: rotate current velocity by ±30° for the two extra balls
    const vx=bvx.value, vy=bvy.value;
    const speed=Math.sqrt(vx*vx+vy*vy)||INITIAL_SHOT_SPEED;
    const angle=Math.atan2(vy,vx);
    const spread=Math.PI/6; // 30 degrees
    mb1x.value=bx.value; mb1y.value=by.value;
    mb1vx.value=Math.cos(angle+spread)*speed; mb1vy.value=Math.sin(angle+spread)*speed;
    mb1Active.value=true;
    mb2x.value=bx.value; mb2y.value=by.value;
    mb2vx.value=Math.cos(angle-spread)*speed; mb2vy.value=Math.sin(angle-spread)*speed;
    mb2Active.value=true;
    // Show "MULTIBALL!" text
    addPopup(bx.value, by.value-40, 'MULTIBALL!', '#FFD700');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const onTeleportJS=()=>{
    if(musicMutedRef.current) return;
    try{ teleportAudioPlayer.seekTo(0); teleportAudioPlayer.play(); }catch{}
    setTeleportFlash(true);
    setTimeout(()=>setTeleportFlash(false),300);
    if(!isPlaytestRef.current){
      scoreRef.current+=100; setScore(scoreRef.current);
      addPopup(bx.value,by.value,'TELEPORT!','#00E5FF');
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };
  const addBallJS=()=>{
    ballsRef.current++; setBalls(ballsRef.current);
    addPopup(bucketX.value+BUCKET_W/2,PLAY_BOT-60,'+1 BALL',C.green);
    setFreeBallShow(true); setTimeout(()=>setFreeBallShow(false),1800);
    if(!musicMutedRef.current){ try{bucketPlayer.seekTo(0);bucketPlayer.play();}catch{} }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const saveAmazingReplay=async()=>{
    if(isPlaytestRef.current||isReplayModeRef.current||shotLogRef.current.length===0) return;
    // Check if last shot was "amazing"
    const lastShot=shotLogRef.current[shotLogRef.current.length-1];
    if(!lastShot) return;
    const isAmazing=comboRef.current>=8||lastShot.pegsHitCount>=15||lastShot.score>=5000;
    if(!isAmazing) return;
    try{
      const addr=await AsyncStorage.getItem('wallet_address');
      const dname=await AsyncStorage.getItem('display_name')||addr?.slice(0,6)||'Player';
      const gameData=await AsyncStorage.getItem('community_game');
      if(!addr||!gameData) return;
      const game=JSON.parse(gameData);
      const{saveFeaturedReplay}=require('@/utils/firebase');
      saveFeaturedReplay({
        shots:shotLogRef.current,
        gameId:game.id||'',
        gameName:game.name||'Unknown',
        walletAddress:addr,
        displayName:dname,
        combo:comboRef.current,
        pegsHit:lastShot.pegsHitCount,
        shotScore:lastShot.score,
      });
    }catch{}
  };
  const saveReplayIfChallenge=async()=>{
    if(isPlaytestRef.current||isReplayModeRef.current||shotLogRef.current.length===0) return;
    try{
      const challengeId=await AsyncStorage.getItem('active_challenge_id');
      const addr=await AsyncStorage.getItem('wallet_address');
      if(challengeId&&addr){
        const{saveReplay}=require('@/utils/firebase');
        saveReplay(challengeId,addr,shotLogRef.current);
      }
    }catch{}
  };
  const logAIResult=async()=>{
    try{
      const addr=await AsyncStorage.getItem('wallet_address');
      const dname=await AsyncStorage.getItem('display_name')||addr?.slice(0,6)||'Player';
      if(!addr) return;
      const{logActivity}=require('@/utils/firebase');
      const pScore=playerScoreRef.current, aScore=aiScoreRef.current;
      const diff=(aiModeRef.current||'medium').toUpperCase();
      const won=pScore>=aScore;
      logActivity(addr,dname,won?'ai_win':'ai_loss',`${diff} · ${pScore} - ${aScore}`);
    }catch{}
  };
  const showMissAt=(x:number)=>{ setMissX(Math.max(50,Math.min(SW-50,x))); setMissShow(true); setTimeout(()=>setMissShow(false),1400); };
  const finalizeShot=()=>{
    stopStuckGuard();
    bActive.value=false; bx.value=-200; by.value=-200;
    mainBallDrainedSV.value=false;
    maxVelSV.value=MAX_VELOCITY; // reset longShot velocity cap
    setShooting(false); shootingSV.value=false;
    comboRef.current=0; setCombo(0); hitThisShot.current.clear(); rollingPeg.value=-1;
    zoomScale.value=1; zoomOffX.value=0; zoomOffY.value=0; zoomCooldownSV.value=0;
    if(feverSV.value){feverSV.value=false; setFeverUI(false);}
    fireballMode.value=false; setIsFireball(false); bucketSpeedMult.value=1;
    activePowerRef.current=null; setActivePower(null); // clear active, keep pending
    vortexActive.value=false; vortexCooldown.value=0; teleportCooldown.value=0;
    mb1Active.value=false; mb2Active.value=false; mb1x.value=-200; mb1y.value=-200; mb2x.value=-200; mb2y.value=-200; multiballPendingSV.value=false;
    mb1StillSV.value=0; mb2StillSV.value=0;
    removeAllTouchedSegs();
    // Update replay shot record
    if(shotLogRef.current.length>0){
      const last=shotLogRef.current[shotLogRef.current.length-1];
      last.pegsHitCount=hitThisShot.current.size;
      last.score=scoreRef.current-shotStartScore.current;
    }
    // Track AI vs player score
    if(aiModeRef.current){
      const shotScore = scoreRef.current - (aiTurnRef.current ? playerScoreRef.current : 0);
      if(aiTurnRef.current){
        aiScoreRef.current += (scoreRef.current - playerScoreRef.current - aiScoreRef.current);
        setAiScore(aiScoreRef.current);
      } else {
        playerScoreRef.current = scoreRef.current - aiScoreRef.current;
        setPlayerScore(playerScoreRef.current);
      }
    }
    // FIX: victory declared here — only after ball drains
    setTimeout(()=>{
      if(victoryRef.current) return;
      const skrLeft=pegsRef.current.filter(p=>p.type==='peg_gold'&&!p.hit&&!p.touched).length;
      if(skrLeft===0||allSkrHitRef.current){
        // AI multi-level: if more levels remain, advance instead of declaring victory
        if(aiModeRef.current&&aiLevelsPackRef.current.length>1&&aiLevelIndexRef.current<aiLevelsPackRef.current.length-1){
          aiLevelIndexRef.current++;
          setAiLevelLabel(`LEVEL ${aiLevelIndexRef.current+1} / ${aiLevelsPackRef.current.length}`);
          setTimeout(()=>setAiLevelLabel(null),2500);
          stopFeverMusic(); setLastSkrHitUI(false);
          // Load next level after brief pause
          setTimeout(()=>{
            loadNextAILevel();
            // Continue alternating turns
            const wasAI=aiTurnRef.current;
            aiTurnRef.current=!wasAI; aiTurnSV.value=!wasAI; setAiTurn(!wasAI);
            if(!wasAI){
              setTurnLabel(t('ai_turn')); setTimeout(()=>setTurnLabel(null),1500);
              setTimeout(()=>aiShoot(),2000);
            } else {
              setTurnLabel(t('your_turn')); setTimeout(()=>setTurnLabel(null),1500);
            }
          },1500);
          return;
        }
        victoryRef.current=true; setLastSkrHitUI(false); setVictory(true); stopFeverMusic();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        saveReplayIfChallenge(); saveAmazingReplay();
        if(aiModeRef.current) logAIResult();
      } else if(ballsRef.current<=0){
        setGameOver(true); stopFeverMusic();
        saveReplayIfChallenge(); saveAmazingReplay();
        if(aiModeRef.current) logAIResult();
      } else if(aiModeRef.current){
        // AI mode: alternate turns — clear bonuses (per-turn, not shared)
        pendingBonusRef.current=null; setPendingBonus(null);
        activePowerRef.current=null; setActivePower(null);
        ultChargeRef.current=0; setUltCharge(0);
        const wasAI = aiTurnRef.current;
        aiTurnRef.current = !wasAI; aiTurnSV.value = !wasAI;
        setAiTurn(!wasAI);
        if(!wasAI){
          // Switch to AI turn
          setTurnLabel(t('ai_turn'));
          setTimeout(()=>setTurnLabel(null),1500);
          // AI shoots after delay
          setTimeout(()=>aiShoot(),2000);
        } else {
          // Switch to player turn
          setTurnLabel(t('your_turn'));
          setTimeout(()=>setTurnLabel(null),1500);
        }
      }
    },350);
  };

  const shoot=(isAI?:boolean)=>{
    const skrLeft=pegsRef.current.filter(p=>p.type==='peg_gold'&&!p.hit&&!p.touched).length;
    if(bActive.value||mb1Active.value||mb2Active.value||mainBallDrainedSV.value||ballsRef.current<=0||victoryRef.current||gameOver||skrLeft===0) return;
    // Block manual shooting during AI turn (but allow AI itself to shoot)
    if(aiModeRef.current&&aiTurnRef.current&&!isAI) return;
    setShooting(true); shootingSV.value=true;
    ballsRef.current--; setBalls(ballsRef.current);
    bx.value=SW/2; by.value=PLAY_TOP-20;
    // Record shot for replay
    shotStartScore.current=scoreRef.current;
    // Activate pending bonus BEFORE setting velocity so longShot can be detected
    activatePendingBonus();
    shotLogRef.current.push({angle:aimAngle.value,bonusUsed:activePowerRef.current,pegsHitCount:0,score:0});
    // Set velocity — if longShot, use 2.5x speed directly (no race condition with frame callback)
    const isLong=activePowerRef.current==='longShot';
    const shotSpeed=isLong?INITIAL_SHOT_SPEED*2.5:INITIAL_SHOT_SPEED;
    if(isLong) maxVelSV.value=MAX_VELOCITY*3;
    bvx.value=Math.cos(aimAngle.value)*shotSpeed;
    bvy.value=Math.sin(aimAngle.value)*shotSpeed;
    // Multiball: don't spawn yet — wait for first peg hit (prevents corner sticking)
    if(activePowerRef.current==='multiball') multiballPendingSV.value=true;
    // Activate ball AFTER velocity is fully set — prevents frame callback processing partial state
    bActive.value=true; mainBallDrainedSV.value=false; rollingPeg.value=-1; rollingAngle.value=0; rollingLaps.value=0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startStuckGuard();
  };

  // ── AI NEXT LEVEL (multi-level pack) ──────────────────────────────────
  const loadNextAILevel = () => {
    const pack = aiLevelsPackRef.current;
    const idx = aiLevelIndexRef.current;
    if (idx >= pack.length) return; // safety
    const data = pack[idx];
    // Reset game state but keep scores
    victoryRef.current = false; allSkrHitRef.current = false; allSkrTouchedSV.value = false;
    setVictory(false); setGameOver(false); setLastSkrHitUI(false);
    setShooting(false); shootingSV.value = false;
    bActive.value = false; bx.value = SW/2; by.value = PLAY_TOP-20;
    hitThisShot.current.clear(); comboRef.current = 0; setCombo(0);
    fireballMode.value = false; setIsFireball(false); bucketSpeedMult.value = 1;
    activePowerRef.current = null; setActivePower(null);
    pendingBonusRef.current = null; setPendingBonus(null);
    zoomScale.value = 1; zoomOffX.value = 0; zoomOffY.value = 0; zoomCooldownSV.value = 0;
    feverSV.value = false; setFeverUI(false);
    vortexActive.value = false; vortexCooldown.value = 0; teleportCooldown.value = 0;
    mb1Active.value = false; mb2Active.value = false; mb1x.value = -200; mb1y.value = -200; mb2x.value = -200; mb2y.value = -200; multiballPendingSV.value = false;
    mb1StillSV.value = 0; mb2StillSV.value = 0;
    // Rebuild pegs from level data
    const rawGrid: string[][] = data.grid || [];
    const grid = rawGrid.map((row: any) => Array.isArray(row) && row.length > COLS ? row.slice(0, COLS) : row);
    const KNOWN_CELLS = new Set(['empty','obstacle','curve_track','bucket','moving_block','bumper_big','peg_red','peg_blue','peg_gold','bumper','curved_left','curved_right','teleport_a','teleport_b']);
    const newPegs: Peg[] = [];
    const obstacles: MovingObs[] = [];
    const bigStarVisited = new Set<string>();
    grid.forEach((row: any, r: number) => { if (!Array.isArray(row)) return; row.forEach((cell: string, c: number) => {
      if (!cell || typeof cell !== 'string' || !KNOWN_CELLS.has(cell)) return;
      if (cell === 'empty' || cell === 'obstacle' || cell === 'curve_track' || cell === 'bucket') return;
      const cx2 = PAD + c * CELL + CELL / 2, cy2 = PLAY_TOP + r * CELL + CELL / 2;
      if (cell === 'moving_block') { obstacles.push({ x: cx2 - CELL * 0.45, y: cy2 - CELL * 0.32, width: CELL * 0.9, height: CELL * 0.64, vx: 100, minX: PAD, maxX: SW - PAD - CELL * 1.4 }); }
      else if (cell === 'bumper_big') {
        const key = `${r},${c}`; if (bigStarVisited.has(key)) return;
        const ab = r > 0 && grid[r - 1]?.[c] === 'bumper_big', lb = c > 0 && grid[r]?.[c - 1] === 'bumper_big';
        if (ab || lb) { bigStarVisited.add(key); return; }
        bigStarVisited.add(key); bigStarVisited.add(`${r},${c + 1}`); bigStarVisited.add(`${r + 1},${c}`); bigStarVisited.add(`${r + 1},${c + 1}`);
        newPegs.push({ x: PAD + c * CELL + CELL, y: PLAY_TOP + r * CELL + CELL, type: cell, hit: false, touched: false, r: BUMPER_BIG_R, fadeAlpha: 1, touchTime: 0 });
      } else {
        let radius = PEG_R; if (cell === 'bumper') radius = BUMPER_R; if (cell === 'curved_left' || cell === 'curved_right') radius = CELL * 0.30;
        if (cell === 'teleport_a' || cell === 'teleport_b') radius = CELL * 0.32;
        newPegs.push({ x: cx2, y: cy2, type: cell, hit: false, touched: false, r: radius, fadeAlpha: 1, touchTime: 0 });
      }
    }); });
    // Curves
    const parsedCurves = data.curves || [];
    const rotations: number[] = data.curveRotations || parsedCurves.map(() => 0);
    allSegments.current = []; flatToGroup.current = [];
    const segFlat: LineSegment[] = [], newSegStates: SegState[] = [];
    const applyRot2 = (pts: { x: number; y: number }[], deg: number) => {
      if (deg === 0 || pts.length === 0) return pts;
      let cx3 = 0, cy3 = 0; for (const p of pts) { cx3 += p.x; cy3 += p.y; } cx3 /= pts.length; cy3 /= pts.length;
      const rad = (deg * Math.PI) / 180, cosA = Math.cos(rad), sinA = Math.sin(rad);
      return pts.map(p => ({ x: cx3 + (p.x - cx3) * cosA - (p.y - cy3) * sinA, y: cy3 + (p.x - cx3) * sinA + (p.y - cy3) * cosA }));
    };
    parsedCurves.forEach((pts: CurvePoint[], ci: number) => {
      const segs: LineSegment[] = [];
      if (pts.length > 1) {
        const rawPts = pts.map((p: CurvePoint) => ({ x: PAD + p.c * CELL + CELL / 2, y: PLAY_TOP + p.r * CELL + CELL / 2 }));
        const allPts = applyRot2(rawPts, rotations[ci] || 0);
        for (let i = 0; i < allPts.length - 1; i++) {
          const ax = allPts[i].x, ay = allPts[i].y, bx2 = allPts[i + 1].x, by2 = allPts[i + 1].y;
          const segLen = Math.hypot(bx2 - ax, by2 - ay), numBeads = Math.max(1, Math.round(segLen / 12));
          for (let b = 0; b < numBeads; b++) {
            const t0 = b / numBeads, t1 = (b + 1) / numBeads;
            segs.push({ p1x: ax + (bx2 - ax) * t0, p1y: ay + (by2 - ay) * t0, p2x: ax + (bx2 - ax) * t1, p2y: ay + (by2 - ay) * t1 });
            segFlat.push(segs[segs.length - 1]);
            flatToGroup.current.push({ curveIdx: ci, segIdx: segs.length - 1 });
            newSegStates.push({ alive: true, opacity: 1, hitTime: null });
          }
        }
      }
      allSegments.current.push(segs);
    });
    segStates.current = newSegStates;
    curveLines.value = segFlat; curveAlive.value = segFlat.map(() => true); curveScored.value = segFlat.map(() => false); curveHitTime.value = segFlat.map(() => 0);
    setSegOpacities(newSegStates.map(() => 1));
    // Teleport pairs
    const tpAs = newPegs.map((p, i) => p.type === 'teleport_a' ? i : -1).filter(i => i >= 0);
    const tpBs = newPegs.map((p, i) => p.type === 'teleport_b' ? i : -1).filter(i => i >= 0);
    const pairs: { aIdx: number, bIdx: number }[] = [];
    for (let pi = 0; pi < Math.min(tpAs.length, tpBs.length); pi++) pairs.push({ aIdx: tpAs[pi], bIdx: tpBs[pi] });
    teleportPairs.value = pairs;
    // Walls + obstacles
    const wb = mergeWalls((grid || []).filter((row: any) => Array.isArray(row) && row.length > 0));
    setWalls(wb); wX.value = wb.map(w => w.x); wY.value = wb.map(w => w.y); wW.value = wb.map(w => w.w); wH.value = wb.map(w => w.h);
    setPegs(newPegs); pegsRef.current = newPegs; setInitialPegs(JSON.parse(JSON.stringify(newPegs)));
    movingObsSV.value = obstacles; setMovingObsCount(obstacles.length); syncPhysics(newPegs);
    // Reset balls for this level
    const ib = data.balls || 10; ballsRef.current = ib; setBalls(ib);
    stopStuckGuard();
  };

  // ── AI SHOOTING ────────────────────────────────────────────────────────
  const aiShoot=()=>{
    if(victoryRef.current||gameOver||ballsRef.current<=0) return;
    const diff=aiModeRef.current||'medium';
    let angle=Math.PI/2; // default straight down
    const pegsArr=pegsRef.current.filter(p=>!p.hit&&!p.touched&&p.type!=='bumper'&&p.type!=='bumper_big');
    if(diff==='easy'){
      // Aim roughly toward a random unhit gold peg, with noise; fallback to random
      const goldPegs=pegsArr.filter(p=>p.type==='peg_gold');
      if(goldPegs.length>0){
        const target=goldPegs[Math.floor(Math.random()*goldPegs.length)];
        const dx=target.x-SW/2,dy=target.y-(PLAY_TOP-20);
        angle=Math.atan2(dy,dx)+(Math.random()-0.5)*0.8;
        angle=Math.max(0.3,Math.min(2.8,angle));
      } else {
        angle=0.3+Math.random()*2.5;
      }
    } else if(diff==='medium'){
      // Find densest cluster of unhit pegs, gold pegs count 5x
      if(pegsArr.length>0){
        let bestAngle=Math.PI/2;
        let bestCount=0;
        for(let a=0.3;a<=2.8;a+=0.1){
          const tx=SW/2+Math.cos(a)*300,ty=PLAY_TOP-20+Math.sin(a)*300;
          let count=0;
          for(const p of pegsArr){
            if(Math.hypot(p.x-tx,p.y-ty)<CELL*4) count+=(p.type==='peg_gold'?5:1);
          }
          if(count>bestCount){bestCount=count;bestAngle=a;}
        }
        angle=bestAngle+(Math.random()-0.5)*0.15;
      }
    } else {
      // Hard: ray-cast many angles with fine granularity, pick best weighted score
      if(pegsArr.length>0){
        let bestAngle=Math.PI/2,bestHits=0;
        for(let a=0.2;a<=2.9;a+=0.03){
          const vx=Math.cos(a)*INITIAL_SHOT_SPEED,vy=Math.sin(a)*INITIAL_SHOT_SPEED;
          let cx=SW/2,cy=PLAY_TOP-20,cvx=vx,cvy=vy,hits=0;
          const hitSet=new Set<number>();
          for(let s=0;s<120;s++){
            cvy+=GRAVITY*0.016; cx+=cvx*0.016; cy+=cvy*0.016;
            if(cx<PAD+BALL_R){cx=PAD+BALL_R;cvx=Math.abs(cvx)*WALL_RESTITUTION;}
            if(cx>SW-PAD-BALL_R){cx=SW-PAD-BALL_R;cvx=-Math.abs(cvx)*WALL_RESTITUTION;}
            for(let j=0;j<pegsArr.length;j++){
              if(hitSet.has(j)) continue;
              const dist=Math.hypot(cx-pegsArr[j].x,cy-pegsArr[j].y);
              if(dist<BALL_R+pegsArr[j].r){
                hitSet.add(j);
                const weight=pegsArr[j].type==='peg_gold'?10:1;
                hits+=weight;
                // Simulate bounce
                const nx=(cx-pegsArr[j].x)/dist,ny=(cy-pegsArr[j].y)/dist;
                const dot=cvx*nx+cvy*ny;
                if(dot<0){cvx-=2*dot*nx*RESTITUTION;cvy-=2*dot*ny*RESTITUTION;}
              }
            }
            if(cy>PLAY_BOT) break;
          }
          if(hits>bestHits){bestHits=hits;bestAngle=a;}
        }
        angle=bestAngle;
      }
    }
    // Animate aim cursor to target angle
    const startAngle=0.3+Math.random()*2.5;
    const duration=1500;
    const startTime=Date.now();
    const animateAim=()=>{
      const elapsed=Date.now()-startTime;
      const t=Math.min(elapsed/duration,1);
      const eased=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; // ease in-out
      const wobble=t<0.8?(Math.sin(elapsed*0.01)*0.05*(1-t)):0;
      aimAngle.value=startAngle+(angle-startAngle)*eased+wobble;
      if(t<1) requestAnimationFrame(animateAim);
      else { aimAngle.value=angle; setTimeout(()=>shoot(true),200); }
    };
    requestAnimationFrame(animateAim);
  };

  const restartLevel=()=>{
    victoryRef.current=false; allSkrHitRef.current=false; allSkrTouchedSV.value=false;
    if(ballsRef.current<=0){Alert.alert(t('no_balls_left'));return;}
    ballsRef.current--; setBalls(ballsRef.current);
    const reset=JSON.parse(JSON.stringify(initialPegs));
    pegsRef.current=reset; setPegs(reset); syncPhysics(reset);
    setScore(0);setCombo(0);scoreRef.current=0;comboRef.current=0;
    setVictory(false);setGameOver(false);setLastSkrHitUI(false);
    setShooting(false);shootingSV.value=false;
    bActive.value=false;bx.value=SW/2;by.value=PLAY_TOP-20;
    hitThisShot.current.clear();
    fireballMode.value=false;setIsFireball(false);bucketSpeedMult.value=1;
    activePowerRef.current=null;setActivePower(null);
    zoomScale.value=1;zoomOffX.value=0;zoomOffY.value=0;zoomCooldownSV.value=0;
    feverSV.value=false;setFeverUI(false);stopFeverMusic();
    vortexActive.value=false;vortexCooldown.value=0;
    mb1Active.value=false;mb2Active.value=false;mb1x.value=-200;mb1y.value=-200;mb2x.value=-200;mb2y.value=-200;multiballPendingSV.value=false;
    mb1StillSV.value=0;mb2StillSV.value=0;
    for(const ss of segStates.current){ss.alive=true;ss.opacity=1;ss.hitTime=null;}
    curveAlive.value=segStates.current.map(s=>s.alive);
    setSegOpacities(segStates.current.map(()=>1));
    stopStuckGuard();
  };

  useFrameCallback((info)=>{
    'worklet';
    const rawDt=Math.min((info.timeSincePreviousFrame||16)/1000,0.025);
    if(zoomCooldownSV.value>0) zoomCooldownSV.value-=rawDt;

    // ── SMART ZOOM v7 — precise trigger ─────────────────────────────────────
    let feverNow=false;
    if(bActive.value&&zoomCooldownSV.value<=0&&!allSkrTouchedSV.value){
      const ballSpeed=Math.hypot(bvx.value,bvy.value);
      if(ballSpeed>MIN_SPEED_FOR_ZOOM){
        let skrLeft=0,lastIdx=-1;
        for(let i=0;i<pX.value.length;i++){
          if(pT.value[i]==='peg_gold'&&!pH.value[i]){skrLeft++;lastIdx=i;}
        }
        if(skrLeft===1&&lastIdx>=0){
          const tx=pX.value[lastIdx],ty=pY.value[lastIdx];
          const dist=Math.hypot(bx.value-tx,by.value-ty);
          // Check approach direction: ball must be heading TOWARD the target
          const adx=bx.value-tx,ady=by.value-ty;
          const approach=-(bvx.value*adx+bvy.value*ady)/(dist||1);
          // Only zoom if ray-cast predicts a hit AND ball is approaching
          let shouldZoom=false;
          // Skip zoom if ball is heading toward a teleport peg between it and the target
          let teleportBlocking=false;
          if(approach>30){
            for(let ti=0;ti<pX.value.length;ti++){
              if(pH.value[ti]) continue;
              const tt=pT.value[ti];
              if(tt!=='teleport_a'&&tt!=='teleport_b') continue;
              const tpDist=Math.hypot(bx.value-pX.value[ti],by.value-pY.value[ti]);
              if(tpDist<dist){ // teleport is closer than target
                const tpAdx=bx.value-pX.value[ti],tpAdy=by.value-pY.value[ti];
                const tpApproach=-(bvx.value*tpAdx+bvy.value*tpAdy)/(tpDist||1);
                if(tpApproach>approach){teleportBlocking=true;break;}
              }
            }
          }
          if(approach>30&&!teleportBlocking){
            shouldZoom=willBallHitTarget(bx.value,by.value,bvx.value,bvy.value,tx,ty,pX.value,pY.value,pR.value,pH.value,pT.value,lastIdx,wX.value,wY.value,wW.value,wH.value);
          }
          // Sustain: keep zoom if already active and approaching
          if(!shouldZoom&&feverSV.value){
            if(dist<CELL*6&&approach>30) shouldZoom=true;
            // Minimum duration
            if(zoomTimerSV.value<MIN_ZOOM_DURATION) shouldZoom=true;
          }
          if(shouldZoom){
            feverNow=true;
            zoomTimerSV.value+=rawDt;
            const tgtS=1.7,tgtOX=SW/2-bx.value,tgtOY=SH/2-by.value;
            zoomScale.value+=(tgtS-zoomScale.value)*0.05;
            zoomOffX.value+=(tgtOX-zoomOffX.value)*0.05;
            zoomOffY.value+=(tgtOY-zoomOffY.value)*0.05;
            if(!feverSV.value){
              feverSV.value=true;runOnJS(setFeverUI)(true);
              runOnJS(startFeverMusicJS)();
              zoomTimerSV.value=0;
            }
          }
        }
      }
    }
    if(!feverNow){
      zoomScale.value+=(1-zoomScale.value)*0.1;
      zoomOffX.value+=(0-zoomOffX.value)*0.1;
      zoomOffY.value+=(0-zoomOffY.value)*0.1;
      if(feverSV.value){
        feverSV.value=false;runOnJS(setFeverUI)(false);zoomCooldownSV.value=ZOOM_DEACT_COOLDOWN;
        zoomTimerSV.value=0;
        runOnJS(stopFeverMusicIfZoomOnly)();
      }
    }
    const slowMoFactor=feverNow?FEVER_SLOWMO:1;
    const dt=rawDt*slowMoFactor;

    // Screen shake decay
    shakeX.value*=0.85; shakeY.value*=0.85;
    if(Math.abs(shakeX.value)<0.1){shakeX.value=0;shakeY.value=0;}

    // Bucket
    bucketX.value+=bucketDir.value*BUCKET_SPEED*bucketSpeedMult.value*dt;
    if(bucketX.value<=PAD||bucketX.value>=SW-PAD-BUCKET_W) bucketDir.value*=-1;
    bucketX.value=Math.max(PAD,Math.min(SW-PAD-BUCKET_W,bucketX.value));

    // Moving obstacles
    if(movingObsSV.value.length>0){
      const newObs:MovingObs[]=new Array(movingObsSV.value.length);
      for(let mi=0;mi<movingObsSV.value.length;mi++){
        const o=movingObsSV.value[mi];let nx=o.x+o.vx*dt,nvx=o.vx;
        if(nx>=o.maxX){nx=o.maxX;nvx=-Math.abs(nvx);}
        if(nx<=o.minX){nx=o.minX;nvx=Math.abs(nvx);}
        newObs[mi]={...o,x:nx,vx:nvx};
      }
      movingObsSV.value=newObs;
    }
    if(vortexCooldown.value>0) vortexCooldown.value-=rawDt*1000;
    if(teleportCooldown.value>0) teleportCooldown.value-=rawDt*1000;

    // Main ball physics — wrapped so multiball always runs even if main ball drained
    if(bActive.value){
    // Vortex
    if(vortexActive.value){
      vortexTimer.value+=rawDt*1000; vortexAngle.value+=0.2;
      const spiralR=Math.max(4,18-(vortexTimer.value/VORTEX_MS)*14);
      bx.value=vortexCX.value+Math.cos(vortexAngle.value)*spiralR;
      by.value=vortexCY.value+Math.sin(vortexAngle.value)*spiralR;
      bvx.value=0; bvy.value=0;
      if(vortexTimer.value>=VORTEX_MS){
        vortexActive.value=false; vortexCooldown.value=500;
        // FIX: random ejection direction — avoid straight-down (>60° below horizontal)
        let ejectAngle=Math.random()*Math.PI*2;
        // Keep angle in upper/side region (not straight down)
        if(Math.sin(ejectAngle)>0.87) ejectAngle=Math.random()>0.5?-Math.PI*0.4:Math.PI*1.4;
        const ejectSpeed=560+Math.random()*200;
        bvx.value=Math.cos(ejectAngle)*ejectSpeed;
        bvy.value=Math.sin(ejectAngle)*ejectSpeed;
        by.value=vortexCY.value-20;
      }
    } else {

    const sDt=dt/MAX_SUB_STEPS; const hitSegs:number[]=[];
    for(let step=0;step<MAX_SUB_STEPS;step++){
      bvy.value+=GRAVITY*sDt;
      const[afvx,afvy]=applyAirFriction(bvx.value,bvy.value,sDt); bvx.value=afvx;bvy.value=afvy;
      const[cvx,cvy]=clampVelocity(bvx.value,bvy.value,maxVelSV.value); bvx.value=cvx;bvy.value=cvy;
      bx.value+=bvx.value*sDt; by.value+=bvy.value*sDt;
      if(bx.value<PAD+BALL_R){bx.value=PAD+BALL_R;bvx.value=Math.abs(bvx.value)*WALL_RESTITUTION;}
      if(bx.value>SW-PAD-BALL_R){bx.value=SW-PAD-BALL_R;bvx.value=-Math.abs(bvx.value)*WALL_RESTITUTION;}
      if(by.value<PLAY_TOP-50){by.value=PLAY_TOP-50;bvy.value=Math.abs(bvy.value)*WALL_RESTITUTION;}
      for(let wi=0;wi<wX.value.length;wi++){
        const wx=wX.value[wi],wy=wY.value[wi],ww=wW.value[wi],wh=wH.value[wi];
        const clX=Math.max(wx,Math.min(bx.value,wx+ww));
        const clY=Math.max(wy,Math.min(by.value,wy+wh));
        const cdx=bx.value-clX,cdy=by.value-clY,cdist=Math.hypot(cdx,cdy);
        if(cdist<BALL_R){
          if(cdist>0.01){
            const cnx=cdx/cdist,cny=cdy/cdist;
            bx.value=clX+cnx*(BALL_R+0.5);by.value=clY+cny*(BALL_R+0.5);
            const cdot=bvx.value*cnx+bvy.value*cny;
            if(cdot<0){bvx.value-=(1+WALL_RESTITUTION)*cdot*cnx;bvy.value-=(1+WALL_RESTITUTION)*cdot*cny;}
          } else {
            const oL=bx.value-wx,oR=(wx+ww)-bx.value,oT=by.value-wy,oB=(wy+wh)-by.value;
            const mn=Math.min(oL,oR,oT,oB);
            if(mn===oL){bx.value=wx-BALL_R-0.5;bvx.value=-Math.abs(bvx.value)*WALL_RESTITUTION;}
            else if(mn===oR){bx.value=wx+ww+BALL_R+0.5;bvx.value=Math.abs(bvx.value)*WALL_RESTITUTION;}
            else if(mn===oT){by.value=wy-BALL_R-0.5;bvy.value=-Math.abs(bvy.value)*WALL_RESTITUTION;}
            else{by.value=wy+wh+BALL_R+0.5;bvy.value=Math.abs(bvy.value)*WALL_RESTITUTION;}
          }
        }
      }
      // Curve segments — ball bounces off for 1s after hit, then segment dies
      // curveScored tracks whether points were already awarded (no re-scoring)
      // curveHitTime tracks when first hit (0 = not hit yet). After 1000ms → curveAlive=false
      const hitLocal:number[]=[];
      const nowMs=Date.now();
      // Kill segments that exceeded 1s since hit
      for(let ci=0;ci<curveHitTime.value.length;ci++){
        if(curveAlive.value[ci]&&curveHitTime.value[ci]>0&&(nowMs-curveHitTime.value[ci])>1000){
          const na=[...curveAlive.value]; na[ci]=false; curveAlive.value=na;
        }
      }
      for(let ci=0;ci<curveLines.value.length;ci++){
        if(!curveAlive.value[ci]) continue;
        const ln=curveLines.value[ci];
        const dx3=ln.p2x-ln.p1x,dy3=ln.p2y-ln.p1y;
        const len2=dx3*dx3+dy3*dy3; if(len2===0) continue;
        let t=((bx.value-ln.p1x)*dx3+(by.value-ln.p1y)*dy3)/len2;
        t=Math.max(0,Math.min(1,t));
        const cx3=ln.p1x+t*dx3,cy3=ln.p1y+t*dy3;
        const distX3=bx.value-cx3,distY3=by.value-cy3,dist3=Math.hypot(distX3,distY3);
        if(dist3<BALL_R&&dist3>0.01){
          const nx3=distX3/dist3,ny3=distY3/dist3;
          bx.value=cx3+nx3*(BALL_R+0.1); by.value=cy3+ny3*(BALL_R+0.1);
          const dot=bvx.value*nx3+bvy.value*ny3;
          if(dot<0){bvx.value-=dot*nx3;bvy.value-=dot*ny3;}
          // First hit: mark scored + record hit time; subsequent hits just bounce (no score)
          if(!curveScored.value[ci]){
            const ns=[...curveScored.value]; ns[ci]=true; curveScored.value=ns;
            const nt=[...curveHitTime.value]; nt[ci]=nowMs; curveHitTime.value=nt;
            hitLocal.push(ci);
          }
        }
      }
      if(hitLocal.length>0) hitSegs.push(...hitLocal);
      for(let i=0;i<pX.value.length;i++){
        // Skip pegs whose collision radius has been removed (faded out after 1s)
        if(pR.value[i]<=0&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'&&pT.value[i]!=='curved_left'&&pT.value[i]!=='curved_right'&&pT.value[i]!=='teleport_a'&&pT.value[i]!=='teleport_b') continue;
        const dx4=bx.value-pX.value[i],dy4=by.value-pY.value[i],dist4=Math.hypot(dx4,dy4),minD=BALL_R+pR.value[i];
        if(dist4<minD&&dist4>0.01){
          const nx4=dx4/dist4,ny4=dy4/dist4;
          // Already-hit peg: skip (pR is zeroed immediately, but double-check)
          if(pH.value[i]&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'&&pT.value[i]!=='curved_left'&&pT.value[i]!=='curved_right'&&pT.value[i]!=='teleport_a'&&pT.value[i]!=='teleport_b') continue;
          if(pT.value[i]==='curved_left'||pT.value[i]==='curved_right'){
            if(!vortexActive.value&&vortexCooldown.value<=0){
              vortexActive.value=true;vortexTimer.value=0;vortexCX.value=pX.value[i];vortexCY.value=pY.value[i];
              vortexAngle.value=Math.atan2(dy4,dx4);bvx.value=0;bvy.value=0;
              runOnJS(playVortexSound)();
            }
            runOnJS(onHitJS)(i);
          } else if((pT.value[i]==='teleport_a'||pT.value[i]==='teleport_b')&&teleportCooldown.value<=0){
            // FIX: use teleportPairs to find the correct partner (A[N]↔B[N])
            const pairs=teleportPairs.value;
            let destIdx=-1;
            for(let pi=0;pi<pairs.length;pi++){
              if(pT.value[i]==='teleport_a'&&pairs[pi].aIdx===i){destIdx=pairs[pi].bIdx;break;}
              if(pT.value[i]==='teleport_b'&&pairs[pi].bIdx===i){destIdx=pairs[pi].aIdx;break;}
            }
            if(destIdx>=0&&pX.value[destIdx]>0){
              const destX=pX.value[destIdx],destY=pY.value[destIdx];
              bx.value=destX; by.value=destY+CELL*0.7;
              // FIX: random spread so ball doesn't always go straight down
              const spread=(Math.random()-0.5)*600;
              bvx.value=spread; bvy.value=120+Math.random()*80;
              teleportCooldown.value=150;
              runOnJS(onTeleportJS)();
            }
            runOnJS(onHitJS)(i);
          } else if(fireballMode.value&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'){
            // Fireball: mark hit + zero collision immediately
            const nh2=[...pH.value]; nh2[i]=true; pH.value=nh2;
            const nr2=[...pR.value]; nr2[i]=0; pR.value=nr2;
            runOnJS(onHitJS)(i);
            if(multiballPendingSV.value){multiballPendingSV.value=false;runOnJS(spawnMultiballFromHit)();}
          } else if((pT.value[i]==='teleport_a'||pT.value[i]==='teleport_b')&&teleportCooldown.value>0){
            // FIX: teleport on cooldown — still push ball out to prevent overlap/stall
            bx.value=pX.value[i]+nx4*(minD+1); by.value=pY.value[i]+ny4*(minD+1);
            const tdot=bvx.value*nx4+bvy.value*ny4;
            if(tdot<0){bvx.value-=tdot*nx4;bvy.value-=tdot*ny4;} // slide, don't bounce
          } else if((pT.value[i]==='curved_left'||pT.value[i]==='curved_right')&&(vortexActive.value||vortexCooldown.value>0)){
            // Vortex peg on cooldown — push out + slide, don't bounce (prevents invisible wall effect)
            bx.value=pX.value[i]+nx4*(minD+1); by.value=pY.value[i]+ny4*(minD+1);
            const vdot=bvx.value*nx4+bvy.value*ny4;
            if(vdot<0){bvx.value-=vdot*nx4;bvy.value-=vdot*ny4;}
          } else if(pT.value[i]!=='teleport_a'&&pT.value[i]!=='teleport_b'&&pT.value[i]!=='curved_left'&&pT.value[i]!=='curved_right'){
            const dot=bvx.value*nx4+bvy.value*ny4;
            // FIX: check push-out FIRST, then decide bounce vs slide
            const newBx=pX.value[i]+nx4*(minD+1),newBy=pY.value[i]+ny4*(minD+1);
            let blocked=false;
            for(let wc=0;wc<wX.value.length;wc++){
              const clXc=Math.max(wX.value[wc],Math.min(newBx,wX.value[wc]+wW.value[wc]));
              const clYc=Math.max(wY.value[wc],Math.min(newBy,wY.value[wc]+wH.value[wc]));
              if(Math.hypot(newBx-clXc,newBy-clYc)<BALL_R){blocked=true;break;}
            }
            if(!blocked){
              // Normal bounce + push-out
              if(dot<0){
                const mult=(pT.value[i]==='bumper'||pT.value[i]==='bumper_big')?BUMPER_BOUNCE:RESTITUTION;
                bvx.value=(bvx.value-2*dot*nx4)*mult; bvy.value=(bvy.value-2*dot*ny4)*mult;
                const[cv2x,cv2y]=clampVelocity(bvx.value,bvy.value,maxVelSV.value); bvx.value=cv2x;bvy.value=cv2y;
              }
              bx.value=newBx;by.value=newBy;
            } else {
              // FIX: push-out blocked by wall — SLIDE instead of bounce (prevents invisible wall oscillation)
              // Remove velocity toward peg (normal component) but keep tangential velocity
              if(dot<0){
                bvx.value-=dot*nx4; bvy.value-=dot*ny4;
              }
              // Small nudge away from peg center (won't enter wall since it's tiny)
              bx.value+=nx4*1.0; by.value+=ny4*1.0;
            }
            // Mark peg as hit in worklet + zero collision radius immediately (no invisible wall)
            if(pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'){
              const nh=[...pH.value]; nh[i]=true; pH.value=nh;
              const nr=[...pR.value]; nr[i]=0; pR.value=nr;
            }
            runOnJS(onHitJS)(i);
            // Multiball: spawn on first peg hit (fan-spread from current velocity)
            if(multiballPendingSV.value){
              multiballPendingSV.value=false;
              runOnJS(spawnMultiballFromHit)();
            }
          }
        }
      }
      // Second wall pass — resolves ball pushed into wall by peg bounce
      if(bx.value<PAD+BALL_R){bx.value=PAD+BALL_R;bvx.value=Math.abs(bvx.value)*WALL_RESTITUTION;}
      if(bx.value>SW-PAD-BALL_R){bx.value=SW-PAD-BALL_R;bvx.value=-Math.abs(bvx.value)*WALL_RESTITUTION;}
      if(by.value<PLAY_TOP-50){by.value=PLAY_TOP-50;bvy.value=Math.abs(bvy.value)*WALL_RESTITUTION;}
      for(let wi2=0;wi2<wX.value.length;wi2++){
        const wx2=wX.value[wi2],wy2=wY.value[wi2],ww2=wW.value[wi2],wh2=wH.value[wi2];
        const clX2=Math.max(wx2,Math.min(bx.value,wx2+ww2));
        const clY2=Math.max(wy2,Math.min(by.value,wy2+wh2));
        const cdx2=bx.value-clX2,cdy2=by.value-clY2,cdist2=Math.hypot(cdx2,cdy2);
        if(cdist2<BALL_R){
          if(cdist2>0.01){
            const cnx2=cdx2/cdist2,cny2=cdy2/cdist2;
            bx.value=clX2+cnx2*(BALL_R+0.5);by.value=clY2+cny2*(BALL_R+0.5);
            const cdot2=bvx.value*cnx2+bvy.value*cny2;
            if(cdot2<0){bvx.value-=(1+WALL_RESTITUTION)*cdot2*cnx2;bvy.value-=(1+WALL_RESTITUTION)*cdot2*cny2;}
          } else {
            const oL2=bx.value-wx2,oR2=(wx2+ww2)-bx.value,oT2=by.value-wy2,oB2=(wy2+wh2)-by.value;
            const mn2=Math.min(oL2,oR2,oT2,oB2);
            if(mn2===oL2){bx.value=wx2-BALL_R-0.5;bvx.value=-Math.abs(bvx.value)*WALL_RESTITUTION;}
            else if(mn2===oR2){bx.value=wx2+ww2+BALL_R+0.5;bvx.value=Math.abs(bvx.value)*WALL_RESTITUTION;}
            else if(mn2===oT2){by.value=wy2-BALL_R-0.5;bvy.value=-Math.abs(bvy.value)*WALL_RESTITUTION;}
            else{by.value=wy2+wh2+BALL_R+0.5;bvy.value=Math.abs(bvy.value)*WALL_RESTITUTION;}
          }
        }
      }
      for(let mi=0;mi<movingObsSV.value.length;mi++){
        const o=movingObsSV.value[mi];
        const mclX=Math.max(o.x,Math.min(bx.value,o.x+o.width));
        const mclY=Math.max(o.y,Math.min(by.value,o.y+o.height));
        const mcdx=bx.value-mclX,mcdy=by.value-mclY,mcdist=Math.hypot(mcdx,mcdy);
        if(mcdist<BALL_R){
          if(mcdist>0.01){
            const mnx=mcdx/mcdist,mny=mcdy/mcdist;
            bx.value=mclX+mnx*(BALL_R+1);by.value=mclY+mny*(BALL_R+1);
            const mdot=bvx.value*mnx+bvy.value*mny;
            if(mdot<0){bvx.value-=(1+WALL_RESTITUTION)*mdot*mnx;bvy.value-=(1+WALL_RESTITUTION)*mdot*mny;}
          } else {
            const moL=bx.value-o.x,moR=(o.x+o.width)-bx.value,moT=by.value-o.y,moB=(o.y+o.height)-by.value;
            const mm=Math.min(moL,moR,moT,moB);
            if(mm===moL){bx.value=o.x-BALL_R-1;bvx.value=-Math.abs(bvx.value)*WALL_RESTITUTION;}
            else if(mm===moR){bx.value=o.x+o.width+BALL_R+1;bvx.value=Math.abs(bvx.value)*WALL_RESTITUTION;}
            else if(mm===moT){by.value=o.y-BALL_R-1;bvy.value=-Math.abs(bvy.value)*WALL_RESTITUTION;}
            else{by.value=o.y+o.height+BALL_R+1;bvy.value=Math.abs(bvy.value)*WALL_RESTITUTION;}
          }
        }
      }
      if(by.value>PLAY_BOT-BUCKET_H&&by.value<PLAY_BOT+20&&bvy.value>0&&bx.value>bucketX.value&&bx.value<bucketX.value+BUCKET_W){
        bActive.value=false;bx.value=-200;by.value=-200;runOnJS(addBallJS)();
        mainBallDrainedSV.value=true;
        if(!mb1Active.value&&!mb2Active.value){mainBallDrainedSV.value=false;runOnJS(finalizeShot)();}
        break;
      }
      if(by.value>SH+80){
        const mx=bx.value;
        bActive.value=false;bx.value=-200;by.value=-200;runOnJS(showMissAt)(mx);
        mainBallDrainedSV.value=true;
        if(!mb1Active.value&&!mb2Active.value){mainBallDrainedSV.value=false;runOnJS(finalizeShot)();}
        break;
      }
    }
    if(hitSegs.length>0) runOnJS(onCurveHit)(hitSegs);
    } // end else (not vortex)
    // Trail: record position for visual trail
    const newTx=[bx.value,...trailXs.value.slice(0,7)];
    const newTy=[by.value,...trailYs.value.slice(0,7)];
    trailXs.value=newTx; trailYs.value=newTy;
    } else { // ball not active — clear trail
      if(trailXs.value.length>0){trailXs.value=[];trailYs.value=[];}
    } // end if(bActive.value) — main ball physics
    const mbBalls=[{x:mb1x,y:mb1y,vx:mb1vx,vy:mb1vy,active:mb1Active,still:mb1StillSV},{x:mb2x,y:mb2y,vx:mb2vx,vy:mb2vy,active:mb2Active,still:mb2StillSV}];
    for(const mb of mbBalls){
      if(!mb.active.value) continue;
      const msDt=dt/4;
      for(let mStep=0;mStep<4;mStep++){
        mb.vy.value+=GRAVITY*msDt;
        const[afvx,afvy]=applyAirFriction(mb.vx.value,mb.vy.value,msDt);mb.vx.value=afvx;mb.vy.value=afvy;
        const[cvx,cvy]=clampVelocity(mb.vx.value,mb.vy.value,MAX_VELOCITY);mb.vx.value=cvx;mb.vy.value=cvy;
        mb.x.value+=mb.vx.value*msDt;mb.y.value+=mb.vy.value*msDt;
        if(mb.x.value<PAD+BALL_R){mb.x.value=PAD+BALL_R;mb.vx.value=Math.abs(mb.vx.value)*WALL_RESTITUTION;}
        if(mb.x.value>SW-PAD-BALL_R){mb.x.value=SW-PAD-BALL_R;mb.vx.value=-Math.abs(mb.vx.value)*WALL_RESTITUTION;}
        // FIX: harder ceiling + kill if going too far up
        if(mb.y.value<PLAY_TOP){
          mb.y.value=PLAY_TOP+5;
          mb.vy.value=Math.abs(mb.vy.value)*0.8+80;
          mb.vx.value=mb.vx.value*0.9; // dampen horizontal on ceiling hit
        }
        // Kill if stuck near top (no momentum)
        if(mb.y.value<PLAY_TOP+20&&Math.abs(mb.vx.value)<30&&mb.vy.value<50){
          mb.vx.value=0;mb.vy.value=0;mb.active.value=false;mb.x.value=-200;mb.y.value=-200;
          if(mainBallDrainedSV.value&&!mb1Active.value&&!mb2Active.value){
            mainBallDrainedSV.value=false;runOnJS(finalizeShot)();
          }
          break;
        }
        for(let i=0;i<pX.value.length;i++){
          // Skip pegs with zero radius (faded out)
          if(pR.value[i]<=0&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'&&pT.value[i]!=='curved_left'&&pT.value[i]!=='curved_right') continue;
          const dx4=mb.x.value-pX.value[i],dy4=mb.y.value-pY.value[i],dist4=Math.hypot(dx4,dy4),minD=BALL_R+pR.value[i];
          if(dist4<minD&&dist4>0.01){
            const nx4=dx4/dist4,ny4=dy4/dist4,dot2=mb.vx.value*nx4+mb.vy.value*ny4;
            if(dot2<0){
              const mult2=(pT.value[i]==='bumper'||pT.value[i]==='bumper_big')?BUMPER_BOUNCE:RESTITUTION;
              mb.vx.value=(mb.vx.value-2*dot2*nx4)*mult2;mb.vy.value=(mb.vy.value-2*dot2*ny4)*mult2;
            }
            mb.x.value=pX.value[i]+nx4*(minD+1);mb.y.value=pY.value[i]+ny4*(minD+1);
            // Already-hit peg: skip (pR zeroed immediately)
            if(pH.value[i]&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big') continue;
            // Mark hit in worklet + zero collision immediately
            if(pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'){
              const nh=[...pH.value]; nh[i]=true; pH.value=nh;
              const nr=[...pR.value]; nr[i]=0; pR.value=nr;
            }
            runOnJS(onHitJS)(i);
          }
        }
        if(mb.y.value>SH+80){
          mb.vx.value=0;mb.vy.value=0;mb.active.value=false;mb.x.value=-200;mb.y.value=-200;
          if(mainBallDrainedSV.value&&!mb1Active.value&&!mb2Active.value){
            mainBallDrainedSV.value=false;runOnJS(finalizeShot)();
          }
          break; // stop substep loop — no more physics after drain
        }
      }
      // Stuck detection: if multiball barely moving for ~1.5s, force drain it
      if(mb.active.value){
        const spd=Math.hypot(mb.vx.value,mb.vy.value);
        if(spd<15){mb.still.value++;}else{mb.still.value=0;}
        if(mb.still.value>90){
          mb.active.value=false;mb.x.value=-200;mb.y.value=-200;mb.still.value=0;
          if(mainBallDrainedSV.value&&!mb1Active.value&&!mb2Active.value){
            mainBallDrainedSV.value=false;runOnJS(finalizeShot)();
          }
        }
      }
    }
  });

  useEffect(()=>{
    const iv=setInterval(()=>{
      if(popupsRef.current.length>0){
        const u=popupsRef.current.map(p=>({...p,alpha:p.alpha-0.045,y:p.y-0.8})).filter(p=>p.alpha>0.02);
        popupsRef.current=u; setPopups([...u]);
      }
      // Drive peg fade animation for touched pegs (Peggle 2 style)
      const now=Date.now();
      let needsPegUpdate=false;
      for(const p of pegsRef.current){
        if(p.touched&&!p.hit&&p.touchTime>0){
          const elapsed=now-p.touchTime;
          if(elapsed>1000) needsPegUpdate=true; // start fade after 1s
          if(elapsed>1400) p.hit=true; // mark fully gone after 1s + 400ms fade
        }
      }
      if(needsPegUpdate) setPegs([...pegsRef.current]);
      // Drive curve hit glow fade
      let needsCurveUpdate=false;
      for(const ss of segStates.current){
        if(ss.hitTime!==null&&ss.alive) needsCurveUpdate=true;
      }
      if(needsCurveUpdate) setSegOpacities(prev=>[...prev]);
    },50);
    return ()=>clearInterval(iv);
  },[]);

  const zoomTransform=useDerivedValue<any>(()=>[
    {translateX:SW/2+zoomOffX.value+shakeX.value},{translateY:SH/2+zoomOffY.value+shakeY.value},
    {scale:zoomScale.value},{translateX:-SW/2},{translateY:-SH/2},
  ]);
  const gesture=Gesture.Pan()
    .onUpdate((e)=>{'worklet';if(bActive.value||isReplayModeRef.current||aiTurnSV.value)return;const dx=e.x-SW/2,dy=e.y-(PLAY_TOP-20);let a=Math.atan2(dy,dx);a=Math.max(0.15,Math.min(Math.PI-0.15,a));aimAngle.value=a;})
    .onEnd(()=>{'worklet';if(isReplayModeRef.current||aiTurnSV.value)return;runOnJS(shoot)();});

  if(loading) return <View style={st.center}><ActivityIndicator color={C.gold} size="large"/></View>;
  const skrLeft=pegs.filter(p=>p.type==='peg_gold'&&!p.hit).length;
  const fmtScore=(n:number)=>n>=10000?`${Math.floor(n/1000)}K`:String(n);

  return (
    <GestureHandlerRootView style={{flex:1,backgroundColor:C.bg1}}>
    <WallpaperBackground/>
    <View style={st.hud}>
      <TouchableOpacity onPress={()=>router.back()} style={st.exitBtn}><Text style={st.exitText}>{t('exit')}</Text></TouchableOpacity>
      <View style={st.stats}><Text style={st.scoreText}>{isPlaytest?'—':fmtScore(score)}</Text><Text style={st.label}>{isPlaytest?t('test'):t('score')}</Text></View>
      <View style={st.stats}><Text style={[st.ballText,balls<=2&&{color:'#EF4444'}]}>{balls}</Text><Text style={st.label}>{t('balls')}</Text></View>
      <View style={st.stats}><Text style={[st.pegCountText,skrLeft===0&&{color:C.green}]}>{skrLeft}</Text><Text style={st.label}>{t('skr_left')}</Text></View>
      <TouchableOpacity onPress={restartLevel} style={st.restartBtn}><Text style={st.restartText}>{t('rst')}</Text></TouchableOpacity>
    </View>
    {!isPlaytest&&combo>1&&<View style={st.comboBox} pointerEvents="none"><Text style={[st.comboText,combo>=5&&{color:'#FF4500',fontSize:28}]}>COMBO x{combo}</Text></View>}
    {comboText&&<View style={{position:'absolute',top:SH/2-80,width:'100%',alignItems:'center',zIndex:18}} pointerEvents="none">
      <Text style={{color:'#FFD700',fontSize:36,fontWeight:'900',fontFamily:'monospace',letterSpacing:4,textShadowColor:'rgba(255,69,0,0.9)',textShadowRadius:20,textShadowOffset:{width:0,height:2}}}>{comboText}</Text>
    </View>}
    {activePower&&<View style={st.powerBox} pointerEvents="none">
      <Text style={st.powerText}>
        {activePower==='multiball'?t('multiball_active'):activePower==='slowBucket'?t('slow_bucket_active'):activePower==='longShot'?t('long_shot_active'):''}
      </Text>
    </View>}
    {pendingBonus&&!activePower&&<View style={st.powerBox} pointerEvents="none">
      <Text style={[st.powerText,{color:'#FFD700'}]}>
        {pendingBonus==='multiball'?t('multiball_ready'):pendingBonus==='slowBucket'?t('slow_bucket_ready'):pendingBonus==='longShot'?t('long_shot_ready'):''}
      </Text>
    </View>}
    {/* Zoom is silent - no text indicator needed */}
    {freeBallShow&&<View style={st.freeBallBox} pointerEvents="none"><Text style={st.freeBallText}>{t('free_ball')}</Text></View>}
    {missShow&&<View style={[st.missBox,{left:missX-45}]} pointerEvents="none"><Text style={st.missText}>{t('miss')}</Text></View>}
    {skrFlash&&<View style={{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(255,255,255,0.3)',zIndex:25}} pointerEvents="none"/>}
    {seekerDestroyedText&&<View style={{position:'absolute',top:SH/3-20,width:'100%',alignItems:'center',zIndex:22}} pointerEvents="none">
      <Text style={{color:'#FFD700',fontSize:28,fontWeight:'900',fontFamily:'monospace',textShadowColor:'rgba(255,215,0,0.9)',textShadowRadius:25,letterSpacing:4}}>{t('seeker_destroyed')}</Text>
    </View>}
    {confetti.length>0&&<View style={{...StyleSheet.absoluteFillObject,zIndex:21}} pointerEvents="none">
      {confetti.map((c:any,i:number)=>{
        const s=c.size||8;
        const shp=c.shape||'hex';
        const op=c.opacity??1;
        const base={position:'absolute' as const,left:c.x,top:c.y,backgroundColor:c.color,opacity:op,
          transform:[{rotate:`${c.rot}deg`}],shadowColor:c.color,shadowRadius:6,shadowOpacity:0.8};
        if(shp==='hex') return <View key={`cf${i}`} style={{...base,width:s,height:s*0.85,borderRadius:s*0.15,borderWidth:1.5,borderColor:'rgba(255,255,255,0.4)'}}/>;
        if(shp==='streak') return <View key={`cf${i}`} style={{...base,width:2.5,height:s*2,borderRadius:1.5,shadowRadius:10}}/>;
        if(shp==='ring') return <View key={`cf${i}`} style={{...base,width:s,height:s,borderRadius:s/2,backgroundColor:'transparent',borderWidth:2,borderColor:c.color}}/>;
        if(shp==='spark') return <View key={`cf${i}`} style={{...base,width:3,height:3,borderRadius:1.5,shadowRadius:12,shadowOpacity:1}}/>;
        if(shp==='pixel') return <View key={`cf${i}`} style={{...base,width:s,height:s,borderRadius:0}}/>;
        if(shp==='bolt') return <View key={`cf${i}`} style={{...base,width:2,height:s*1.5,borderRadius:1,transform:[{rotate:`${c.rot}deg`},{skewX:'15deg'}]}}/>;
        return <View key={`cf${i}`} style={{...base,width:s*0.6,height:s,borderRadius:2}}/>;
      })}
    </View>}
    {turnLabel&&<View style={{position:'absolute',top:0,bottom:0,left:0,right:0,justifyContent:'center',alignItems:'center',zIndex:20}} pointerEvents="none">
      <View style={{backgroundColor:'rgba(0,0,0,0.75)',borderRadius:16,paddingHorizontal:28,paddingVertical:14,borderWidth:2,borderColor:aiTurn?'#FF4500':'#00D4FF'}}>
        <Text style={{color:aiTurn?'#FF4500':'#00D4FF',fontSize:24,fontWeight:'900',fontFamily:'monospace',letterSpacing:3}}>{turnLabel}</Text>
      </View>
    </View>}
    {aiLevelLabel&&<View style={{position:'absolute',top:SH/3+40,width:'100%',alignItems:'center',zIndex:21}} pointerEvents="none">
      <View style={{backgroundColor:'rgba(0,0,0,0.7)',borderRadius:12,paddingHorizontal:20,paddingVertical:10,borderWidth:1,borderColor:'#FFD700'}}>
        <Text style={{color:'#FFD700',fontSize:16,fontWeight:'900',fontFamily:'monospace',letterSpacing:2}}>{aiLevelLabel}</Text>
      </View>
    </View>}
    {aiMode&&<>
      <View style={{position:'absolute',top:118,left:10,zIndex:10}} pointerEvents="none">
        <View style={{backgroundColor:'rgba(0,212,255,0.15)',borderRadius:8,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:'rgba(0,212,255,0.3)'}}>
          <Text style={{color:'rgba(255,255,255,0.5)',fontSize:8,fontFamily:'monospace'}}>YOU</Text>
          <Text style={{color:'#00D4FF',fontSize:14,fontWeight:'900',fontFamily:'monospace'}}>{fmtScore(playerScore)}</Text>
        </View>
      </View>
      <View style={{position:'absolute',top:118,right:10,zIndex:10}} pointerEvents="none">
        <View style={{backgroundColor:'rgba(255,69,0,0.15)',borderRadius:8,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:'rgba(255,69,0,0.3)'}}>
          <Text style={{color:'rgba(255,255,255,0.5)',fontSize:8,fontFamily:'monospace',textAlign:'right'}}>AI</Text>
          <Text style={{color:'#FF4500',fontSize:14,fontWeight:'900',fontFamily:'monospace'}}>{fmtScore(aiScore)}</Text>
        </View>
      </View>
      {aiTurn&&<View style={{position:'absolute',top:PLAY_TOP-45,left:SW/2-20,zIndex:15}} pointerEvents="none">
        <Image source={ICON_AI_IMG} style={{width:40,height:40,opacity:0.9}}/>
      </View>}
    </>}
    {/* Ultimate charge bar */}
    {!isPlaytest&&ultCharge>0&&<View style={{position:'absolute',top:106,left:16,right:16,zIndex:10}} pointerEvents="none">
      <View style={{height:5,backgroundColor:'rgba(255,255,255,0.08)',borderRadius:3,overflow:'hidden'}}>
        <View style={{height:5,borderRadius:3,backgroundColor:'#9945FF',width:`${ultCharge}%`}}/>
      </View>
    </View>}
    {isPlaytest&&<View style={st.playtestBadge} pointerEvents="none"><Text style={st.playtestText}>PLAYTEST MODE</Text></View>}
    {isReplayMode&&<View style={[st.playtestBadge,{backgroundColor:'rgba(153,69,255,0.2)',borderColor:'rgba(153,69,255,0.5)'}]} pointerEvents="none"><Text style={[st.playtestText,{color:'#9945FF'}]}>REPLAY</Text></View>}
    {lastSkrHitUI&&(
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.25)'}}/>
      </View>
    )}
    {/* Teleport flash */}
    {teleportFlash&&(
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,229,255,0.35)'}}/>
      </View>
    )}
    <GestureDetector gesture={gesture}>
    <View style={{flex:1}}>
    <Canvas style={{flex:1}}>
    <Group transform={zoomTransform}>
    {(()=>{const isLong=pendingBonus==='longShot';const sp=isLong?20:13;const cnt=isLong?12:6;
    return Array.from({length:cnt}).map((_,i)=><AimDot key={`ad${i}_${cnt}`} i={i} aimAngle={aimAngle} shootingSV={shootingSV} spacing={sp}/>);})()}
    {!shooting&&<Circle cx={SW/2} cy={PLAY_TOP-20} r={7} color={C.gold} opacity={0.2}/>}
    {walls.map((wall,i)=>{
      if(wallsImg){
        const tx=Math.ceil(wall.w/CELL),ty=Math.ceil(wall.h/CELL);const tiles:React.ReactNode[]=[];
        for(let yr=0;yr<ty;yr++) for(let xr=0;xr<tx;xr++) tiles.push(<SkiaImage key={`w${i}_${xr}_${yr}`} image={wallsImg} x={wall.x+xr*CELL} y={wall.y+yr*CELL} width={Math.min(CELL,wall.w-xr*CELL)} height={Math.min(CELL,wall.h-yr*CELL)}/>);
        return <React.Fragment key={`wg${i}`}>{tiles}</React.Fragment>;
      }
      return <RoundedRect key={`w${i}`} x={wall.x} y={wall.y} width={wall.w} height={wall.h} r={3} color="#334155"/>;
    })}
    {/* Neon color-cycling curve tracks */}
    {segOpacities.length > 0 && (() => {
      const alivePath = Skia.Path.Make();
      const hitPath = Skia.Path.Make();
      let hasAlive = false, hasHit = false;
      const segs = curveLines.value;
      const now = Date.now();
      // Neon color cycle: purple→cyan→pink→purple (period ~4s)
      const hueT = (now % 4000) / 4000;
      const neonR = Math.round(155 + 100 * Math.sin(hueT * Math.PI * 2));
      const neonG = Math.round(48 + 160 * Math.sin(hueT * Math.PI * 2 + 2.09));
      const neonB = Math.round(200 + 55 * Math.sin(hueT * Math.PI * 2 + 4.19));
      const neonColor = `rgb(${neonR},${neonG},${neonB})`;
      for (let i = 0; i < segOpacities.length; i++) {
        if (segOpacities[i] <= 0) continue;
        const ss = segStates.current[i]; if (!ss || !ss.alive) continue;
        const seg = segs[i]; if (!seg) continue;
        if (ss.hitTime !== null && (now - ss.hitTime) < SEG_FADE_MS) {
          hitPath.moveTo(seg.p1x, seg.p1y);
          hitPath.lineTo(seg.p2x, seg.p2y);
          hasHit = true;
        } else {
          alivePath.moveTo(seg.p1x, seg.p1y);
          alivePath.lineTo(seg.p2x, seg.p2y);
          hasAlive = true;
        }
      }
      return (<>
        {hasAlive && <SkiaPath path={alivePath} color={neonColor} style="stroke" strokeWidth={14}
          strokeJoin="round" strokeCap="round"/>}
        {hasHit && <SkiaPath path={hitPath} color="#FFFFFF" style="stroke" strokeWidth={16}
          strokeJoin="round" strokeCap="round" opacity={0.8}/>}
      </>);
    })()}
    {pegs.map((p,i)=>{
      if(p.hit&&p.type!=='bumper'&&p.type!=='bumper_big'&&p.type!=='curved_left'&&p.type!=='curved_right'&&p.type!=='teleport_a'&&p.type!=='teleport_b') return null;
      let img:any=null,imgSize=PEG_IMG;
      if(p.type==='peg_red'){img=btcImg;imgSize=PEG_IMG;}
      else if(p.type==='peg_blue'){img=solImg;imgSize=PEG_IMG;}
      else if(p.type==='peg_gold'){img=skrImg;imgSize=PEG_IMG;}
      else if(p.type==='bumper'){img=bumpImg;imgSize=BUMP_IMG;}
      else if(p.type==='bumper_big'){img=bigStarImg??bumpImg;imgSize=BUMP_BIG_IMG;}
      else if(p.type==='curved_left'||p.type==='curved_right'){img=curvaImg;imgSize=VORTEX_IMG;}
      // Teleports: use TeleportA.png / TeleportB.png with glow
      else if(p.type==='teleport_a'||p.type==='teleport_b'){
        const pc=p.type==='teleport_a'?'#00E5FF':'#FF6B00';
        const tImg=p.type==='teleport_a'?teleportAImg:teleportBImg;
        const imgS=CELL*1.15;
        return (<React.Fragment key={`p${i}`}>
          <Circle cx={p.x} cy={p.y} r={p.r+5} color={pc} opacity={0.12}/>
          <Circle cx={p.x} cy={p.y} r={p.r+2} color="transparent">
            <Shadow dx={0} dy={0} blur={18} color={pc}/>
          </Circle>
          {tImg&&<SkiaImage image={tImg} x={p.x-imgS/2} y={p.y-imgS/2} width={imgS} height={imgS}/>}
        </React.Fragment>);
      }
      if(!img) return null;
      // Peggle 2 style: peg stays at full opacity 1s when touched, fades 400ms then disappears
      let op=1;
      if(p.touched&&p.touchTime>0){
        const elapsed=Date.now()-p.touchTime;
        if(elapsed>1000) op=Math.max(0,1-(elapsed-1000)/400); // fade from 1000ms to 1400ms
        // glow effect while still visible
      }
      const strokeC=p.type==='peg_red'?C.orange:p.type==='peg_gold'?C.gold:p.type==='peg_blue'?C.blue:C.green;
      const glowOp=p.touched?0.85:0.55; // brighter glow on touched pegs
      return (<React.Fragment key={`p${i}`}>
        <Circle cx={p.x} cy={p.y} r={p.r+2.5} color={strokeC} opacity={op*glowOp}/>
        {p.touched&&op>0.5&&<Circle cx={p.x} cy={p.y} r={p.r+6} color={strokeC} opacity={0.2}/>}
        <SkiaImage image={img} x={p.x-imgSize/2} y={p.y-imgSize/2} width={imgSize} height={imgSize} opacity={op}/>
      </React.Fragment>);
    })}
    {Array.from({length:movingObsCount}).map((_,i)=><MovingObstacleRenderer key={`mo${i}`} index={i} movingObsSV={movingObsSV} image={movingImg}/>)}
    {/* Trail dots */}
    {Array.from({length:8}).map((_,i)=><TrailDot key={`tr${i}`} i={i} trailXs={trailXs} trailYs={trailYs}
      color={ballSkin==='gold'?'#FFD700':ballSkin==='crystal'?'#90D5FF':ballSkin==='neon_blue'?'#00D4FF':ballSkin==='fire'?'#FF6B00':ballSkin==='rainbow'?'#FF69B4':'rgba(255,255,255,0.6)'}/>)}
    {/* Ball with skin */}
    {(()=>{
      const skinColors:{[k:string]:{ball:string,shadow:string,blur:number}}={
        default:{ball:'white',shadow:'#00FFFF',blur:12},
        gold:{ball:'#FFD700',shadow:'#FFD700',blur:16},
        crystal:{ball:'rgba(190,240,255,0.95)',shadow:'#4FC3F7',blur:18},
        neon_blue:{ball:'#00D4FF',shadow:'#00D4FF',blur:28},
        fire:{ball:'#FF4500',shadow:'#FF4500',blur:20},
        rainbow:{ball:'#FF69B4',shadow:'#FF69B4',blur:16},
      };
      const s=isFireball?skinColors.fire:(skinColors[ballSkin]||skinColors.default);
      const finalShadow=lastSkrHitUI?C.gold:s.shadow;
      const finalBlur=lastSkrHitUI?30:s.blur;
      return(<Circle cx={bx} cy={by} r={BALL_R} color={s.ball}>
        <Shadow dx={0} dy={0} blur={finalBlur} color={finalShadow}/>
        <Shadow dx={0} dy={0} blur={4} color="white"/>
      </Circle>);
    })()}
    <Circle cx={mb1x} cy={mb1y} r={BALL_R} color="#FFD700"><Shadow dx={0} dy={0} blur={12} color="#FFD700"/></Circle>
    <Circle cx={mb2x} cy={mb2y} r={BALL_R} color="#FF6B00"><Shadow dx={0} dy={0} blur={12} color="#FF6B00"/></Circle>
    {bucketImg&&<SkiaImage image={bucketImg} x={bucketX} y={PLAY_BOT-BUCKET_H} width={BUCKET_W} height={BUCKET_H}/>}
    {sparkles.map((s,i)=><Circle key={`sp${i}`} cx={s.x} cy={s.y} r={3} color={s.color} opacity={s.opacity}/>)}
    </Group></Canvas>
    {popups.map(p=><Text key={`pop${p.id}`} style={[st.popup,{left:p.x-35,top:p.y,color:p.color,opacity:p.alpha}]}>{p.text}</Text>)}
    </View></GestureDetector>
    {(victory||gameOver)&&(
      <View style={st.overlay}>
        <LinearGradient colors={victory?['rgba(255,215,0,0.15)','rgba(20,241,149,0.08)','rgba(4,0,18,0.95)']:['rgba(239,68,68,0.12)','rgba(4,0,18,0.95)']} style={StyleSheet.absoluteFill}/>
        <View style={{alignItems:'center',paddingHorizontal:30}}>
          {victory?<Image source={require('../assets/images/Icons/coppa.png')} style={{width:100,height:100,marginBottom:16}}/>:<Image source={require('../assets/images/Icons/play.png')} style={{width:90,height:90,marginBottom:16,opacity:0.85}}/>}
          <Text style={{color:victory?C.gold:'#EF4444',fontSize:28,fontWeight:'900',fontFamily:'monospace',textAlign:'center',textShadowColor:victory?C.gold:'#EF4444',textShadowRadius:20}}>
            {victory?t('all_skr_cleared'):t('game_over')}
          </Text>
          {!isPlaytest&&<View style={{marginTop:12,backgroundColor:'rgba(255,255,255,0.06)',borderRadius:12,paddingHorizontal:24,paddingVertical:10,borderWidth:1,borderColor:'rgba(255,255,255,0.1)'}}>
            <Text style={{color:C.gold,fontSize:22,fontWeight:'900',fontFamily:'monospace',textAlign:'center'}}>{score.toLocaleString()} {t('pts')}</Text>
          </View>}
          <View style={{flexDirection:'row',gap:12,marginTop:20,width:'100%'}}>
            {!victory&&<TouchableOpacity style={{flex:1,backgroundColor:'rgba(255,255,255,0.08)',paddingVertical:14,borderRadius:12,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.15)'}} onPress={()=>router.back()}>
              <Text style={{color:'#FFF',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>{t('exit')}</Text>
            </TouchableOpacity>}
            {victory&&isCommunityGame?(
              <TouchableOpacity style={{flex:1,borderRadius:12,overflow:'hidden'}} onPress={async()=>{await AsyncStorage.setItem('level_result',JSON.stringify({victory:true,score}));router.back();}}>
                <LinearGradient colors={['#14F195','#0EA5E9']} style={{paddingVertical:14,alignItems:'center',borderRadius:12}}>
                  <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>▶  {t('next_level_btn')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ):victory?(
              <TouchableOpacity style={{flex:1,borderRadius:12,overflow:'hidden'}} onPress={()=>{victoryRef.current=false;allSkrHitRef.current=false;setVictory(false);setGameOver(false);loadLevel();ballsRef.current=initialBalls;setBalls(initialBalls);}}>
                <LinearGradient colors={['#FFD700','#FF9500']} style={{paddingVertical:14,alignItems:'center',borderRadius:12}}>
                  <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>{t('play_again')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ):(
              <TouchableOpacity style={{flex:1,borderRadius:12,overflow:'hidden'}} onPress={()=>{victoryRef.current=false;allSkrHitRef.current=false;setVictory(false);setGameOver(false);loadLevel();ballsRef.current=initialBalls;setBalls(initialBalls);}}>
                <LinearGradient colors={['#FF6B00','#FF3D00']} style={{paddingVertical:14,alignItems:'center',borderRadius:12}}>
                  <Text style={{color:'#FFF',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>{t('retry')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    )}
    </GestureHandlerRootView>
  );
}
const st=StyleSheet.create({
  center:{flex:1,backgroundColor:'#0B0033',justifyContent:'center',alignItems:'center'},
  hud:{paddingTop:52,paddingHorizontal:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  exitBtn:{padding:8,borderWidth:1.5,borderColor:C.gold,borderRadius:8},
  exitText:{color:C.gold,fontSize:12,fontWeight:'bold',fontFamily:'monospace'},
  restartBtn:{backgroundColor:C.orange,paddingVertical:8,paddingHorizontal:12,borderRadius:8},
  restartText:{color:'white',fontSize:11,fontWeight:'bold',fontFamily:'monospace'},
  stats:{alignItems:'center',flex:1},
  scoreText:{color:C.gold,fontSize:17,fontWeight:'900',fontFamily:'monospace'},
  ballText:{color:'#fff',fontSize:17,fontWeight:'900',fontFamily:'monospace'},
  pegCountText:{color:C.gold,fontSize:17,fontWeight:'900',fontFamily:'monospace'},
  label:{color:C.textMuted,fontSize:9,fontFamily:'monospace',marginTop:1},
  comboBox:{position:'absolute',top:112,width:'100%',alignItems:'center',zIndex:10},
  comboText:{color:C.orange,fontSize:20,fontWeight:'900',fontFamily:'monospace',textShadowColor:'rgba(0,0,0,0.9)',textShadowRadius:6},
  powerBox:{position:'absolute',top:138,width:'100%',alignItems:'center',zIndex:10},
  powerText:{color:'#00FFFF',fontSize:14,fontWeight:'bold',fontFamily:'monospace',textShadowColor:'rgba(0,0,0,0.9)',textShadowRadius:6},
  feverBox:{position:'absolute',top:155,width:'100%',alignItems:'center',zIndex:10},
  feverText:{color:C.gold,fontSize:18,fontWeight:'900',fontFamily:'monospace',textShadowColor:'#FFD700',textShadowRadius:15},
  freeBallBox:{position:'absolute',top:SH/2-40,width:'100%',alignItems:'center',zIndex:20},
  freeBallText:{color:C.green,fontSize:38,fontWeight:'900',fontFamily:'monospace',textShadowColor:'#22C55E',textShadowRadius:20},
  playtestBadge:{position:'absolute',top:108,width:'100%',alignItems:'center',zIndex:10},
  playtestText:{color:'rgba(255,255,255,0.35)',fontSize:12,fontWeight:'900',fontFamily:'monospace',letterSpacing:2},
  popup:{position:'absolute',fontSize:18,fontWeight:'900',fontFamily:'monospace',textShadowColor:'rgba(0,0,0,0.95)',textShadowRadius:8,textShadowOffset:{width:1,height:1}},
  overlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'center',alignItems:'center'},
  missBox:{position:'absolute',bottom:105,zIndex:25,alignItems:'center'},
  missText:{color:'#fff',fontSize:20,fontWeight:'900',fontFamily:'monospace',textShadowColor:'rgba(0,0,0,0.9)',textShadowRadius:5,letterSpacing:2},
});
