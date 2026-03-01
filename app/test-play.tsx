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

const { width: SW, height: SH } = Dimensions.get('window');
const COLS = 12, PAD = 20;
const CELL = Math.floor((SW - PAD * 2) / COLS);
const PLAY_TOP = 120, PLAY_BOT = SH - 90;

// Physics
const GRAVITY = 480, AIR_FRICTION = 0.002, MAX_VELOCITY = 900;
const BALL_R = CELL * 0.22, PEG_R = CELL * 0.34, BUMPER_R = CELL * 0.42, BUMPER_BIG_R = CELL * 1.0;
const RESTITUTION = 0.72, BUMPER_BOUNCE = 1.30, WALL_RESTITUTION = 0.75, SLIDE_BOUNCE = 0.05;
const BUCKET_W = 90, BUCKET_H = 32, BUCKET_SPEED = 120, MAX_SUB_STEPS = 12;
const INITIAL_SHOT_SPEED = 720, VORTEX_MS = 800, SEG_FADE_MS = 2000;

// Smart zoom
const FEVER_TOUCH_R = BALL_R + PEG_R + 6;
const FEVER_RAY_STEPS = 12, FEVER_RAY_DT = 0.06;
const FEVER_SLOWMO = 0.22;
const MIN_SPEED_FOR_ZOOM = 120;       // px/s — no zoom when nearly still
const ZOOM_DEACT_COOLDOWN = 2.0;     // seconds cooldown after deactivating zoom

// Stuck guard
const STUCK_DIST = 4;           // px — min movement expected per check
const STUCK_MS   = 1500;        // check interval — fast detection for invisible-wall traps

const PEG_IMG = CELL * 1.7, BUMP_IMG = CELL * 1.85, BUMP_BIG_IMG = CELL * 2.2, CURVE_IMG = CELL * 0.95;
const VORTEX_IMG = CELL * 0.9; // vortex stays small as requested
const C = { bg1:'#0B0033', bg2:'#1A0066', gold:'#FFD700', orange:'#FF6B00', green:'#22C55E', blue:'#3B82F6', purple:'#7B2FBE', text:'#FFF', textMuted:'rgba(255,255,255,0.6)' };

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
function willBallHitTarget(
  bxv:number,byv:number,vx:number,vy:number,tx:number,ty:number,
  pegXs?:number[],pegYs?:number[],pegRs?:number[],pegHit?:boolean[],pegTypes?:string[],targetIdx?:number,
): boolean {
  'worklet';
  const speed=Math.sqrt(vx*vx+vy*vy);
  const mul=speed>MAX_VELOCITY?3:1;
  // More steps for better accuracy (Peggle 2 style)
  const steps=FEVER_RAY_STEPS*mul*2;
  const rdt=FEVER_RAY_DT/(mul*2);
  let cx=bxv,cy=byv,cvx=vx,cvy=vy;
  for (let s=0;s<steps;s++) {
    cvy+=GRAVITY*rdt; cx+=cvx*rdt; cy+=cvy*rdt;
    // Wall bounces
    if (cx<PAD+BALL_R) { cx=PAD+BALL_R; cvx=Math.abs(cvx)*WALL_RESTITUTION; }
    if (cx>SW-PAD-BALL_R) { cx=SW-PAD-BALL_R; cvx=-Math.abs(cvx)*WALL_RESTITUTION; }
    // Check target hit
    if (Math.hypot(cx-tx,cy-ty)<FEVER_TOUCH_R) return true;
    // Simulate bounces off pegs in the way (Peggle 2 style)
    if (pegXs && pegYs && pegRs && pegHit && pegTypes) {
      for (let j=0;j<pegXs.length;j++) {
        if (j===targetIdx) continue; // skip the target peg
        if (pegHit[j]) continue; // already hit
        const t=pegTypes[j];
        if (t==='bucket'||t==='curved_left'||t==='curved_right') continue;
        const pr=pegRs[j]; if(pr<=0) continue;
        const dx=cx-pegXs[j],dy=cy-pegYs[j];
        const dist=Math.sqrt(dx*dx+dy*dy);
        const touchR=BALL_R+pr;
        if (dist<touchR&&dist>0.01) {
          // Bounce off this peg — reflect velocity
          const nx=dx/dist,ny=dy/dist;
          const dot=cvx*nx+cvy*ny;
          if (dot<0) { // approaching
            const restitution=t==='bumper'?BUMPER_BOUNCE:RESTITUTION;
            cvx-=2*dot*nx*restitution;
            cvy-=2*dot*ny*restitution;
            // Push out
            cx=pegXs[j]+nx*touchR;
            cy=pegYs[j]+ny*touchR;
          }
        }
      }
    }
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
const AimDot = ({i,aimAngle,shootingSV,spacing}:any) => {
  const d=(i+1)*spacing;
  const cx=useDerivedValue(()=>SW/2+Math.cos(aimAngle.value)*d);
  const cy=useDerivedValue(()=>(PLAY_TOP-20)+Math.sin(aimAngle.value)*d);
  const op=useDerivedValue(()=>shootingSV.value?0:Math.max(0,0.85-i*0.055));
  return <Circle cx={cx} cy={cy} r={Math.max(1.5,4-i*0.25)} color={C.gold} opacity={op}/>;
};

interface Peg { x:number;y:number;type:string;hit:boolean;touched:boolean;r:number;fadeAlpha:number; }
interface WallBlock { x:number;y:number;w:number;h:number; }
interface ScorePopup { x:number;y:number;text:string;color:string;alpha:number;id:number; }
interface MovingObs { x:number;y:number;width:number;height:number;vx:number;minX:number;maxX:number; }
interface LineSegment { p1x:number;p1y:number;p2x:number;p2y:number; }
interface CurvePoint { r:number;c:number; }
interface SegState { alive:boolean;opacity:number;hitTime:number|null; }
let _pid=0;

export default function TestPlayScreen() {
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
  const starPlayer=useAudioPlayer(require('../assets/star.mp3'));
  const zoomPlayer=useAudioPlayer(require('../assets/zoom.mp3'));
  const bgMusic2=useAudioPlayer(require('../assets/images/tools/music2.mp3'));
  const bgMusic3=useAudioPlayer(require('../assets/images/tools/music3.mp3'));
  const bgMusic4=useAudioPlayer(require('../assets/images/tools/music4.mp3'));
  const bgMusic5=useAudioPlayer(require('../assets/images/tools/music5.mp3'));
  const skrPlayer=useAudioPlayer(require('../assets/skr.mp3'));
  const vortexAudioPlayer=useAudioPlayer(require('../assets/vortex.mp3'));
  const teleportAudioPlayer=useAudioPlayer(require('../assets/teleport.mp3'));

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

  const [missShow, setMissShow] = useState(false);
  const [missX, setMissX] = useState(SW/2);
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
  const pX=useSharedValue<number[]>([]),pY=useSharedValue<number[]>([]);
  const pR=useSharedValue<number[]>([]),pH=useSharedValue<boolean[]>([]);
  const pT=useSharedValue<string[]>([]);
  const wX=useSharedValue<number[]>([]),wY=useSharedValue<number[]>([]);
  const wW=useSharedValue<number[]>([]),wH=useSharedValue<number[]>([]);
  const curveLines=useSharedValue<LineSegment[]>([]),curveAlive=useSharedValue<boolean[]>([]);
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
  const allSegments=useRef<LineSegment[][]>([]);
  const flatToGroup=useRef<{curveIdx:number;segIdx:number}[]>([]);
  const segStates=useRef<SegState[]>([]);
  const rollingPeg=useSharedValue<number>(-1);
  const rollingAngle=useSharedValue(0),rollingLaps=useSharedValue(0);

  useEffect(()=>{ loadLevel(); },[]);
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
    popupsRef.current=next.slice(-5); setPopups([...popupsRef.current]);
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
      victoryRef.current=false; allSkrHitRef.current=false; allSkrTouchedSV.value=false; allSkrTouchedSV.value=false;
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
      const grid:string[][]=data.grid||[];
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
          newPegs.push({x:PAD+c*CELL+CELL,y:PLAY_TOP+r*CELL+CELL,type:cell,hit:false,touched:false,r:BUMPER_BIG_R,fadeAlpha:1});
        } else {
          let radius=PEG_R; if(cell==='bumper') radius=BUMPER_R; if(cell==='curved_left'||cell==='curved_right') radius=CELL*0.30;
          if(cell==='teleport_a'||cell==='teleport_b') radius=CELL*0.32;
          newPegs.push({x:cx,y:cy,type:cell,hit:false,touched:false,r:radius,fadeAlpha:1});
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
      curveLines.value=segFlat; curveAlive.value=segFlat.map(()=>true);
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
      zoomScale.value=1; zoomOffX.value=0; zoomOffY.value=0; feverSV.value=false; zoomCooldownSV.value=0;
      setFeverUI(false); setLastSkrHitUI(false);
      vortexActive.value=false; vortexCooldown.value=0; teleportCooldown.value=0;
      mb1Active.value=false; mb2Active.value=false; mb1x.value=-200; mb1y.value=-200; mb2x.value=-200; mb2y.value=-200;
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
    }
    if(!isPlaytestRef.current){
      let pts=10;
      if(p.type==='peg_gold') pts=500; else if(p.type==='peg_red') pts=100;
      else if(p.type==='peg_blue') pts=25; else if(p.type==='bumper'||p.type==='bumper_big') pts=15;
      else if(p.type==='curved_left'||p.type==='curved_right') pts=5;
      comboRef.current++; const tot=pts*Math.min(comboRef.current,10);
      scoreRef.current+=tot; setScore(scoreRef.current); setCombo(comboRef.current);
      const pitch=Math.min(1.0+comboRef.current*0.12,3.0);
      // FIX: SKR gets its own sound
      if(p.type==='peg_gold'){ if(!musicMutedRef.current){ try { skrPlayer.seekTo(0); skrPlayer.play(); } catch {} } }
      else { if(!musicMutedRef.current){ const now=Date.now(); if(now-lastDingRef.current>80){lastDingRef.current=now;try{dingPlayer.setPlaybackRate(pitch);dingPlayer.seekTo(0);dingPlayer.play();}catch{}} } }
      if(p.type==='bumper'||p.type==='bumper_big'){starPlayer.seekTo(0);starPlayer.play();}
      const col=p.type==='peg_red'?C.orange:p.type==='peg_gold'?C.gold:p.type==='peg_blue'?C.blue:C.green;
      addPopup(p.x,p.y-25,`+${tot}`,col);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if(p.type==='peg_blue'&&!activePowerRef.current&&Math.random()<0.30) triggerSOLBonus();
    setPegs([...pegsRef.current]);
    // Peg fades after 1.2s — NO victory check here
    if(p.type!=='bumper'&&p.type!=='bumper_big'&&p.type!=='curved_left'&&p.type!=='curved_right'){
      setTimeout(()=>{
        if(pegsRef.current[idx]&&!pegsRef.current[idx].hit){
          pegsRef.current[idx].hit=true; pegsRef.current[idx].fadeAlpha=0;
          const nh=[...pH.value]; nh[idx]=true; pH.value=nh;
          // FIX: zero out radius of non-permanent pegs so they have NO collision after hit
          const isPerm=pegsRef.current[idx].type==='bumper'||pegsRef.current[idx].type==='bumper_big'||pegsRef.current[idx].type==='curved_left'||pegsRef.current[idx].type==='curved_right'||pegsRef.current[idx].type==='teleport_a'||pegsRef.current[idx].type==='teleport_b';
          if(!isPerm){ const nr=[...pR.value]; nr[idx]=0; pR.value=nr; }
          setPegs([...pegsRef.current]);
        }
      },1200);
    }
    // FIX: check if ALL SKR now touched — activate fever music (ball still drains)
    if(!allSkrHitRef.current){
      const skrRem=pegsRef.current.filter(pg=>pg.type==='peg_gold'&&!pg.hit&&!pg.touched).length;
      if(skrRem===0){
        allSkrHitRef.current=true; allSkrTouchedSV.value=true;
        setLastSkrHitUI(true);
        stopFeverMusic(); // SKR hit: stop zoom.mp3, restart loop.mp3
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addPopup(SW/2,PLAY_TOP+80,'⚡ LAST SKR!',C.gold);
      }
    }
  };

  const triggerSOLBonus=()=>{
    // Bonuses: multiball, slowBucket, longShot (no fireball)
    const choices=['multiball','slowBucket','longShot'];
    const chosen=choices[Math.floor(Math.random()*choices.length)];
    if(!pendingBonusRef.current){
      pendingBonusRef.current=chosen; setPendingBonus(chosen);
      const label=chosen==='multiball'?'MULTIBALL':chosen==='slowBucket'?'SLOW BUCKET':'LONG SHOT';
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
  // Spawn multiball — called from shoot() AFTER velocity is set
  const spawnMultiball=()=>{
    mb1x.value=bx.value;mb1y.value=by.value;mb1vx.value=bvx.value+200;mb1vy.value=bvy.value-100;mb1Active.value=true;
    mb2x.value=bx.value;mb2y.value=by.value;mb2vx.value=bvx.value-200;mb2vy.value=bvy.value-100;mb2Active.value=true;
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    mb1Active.value=false; mb2Active.value=false; mb1x.value=-200; mb1y.value=-200; mb2x.value=-200; mb2y.value=-200;
    mb1StillSV.value=0; mb2StillSV.value=0;
    removeAllTouchedSegs();
    // FIX: victory declared here — only after ball drains
    setTimeout(()=>{
      if(victoryRef.current) return;
      const skrLeft=pegsRef.current.filter(p=>p.type==='peg_gold'&&!p.hit&&!p.touched).length;
      if(skrLeft===0||allSkrHitRef.current){
        victoryRef.current=true; setLastSkrHitUI(false); setVictory(true); stopFeverMusic();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if(ballsRef.current<=0){ setGameOver(true); stopFeverMusic(); }
    },350);
  };

  const shoot=()=>{
    const skrLeft=pegsRef.current.filter(p=>p.type==='peg_gold'&&!p.hit&&!p.touched).length;
    if(bActive.value||mb1Active.value||mb2Active.value||mainBallDrainedSV.value||ballsRef.current<=0||victoryRef.current||gameOver||skrLeft===0) return;
    setShooting(true); shootingSV.value=true;
    ballsRef.current--; setBalls(ballsRef.current);
    bx.value=SW/2; by.value=PLAY_TOP-20;
    // Activate pending bonus BEFORE setting velocity so longShot can be detected
    activatePendingBonus();
    // Set velocity — if longShot, use 2.5x speed directly (no race condition with frame callback)
    const isLong=activePowerRef.current==='longShot';
    const shotSpeed=isLong?INITIAL_SHOT_SPEED*2.5:INITIAL_SHOT_SPEED;
    if(isLong) maxVelSV.value=MAX_VELOCITY*3;
    bvx.value=Math.cos(aimAngle.value)*shotSpeed;
    bvy.value=Math.sin(aimAngle.value)*shotSpeed;
    // Spawn multiball AFTER velocity is set (needs correct bvx/bvy)
    if(activePowerRef.current==='multiball') spawnMultiball();
    // Activate ball AFTER velocity is fully set — prevents frame callback processing partial state
    bActive.value=true; mainBallDrainedSV.value=false; rollingPeg.value=-1; rollingAngle.value=0; rollingLaps.value=0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startStuckGuard();
  };

  const restartLevel=()=>{
    victoryRef.current=false; allSkrHitRef.current=false; allSkrTouchedSV.value=false;
    if(ballsRef.current<=0){Alert.alert('No balls left!');return;}
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
    mb1Active.value=false;mb2Active.value=false;mb1x.value=-200;mb1y.value=-200;mb2x.value=-200;mb2y.value=-200;
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

    // ── SMART ZOOM v5 ────────────────────────────────────────────────────────
    let feverNow=false;
    // FIX: don't zoom if all SKR already collected/touched
    if(bActive.value&&zoomCooldownSV.value<=0&&!allSkrTouchedSV.value){
      const ballSpeed=Math.hypot(bvx.value,bvy.value);
      if(ballSpeed>MIN_SPEED_FOR_ZOOM){
        // FIX: zoom + slow-mo ONLY when exactly 1 SKR peg remains
        let skrLeft=0,lastIdx=-1;
        for(let i=0;i<pX.value.length;i++){
          if(pT.value[i]==='peg_gold'&&!pH.value[i]){skrLeft++;lastIdx=i;}
        }
        if(skrLeft===1&&lastIdx>=0){
          const tx=pX.value[lastIdx],ty=pY.value[lastIdx];
          const distToTarget=Math.hypot(bx.value-tx,by.value-ty);
          let shouldZoom=willBallHitTarget(bx.value,by.value,bvx.value,bvy.value,tx,ty,pX.value,pY.value,pR.value,pH.value,pT.value,lastIdx);
          // Peggle 2 style: sustain zoom once active — keep if ball is reasonably close
          // or still approaching target (even after bouncing off a peg in the way)
          if(!shouldZoom&&feverSV.value){
            if(distToTarget<CELL*14){
              const adx=bx.value-tx,ady=by.value-ty;
              const approach=-(bvx.value*adx+bvy.value*ady)/(distToTarget||1);
              if(approach>0||distToTarget<CELL*5) shouldZoom=true;
            }
          }
          if(shouldZoom){
            feverNow=true;
            const tgtS=1.7,tgtOX=SW/2-bx.value,tgtOY=SH/2-by.value;
            zoomScale.value+=(tgtS-zoomScale.value)*0.05;
            zoomOffX.value+=(tgtOX-zoomOffX.value)*0.05;
            zoomOffY.value+=(tgtOY-zoomOffY.value)*0.05;
            if(!feverSV.value){
              feverSV.value=true;runOnJS(setFeverUI)(true);
              runOnJS(startFeverMusicJS)(); // START zoom.mp3 when zoom begins
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
        // FIX: stop zoom music when zoom deactivates (if not in "all SKR hit" state)
        runOnJS(stopFeverMusicIfZoomOnly)();
      }
    }
    // Slow-mo: applies to movement only — velocity magnitude NOT affected by dt scaling
    const dt=feverNow?rawDt*FEVER_SLOWMO:rawDt;

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
      // FIX: curve segments — physics already killed on hit via curveAlive
      const hitLocal:number[]=[];
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
          const newAlive=[...curveAlive.value]; newAlive[ci]=false; curveAlive.value=newAlive;
          hitLocal.push(ci);
        }
      }
      if(hitLocal.length>0) hitSegs.push(...hitLocal);
      for(let i=0;i<pX.value.length;i++){
        if(pH.value[i]&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'&&pT.value[i]!=='curved_left'&&pT.value[i]!=='curved_right'&&pT.value[i]!=='teleport_a'&&pT.value[i]!=='teleport_b') continue;
        const dx4=bx.value-pX.value[i],dy4=by.value-pY.value[i],dist4=Math.hypot(dx4,dy4),minD=BALL_R+pR.value[i];
        if(dist4<minD&&dist4>0.01){
          const nx4=dx4/dist4,ny4=dy4/dist4;
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
            // FIX: mark peg hit immediately in worklet (fireball pass-through)
            const nh2=[...pH.value]; nh2[i]=true; pH.value=nh2;
            const nr2=[...pR.value]; nr2[i]=0; pR.value=nr2;
            runOnJS(onHitJS)(i);
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
            // FIX: mark peg as hit IMMEDIATELY in worklet — prevents repeated collision
            // during slow-mo (ball barely moves, re-enters peg zone every substep).
            // Without this, the ball bounces off the peg visually but onHitJS hasn't
            // executed yet (async runOnJS), so peg looks uncollected.
            if(pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'){
              const nh=[...pH.value]; nh[i]=true; pH.value=nh;
              const nr=[...pR.value]; nr[i]=0; pR.value=nr;
            }
            runOnJS(onHitJS)(i);
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
          if(pH.value[i]&&pT.value[i]!=='bumper'&&pT.value[i]!=='bumper_big'&&pT.value[i]!=='curved_left'&&pT.value[i]!=='curved_right') continue;
          const dx4=mb.x.value-pX.value[i],dy4=mb.y.value-pY.value[i],dist4=Math.hypot(dx4,dy4),minD=BALL_R+pR.value[i];
          if(dist4<minD&&dist4>0.01){
            const nx4=dx4/dist4,ny4=dy4/dist4,dot2=mb.vx.value*nx4+mb.vy.value*ny4;
            if(dot2<0){
              const mult2=(pT.value[i]==='bumper'||pT.value[i]==='bumper_big')?BUMPER_BOUNCE:RESTITUTION;
              mb.vx.value=(mb.vx.value-2*dot2*nx4)*mult2;mb.vy.value=(mb.vy.value-2*dot2*ny4)*mult2;
            }
            mb.x.value=pX.value[i]+nx4*(minD+1);mb.y.value=pY.value[i]+ny4*(minD+1);
            // FIX: mark peg hit immediately in worklet (same fix as main ball)
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
      if(popupsRef.current.length===0) return;
      const u=popupsRef.current.map(p=>({...p,alpha:p.alpha-0.028})).filter(p=>p.alpha>0.02);
      popupsRef.current=u; setPopups([...u]);
    },33);
    return ()=>clearInterval(iv);
  },[]);

  const zoomTransform=useDerivedValue<any>(()=>[
    {translateX:SW/2+zoomOffX.value},{translateY:SH/2+zoomOffY.value},
    {scale:zoomScale.value},{translateX:-SW/2},{translateY:-SH/2},
  ]);
  const gesture=Gesture.Pan()
    .onUpdate((e)=>{'worklet';if(bActive.value)return;const dx=e.x-SW/2,dy=e.y-(PLAY_TOP-20);let a=Math.atan2(dy,dx);a=Math.max(0.15,Math.min(Math.PI-0.15,a));aimAngle.value=a;})
    .onEnd(()=>{'worklet';runOnJS(shoot)();});

  if(loading) return <View style={st.center}><ActivityIndicator color={C.gold} size="large"/></View>;
  const skrLeft=pegs.filter(p=>p.type==='peg_gold'&&!p.hit).length;
  const fmtScore=(n:number)=>n>=10000?`${Math.floor(n/1000)}K`:String(n);

  return (
    <GestureHandlerRootView style={{flex:1,backgroundColor:C.bg1}}>
    <WallpaperBackground/>
    <View style={st.hud}>
      <TouchableOpacity onPress={()=>router.back()} style={st.exitBtn}><Text style={st.exitText}>EXIT</Text></TouchableOpacity>
      <View style={st.stats}><Text style={st.scoreText}>{isPlaytest?'—':fmtScore(score)}</Text><Text style={st.label}>{isPlaytest?'TEST':'SCORE'}</Text></View>
      <View style={st.stats}><Text style={[st.ballText,balls<=2&&{color:'#EF4444'}]}>{balls}</Text><Text style={st.label}>BALLS</Text></View>
      <View style={st.stats}><Text style={[st.pegCountText,skrLeft===0&&{color:C.green}]}>{skrLeft}</Text><Text style={st.label}>SKR LEFT</Text></View>
      <TouchableOpacity onPress={restartLevel} style={st.restartBtn}><Text style={st.restartText}>RST</Text></TouchableOpacity>
    </View>
    {!isPlaytest&&combo>1&&<View style={st.comboBox} pointerEvents="none"><Text style={[st.comboText,combo>=5&&{color:'#FF4500',fontSize:28}]}>COMBO x{combo}</Text></View>}
    {activePower&&<View style={st.powerBox} pointerEvents="none">
      <Text style={st.powerText}>
        {activePower==='multiball'?'MULTIBALL ACTIVE':activePower==='slowBucket'?'SLOW BUCKET ACTIVE':activePower==='longShot'?'LONG SHOT ACTIVE':''}
      </Text>
    </View>}
    {pendingBonus&&!activePower&&<View style={st.powerBox} pointerEvents="none">
      <Text style={[st.powerText,{color:'#FFD700'}]}>
        {pendingBonus==='multiball'?'MULTIBALL READY':pendingBonus==='slowBucket'?'SLOW BUCKET READY':pendingBonus==='longShot'?'LONG SHOT READY':''}
      </Text>
    </View>}
    {/* Zoom is silent - no text indicator needed */}
    {freeBallShow&&<View style={st.freeBallBox} pointerEvents="none"><Text style={st.freeBallText}>FREE BALL!</Text></View>}
    {missShow&&<View style={[st.missBox,{left:missX-45}]} pointerEvents="none"><Text style={st.missText}>MISS!</Text></View>}
    {isPlaytest&&<View style={st.playtestBadge} pointerEvents="none"><Text style={st.playtestText}>PLAYTEST MODE</Text></View>}
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
    {/* FIX: batch ALL alive curve segments into ONE Skia path — eliminates per-segment lag */}
    {segOpacities.length > 0 && (() => {
      const alivePath = Skia.Path.Make();
      let hasAlive = false;
      const segs = curveLines.value;
      for (let i = 0; i < segOpacities.length; i++) {
        if (segOpacities[i] <= 0) continue;
        const ss = segStates.current[i]; if (!ss || !ss.alive) continue;
        const seg = segs[i]; if (!seg) continue;
        alivePath.moveTo(seg.p1x, seg.p1y);
        alivePath.lineTo(seg.p2x, seg.p2y);
        hasAlive = true;
      }
      if (!hasAlive) return null;
      return (
        <SkiaPath path={alivePath} color="#9B30FF" style="stroke" strokeWidth={14}
          strokeJoin="round" strokeCap="round"/>
      );
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
      const op=p.touched?0.35:1;
      const strokeC=p.type==='peg_red'?C.orange:p.type==='peg_gold'?C.gold:p.type==='peg_blue'?C.blue:C.green;
      return (<React.Fragment key={`p${i}`}>
        <Circle cx={p.x} cy={p.y} r={p.r+2.5} color={strokeC} opacity={op*0.55}/>
        <SkiaImage image={img} x={p.x-imgSize/2} y={p.y-imgSize/2} width={imgSize} height={imgSize} opacity={op}/>
      </React.Fragment>);
    })}
    {Array.from({length:movingObsCount}).map((_,i)=><MovingObstacleRenderer key={`mo${i}`} index={i} movingObsSV={movingObsSV} image={movingImg}/>)}
    <Circle cx={bx} cy={by} r={BALL_R} color={isFireball?'#FF4500':'white'}>
      <Shadow dx={0} dy={0} blur={isFireball?20:lastSkrHitUI?30:12} color={isFireball?'#FF4500':lastSkrHitUI?C.gold:'#00FFFF'}/>
      <Shadow dx={0} dy={0} blur={4} color="white"/>
    </Circle>
    <Circle cx={mb1x} cy={mb1y} r={BALL_R} color="#FFD700"><Shadow dx={0} dy={0} blur={12} color="#FFD700"/></Circle>
    <Circle cx={mb2x} cy={mb2y} r={BALL_R} color="#FF6B00"><Shadow dx={0} dy={0} blur={12} color="#FF6B00"/></Circle>
    {bucketImg&&<SkiaImage image={bucketImg} x={bucketX} y={PLAY_BOT-BUCKET_H} width={BUCKET_W} height={BUCKET_H}/>}
    </Group></Canvas>
    {popups.map(p=><Text key={`pop${p.id}`} style={[st.popup,{left:p.x-35,top:p.y,color:p.color,opacity:p.alpha}]}>{p.text}</Text>)}
    </View></GestureDetector>
    {(victory||gameOver)&&(
      <View style={st.overlay}>
        <LinearGradient colors={victory?['rgba(255,215,0,0.15)','rgba(20,241,149,0.08)','rgba(4,0,18,0.95)']:['rgba(239,68,68,0.12)','rgba(4,0,18,0.95)']} style={StyleSheet.absoluteFill}/>
        <View style={{alignItems:'center',paddingHorizontal:30}}>
          {victory?<Image source={require('../assets/images/Icons/coppa.png')} style={{width:100,height:100,marginBottom:16}}/>:<Image source={require('../assets/images/Icons/play.png')} style={{width:90,height:90,marginBottom:16,opacity:0.85}}/>}
          <Text style={{color:victory?C.gold:'#EF4444',fontSize:28,fontWeight:'900',fontFamily:'monospace',textAlign:'center',textShadowColor:victory?C.gold:'#EF4444',textShadowRadius:20}}>
            {victory?'ALL SKR CLEARED!':'GAME OVER'}
          </Text>
          {!isPlaytest&&<View style={{marginTop:12,backgroundColor:'rgba(255,255,255,0.06)',borderRadius:12,paddingHorizontal:24,paddingVertical:10,borderWidth:1,borderColor:'rgba(255,255,255,0.1)'}}>
            <Text style={{color:C.gold,fontSize:22,fontWeight:'900',fontFamily:'monospace',textAlign:'center'}}>{score.toLocaleString()} PTS</Text>
          </View>}
          <View style={{flexDirection:'row',gap:12,marginTop:20,width:'100%'}}>
            {!victory&&<TouchableOpacity style={{flex:1,backgroundColor:'rgba(255,255,255,0.08)',paddingVertical:14,borderRadius:12,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.15)'}} onPress={()=>router.back()}>
              <Text style={{color:'#FFF',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>EXIT</Text>
            </TouchableOpacity>}
            {victory&&isCommunityGame?(
              <TouchableOpacity style={{flex:1,borderRadius:12,overflow:'hidden'}} onPress={async()=>{await AsyncStorage.setItem('level_result',JSON.stringify({victory:true,score}));router.back();}}>
                <LinearGradient colors={['#14F195','#0EA5E9']} style={{paddingVertical:14,alignItems:'center',borderRadius:12}}>
                  <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>▶  NEXT LEVEL</Text>
                </LinearGradient>
              </TouchableOpacity>
            ):victory?(
              <TouchableOpacity style={{flex:1,borderRadius:12,overflow:'hidden'}} onPress={()=>{victoryRef.current=false;allSkrHitRef.current=false;setVictory(false);setGameOver(false);loadLevel();ballsRef.current=initialBalls;setBalls(initialBalls);}}>
                <LinearGradient colors={['#FFD700','#FF9500']} style={{paddingVertical:14,alignItems:'center',borderRadius:12}}>
                  <Text style={{color:'#000',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>PLAY AGAIN</Text>
                </LinearGradient>
              </TouchableOpacity>
            ):(
              <TouchableOpacity style={{flex:1,borderRadius:12,overflow:'hidden'}} onPress={()=>{victoryRef.current=false;allSkrHitRef.current=false;setVictory(false);setGameOver(false);loadLevel();ballsRef.current=initialBalls;setBalls(initialBalls);}}>
                <LinearGradient colors={['#FF6B00','#FF3D00']} style={{paddingVertical:14,alignItems:'center',borderRadius:12}}>
                  <Text style={{color:'#FFF',fontWeight:'900',fontFamily:'monospace',fontSize:14}}>RETRY</Text>
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
  comboBox:{position:'absolute',top:108,width:'100%',alignItems:'center',zIndex:10},
  comboText:{color:C.orange,fontSize:20,fontWeight:'900',fontFamily:'monospace'},
  powerBox:{position:'absolute',top:132,width:'100%',alignItems:'center',zIndex:10},
  powerText:{color:'#00FFFF',fontSize:14,fontWeight:'bold',fontFamily:'monospace'},
  feverBox:{position:'absolute',top:155,width:'100%',alignItems:'center',zIndex:10},
  feverText:{color:C.gold,fontSize:18,fontWeight:'900',fontFamily:'monospace',textShadowColor:'#FFD700',textShadowRadius:15},
  freeBallBox:{position:'absolute',top:SH/2-40,width:'100%',alignItems:'center',zIndex:20},
  freeBallText:{color:C.green,fontSize:38,fontWeight:'900',fontFamily:'monospace',textShadowColor:'#22C55E',textShadowRadius:20},
  playtestBadge:{position:'absolute',top:108,width:'100%',alignItems:'center',zIndex:10},
  playtestText:{color:'rgba(255,255,255,0.35)',fontSize:12,fontWeight:'900',fontFamily:'monospace',letterSpacing:2},
  popup:{position:'absolute',fontSize:18,fontWeight:'900',fontFamily:'monospace',textShadowColor:'rgba(0,0,0,0.7)',textShadowRadius:4},
  overlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'center',alignItems:'center'},
  missBox:{position:'absolute',bottom:105,zIndex:25,alignItems:'center'},
  missText:{color:'#fff',fontSize:20,fontWeight:'900',fontFamily:'monospace',textShadowColor:'rgba(0,0,0,0.9)',textShadowRadius:5,letterSpacing:2},
});
