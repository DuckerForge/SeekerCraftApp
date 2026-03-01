// app/editor.tsx - SeekerCraft Level Editor v3
// ── CHANGES v3 ──────────────────────────────────────────────────────────────
// 1. Blueprint-style grid with cyan lines, subtle dots, coordinate labels
// 2. Track editor: A→B two-point system with rotation slider per track
// 3. isPlaytest flag: set in AsyncStorage before launching test-play
// 4. Curves now store rotation per curve for physics alignment
// 5. Visual polish: grid glow, neon accents, professional layout
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Dimensions, Alert, Image, ImageBackground, StyleSheet, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Canvas, Path as SkiaPath, Skia, Line, Circle as SkiaCircle, RoundedRect } from '@shopify/react-native-skia';
import { useAudioPlayer } from 'expo-audio';
import Slider from '@react-native-community/slider';
import Tutorial from '@/components/Tutorial';

const { width: SW } = Dimensions.get('window');
const COLS = 12;
const ROWS = 16;
const CELL = Math.floor((SW - 40) / COLS);

const C = {
  bg1:'#0D0028', bg2:'#1A0840',
  yellow:'#FFE600', orange:'#FF8C00', coral:'#FF4D6D',
  mint:'#00F0B5', cyan:'#00D4FF', purple:'#9945FF',
  pink:'#FF69B4', blue:'#3B7DFF', lime:'#8BFF00',
  gold:'#FFD700', red:'#FF3860', green:'#00F0B5', gray:'#6B7280',
  gridLine:'rgba(0,212,255,0.18)',
  gridDot:'rgba(0,240,181,0.35)',
  gridBorder:'rgba(0,212,255,0.55)',
  surface:'rgba(255,255,255,0.06)',
  text:'#FFF', textMuted:'rgba(255,255,255,0.5)',
};

const ELEMENTS: Record<string, {
  color: string; label: string; image?: any; emoji?: string;
  desc: string; size?: '1x1' | '2x2';
}> = {
  empty:       { color:'transparent', label:'Erase',    image:require('../assets/images/tools/erase.png'), desc:'Erase element from cell. Tap a cell to remove it.' },
  peg_red:     { color:C.orange,      label:'BTC',      image:require('../assets/images/Peg/btc.png'),     desc:'BTC peg – optional, worth bonus pts when hit.' },
  peg_blue:    { color:C.blue,        label:'SOL',      image:require('../assets/images/Peg/sol.png'),     desc:'SOL peg – 30% chance to trigger Multiball, Fireball or Slow Bucket.' },
  peg_gold:    { color:C.gold,        label:'SKR',      image:require('../assets/images/Peg/skr.png'),     desc:'SKR peg – REQUIRED. Hit ALL SKR pegs to complete the level!' },
  bumper:      { color:C.green,       label:'Star',     image:require('../assets/images/Peg/bump.png'),    desc:'Star bumper – powerful bounce, never disappears.' },
  bumper_big:  { color:C.green,       label:'Big Star', image:require('../assets/images/Peg/BigStar.png'), desc:'Big Star 2x2 – occupies 4 cells, double bounce force. Always stays.', size:'2x2' },
  obstacle:    { color:C.gray,        label:'Wall',     image:require('../assets/images/Peg/walls.jpg'),   desc:'Solid wall – blocks the ball completely.' },
  curved_left: { color:'#7B2FBE',     label:'Vortex',   image:require('../assets/images/Peg/curva.png'),  desc:'Vortex – captures the ball for 0.8s then launches it randomly.' },
  teleport_a:  { color:'#00D4FF',     label:'Teleport', image:require('../assets/images/Peg/TeleportA.png'),  desc:'Teleport – tap first cell (A entry), then second cell (B exit). Ball teleports A→B and B→A.' },
  moving_block:{ color:'#64748B',     label:'Moving',   image:require('../assets/images/Peg/moving.png'), desc:'Moving block – slides horizontally, deflects the ball.' },
  curve_track: { color:'#9B30FF',     label:'Track',    image:require('../assets/images/tools/track.png'), desc:'Track rail – tap A then B. Rotate with slider below.' },
  bucket:      { color:C.blue,        label:'Bucket',   image:require('../assets/images/Peg/bucket.png'), desc:'Free Ball bucket – tap to choose bucket style for your level.' },
};

type GridCell = keyof typeof ELEMENTS;
interface CurvePoint { r:number; c:number; }
interface CurveData  { points: CurvePoint[]; rotation: number; }
interface LevelData  { name:string; grid:GridCell[][]; balls:number; curves:CurvePoint[][]; curveRotations?:number[]; bucketSkin?:string; }

const emptyGrid = (): GridCell[][] =>
  Array(ROWS).fill(null).map(() => Array(COLS).fill('empty'));

export default function EditorScreen() {
  // ── HOOKS ─────────────────────────────────────────────────────────────────
  const selecttPlayer   = useAudioPlayer(require('../assets/selectt.mp3'));
  const selectgPlayer   = useAudioPlayer(require('../assets/selectg.mp3'));
  const backPlayer      = useAudioPlayer(require('../assets/images/tools/back.mp3'));
  const startPlayer     = useAudioPlayer(require('../assets/images/tools/Start.mp3'));
  const editMusicPlayer = useAudioPlayer(require('../assets/images/tools/edit.mp3'));

  const historyRef = useRef<{grid:GridCell[][]; curves:CurvePoint[][]; rotations:number[]}[]>([]);
  const histIdxRef = useRef<number>(-1);

  const [name,             setName]             = useState('My Level');
  const [grid,             setGrid]             = useState<GridCell[][]>(emptyGrid());
  const [curves,           setCurves]           = useState<CurvePoint[][]>([]);
  const [curveRotations,   setCurveRotations]   = useState<number[]>([]);  // rotation per curve (degrees)
  const [tool,             setTool]             = useState<GridCell>('peg_red');
  const [balls,            setBalls]            = useState(10);
  const [levelId,          setLevelId]          = useState<string|null>(null);
  const [showTutorial,     setShowTutorial]     = useState(false);
  const [curveStart,       setCurveStart]       = useState<CurvePoint|null>(null);
  const [teleportStart,    setTeleportStart]    = useState<CurvePoint|null>(null); // first tap for teleport pair
  const [selectedBucket,   setSelectedBucket]   = useState<'bucket'|'bucket2'|'bucket3'>('bucket');
  const [showBucketPicker, setShowBucketPicker] = useState(false);
  const [musicMuted,       setMusicMuted]       = useState(false);
  const [selectedCurve,    setSelectedCurve]    = useState<number|null>(null); // which curve is selected for rotation
  const [movingCurveIdx,   setMovingCurveIdx]   = useState<number|null>(null); // which curve is being dragged

  // Music control — stop global main.mp3, play only edit.mp3
  useFocusEffect(useCallback(() => {
    const { DeviceEventEmitter } = require('react-native');
    DeviceEventEmitter.emit('PAUSE_GLOBAL_MUSIC');
    if (!musicMuted) {
      editMusicPlayer.loop = true;
      editMusicPlayer.play();
    }
    return () => {
      try { editMusicPlayer.pause?.(); } catch {}
      DeviceEventEmitter.emit('RESUME_GLOBAL_MUSIC');
    };
  }, [musicMuted]));

  useEffect(() => { loadLevel(); }, []);

  // Auto-save
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const d = JSON.stringify(buildData());
        await AsyncStorage.setItem('current_level_draft', d);
        if (levelId) await AsyncStorage.setItem(levelId, d);
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [name, grid, balls, curves, curveRotations, selectedBucket]);

  // ── AUDIO ─────────────────────────────────────────────────────────────────
  const playBack  = () => { try { backPlayer.seekTo(0);  backPlayer.play();  } catch {} };
  const playStart = () => { try { startPlayer.seekTo(0); startPlayer.play(); } catch {} };

  // ── HISTORY ───────────────────────────────────────────────────────────────
  const saveToHistory = (g: GridCell[][], c: CurvePoint[][], rot: number[]) => {
    historyRef.current = historyRef.current.slice(0, histIdxRef.current + 1);
    historyRef.current.push({
      grid: JSON.parse(JSON.stringify(g)),
      curves: JSON.parse(JSON.stringify(c)),
      rotations: [...rot],
    });
    histIdxRef.current = historyRef.current.length - 1;
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      histIdxRef.current = historyRef.current.length - 1;
    }
  };

  const undo = () => {
    if (histIdxRef.current > 0) {
      histIdxRef.current--;
      const snap = historyRef.current[histIdxRef.current];
      setGrid(JSON.parse(JSON.stringify(snap.grid)));
      setCurves(JSON.parse(JSON.stringify(snap.curves)));
      setCurveRotations([...snap.rotations]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const redo = () => {
    if (histIdxRef.current < historyRef.current.length - 1) {
      histIdxRef.current++;
      const snap = historyRef.current[histIdxRef.current];
      setGrid(JSON.parse(JSON.stringify(snap.grid)));
      setCurves(JSON.parse(JSON.stringify(snap.curves)));
      setCurveRotations([...snap.rotations]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // ── DATA ──────────────────────────────────────────────────────────────────
  const buildData = (): LevelData => ({
    name, grid, balls,
    curves,
    curveRotations,
    bucketSkin: selectedBucket,
  });

  const loadLevel = async () => {
    try {
      const lid = await AsyncStorage.getItem('current_level_id');
      setLevelId(lid);
      const d = await AsyncStorage.getItem('current_level_draft');
      if (d) {
        const data: LevelData = JSON.parse(d);
        setName(data.name || 'My Level');
        if (data.grid?.length) setGrid(data.grid);
        if (data.balls) setBalls(data.balls);
        if (data.curves) setCurves(data.curves);
        if (data.curveRotations) setCurveRotations(data.curveRotations);
        else setCurveRotations((data.curves || []).map(() => 0));
        if (data.bucketSkin) setSelectedBucket(data.bucketSkin as any);
        const g2 = data.grid || emptyGrid();
        const c2 = data.curves || [];
        const r2 = data.curveRotations || c2.map(() => 0);
        historyRef.current = [{ grid: JSON.parse(JSON.stringify(g2)), curves: JSON.parse(JSON.stringify(c2)), rotations: [...r2] }];
        histIdxRef.current = 0;
      }
    } catch {}
  };

  const handleSave = async () => {
    try {
      const d = buildData();
      await AsyncStorage.setItem('current_level_draft', JSON.stringify(d));
      if (levelId) await AsyncStorage.setItem(levelId, JSON.stringify(d));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved!', 'Level saved locally');
    } catch { Alert.alert('Error', 'Failed to save level'); }
  };

  const handleClear = () => {
    Alert.alert('Clear Grid?', 'Delete all elements and curves.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        saveToHistory(grid, curves, curveRotations);
        setGrid(emptyGrid()); setCurves([]); setCurveRotations([]); setSelectedCurve(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }},
    ]);
  };

  // ── PLAY TEST (sets isPlaytest flag) ──────────────────────────────────────
  const handlePlayTest = async () => {
    const skrCount = grid.flat().filter(c => c === 'peg_gold').length;
    if (skrCount === 0) {
      Alert.alert('Missing SKR!', 'You need at least one SKR peg in the level to play!');
      return;
    }
    try {
      const d = buildData();
      await AsyncStorage.setItem('current_level_draft', JSON.stringify(d));
      if (levelId) await AsyncStorage.setItem(levelId, JSON.stringify(d));
      await AsyncStorage.setItem('is_playtest', '1');
    } catch {}
    router.push('/test-play');
  };

  // ── CURVE BUILDER (A→B with Bézier) ──────────────────────────────────────
  const buildCurveTrack = (sR: number, sC: number, eR: number, eC: number) => {
    saveToHistory(grid, curves, curveRotations);
    const distAB = Math.hypot(eR - sR, eC - sC);
    if (distAB < 1) return;
    // Simple quadratic Bézier from A to B with bulge perpendicular
    const midR = (sR + eR) / 2, midC = (sC + eC) / 2;
    const dr = eR - sR, dc = eC - sC;
    const bulge = 0.45;
    // Perpendicular offset
    const bulgeR = -dc * bulge;
    const bulgeC = dr * bulge;
    const controlR = midR + bulgeR, controlC = midC + bulgeC;
    const newCurve: CurvePoint[] = [];
    const SEGMENTS = 20;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;
      newCurve.push({
        r: (1-t)*(1-t)*sR + 2*(1-t)*t*controlR + t*t*eR,
        c: (1-t)*(1-t)*sC + 2*(1-t)*t*controlC + t*t*eC,
      });
    }
    setCurves([...curves, newCurve]);
    setCurveRotations([...curveRotations, 0]);
    setSelectedCurve(curves.length); // select newly created track
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ── ROTATE CURVE (apply rotation around center) ───────────────────────────
  const getRotatedCurvePoints = (pts: CurvePoint[], rotDeg: number): { x: number; y: number }[] => {
    if (pts.length === 0) return [];
    const gx = (col: number) => col * CELL + CELL/2 + 3;
    const gy = (row: number) => row * CELL + CELL/2 + 3;

    const pixPts = pts.map(p => ({ x: gx(p.c), y: gy(p.r) }));
    if (rotDeg === 0) return pixPts;

    // Find center of curve
    let cx = 0, cy = 0;
    for (const p of pixPts) { cx += p.x; cy += p.y; }
    cx /= pixPts.length; cy /= pixPts.length;

    const rad = (rotDeg * Math.PI) / 180;
    const cosA = Math.cos(rad), sinA = Math.sin(rad);
    return pixPts.map(p => ({
      x: cx + (p.x - cx) * cosA - (p.y - cy) * sinA,
      y: cy + (p.x - cx) * sinA + (p.y - cy) * cosA,
    }));
  };

  // ── 2x2 HELPERS ───────────────────────────────────────────────────────────
  const has2x2Space = (r: number, c: number, g: GridCell[][]): boolean => {
    if (r+1 >= ROWS || c+1 >= COLS) return false;
    return g[r][c]==='empty' && g[r][c+1]==='empty' && g[r+1][c]==='empty' && g[r+1][c+1]==='empty';
  };
  const place2x2 = (r: number, c: number, ng: GridCell[][], val: GridCell) => {
    ng[r][c] = ng[r][c+1] = ng[r+1][c] = ng[r+1][c+1] = val;
  };

  // ── TOGGLE CELL ───────────────────────────────────────────────────────────
  const toggleCell = (r: number, c: number) => {
    selectgPlayer.seekTo(0); selectgPlayer.play();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (tool === 'curve_track') {
      if (!curveStart) {
        setCurveStart({ r, c });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        buildCurveTrack(curveStart.r, curveStart.c, r, c);
        setCurveStart(null);
      }
      return;
    }

    // Teleport: two-tap flow — tap A then tap B
    if (tool === 'teleport_a') {
      if (!teleportStart) {
        setTeleportStart({ r, c });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        // Place A at first tap, B at second tap
        saveToHistory(grid, curves, curveRotations);
        const ng = grid.map(row => [...row]);
        ng[teleportStart.r][teleportStart.c] = 'teleport_a' as GridCell;
        ng[r][c] = 'teleport_b' as GridCell;
        setGrid(ng);
        setTeleportStart(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      return;
    }
    if (tool === 'bucket') { setShowBucketPicker(true); return; }

    saveToHistory(grid, curves, curveRotations);

    if (tool === 'empty') {
      // Also remove curves near this cell
      const nc = curves.filter((curve, ci) => {
        const shouldRemove = curve.some(pt => Math.hypot(pt.r - r, pt.c - c) < 1.8);
        return !shouldRemove;
      });
      if (nc.length !== curves.length) {
        const removedIndices = new Set<number>();
        curves.forEach((curve, ci) => {
          if (curve.some(pt => Math.hypot(pt.r - r, pt.c - c) < 1.8)) removedIndices.add(ci);
        });
        setCurves(nc);
        setCurveRotations(curveRotations.filter((_, i) => !removedIndices.has(i)));
        if (selectedCurve !== null && removedIndices.has(selectedCurve)) setSelectedCurve(null);
      }
      // FIX: if erasing a bumper_big cell, find and clear the entire 2x2 block
      if (grid[r][c] === 'bumper_big') {
        const ng = grid.map(row => [...row]);
        // Try all 4 possible top-left corners that could contain (r,c)
        for (let dr = 0; dr <= 1; dr++) for (let dc = 0; dc <= 1; dc++) {
          const tr = r - dr, tc = c - dc;
          if (tr >= 0 && tc >= 0 && tr + 1 < ROWS && tc + 1 < COLS &&
              ng[tr][tc] === 'bumper_big' && ng[tr][tc+1] === 'bumper_big' &&
              ng[tr+1][tc] === 'bumper_big' && ng[tr+1][tc+1] === 'bumper_big') {
            ng[tr][tc] = ng[tr][tc+1] = ng[tr+1][tc] = ng[tr+1][tc+1] = 'empty';
          }
        }
        setGrid(ng);
        return; // done, skip the generic single-cell toggle below
      }
    }

    const ng = grid.map(row => [...row]);

    if (tool === 'bumper_big') {
      if (grid[r][c] === 'bumper_big') {
        for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) {
          const nr = r+dr, nc2 = c+dc;
          if (nr >= 0 && nc2 >= 0 && nr+1 < ROWS && nc2+1 < COLS &&
              ng[nr][nc2]==='bumper_big' && ng[nr][nc2+1]==='bumper_big' &&
              ng[nr+1][nc2]==='bumper_big' && ng[nr+1][nc2+1]==='bumper_big') {
            ng[nr][nc2] = ng[nr][nc2+1] = ng[nr+1][nc2] = ng[nr+1][nc2+1] = 'empty';
          }
        }
      } else if (has2x2Space(r, c, grid)) {
        place2x2(r, c, ng, 'bumper_big');
      } else {
        let placed = false;
        for (let dr = 0; dr >= -1 && !placed; dr--)
          for (let dc = 0; dc >= -1 && !placed; dc--) {
            const nr = r+dr, nc2 = c+dc;
            if (nr >= 0 && nc2 >= 0 && has2x2Space(nr, nc2, grid)) {
              place2x2(nr, nc2, ng, 'bumper_big');
              placed = true;
            }
          }
        if (!placed) { Alert.alert('No space!', 'BigStar requires a 2x2 free area.'); return; }
      }
    } else {
      ng[r][c] = ng[r][c] === tool ? 'empty' : tool;
    }
    setGrid(ng);
  };

  // ── STATS ─────────────────────────────────────────────────────────────────
  const countPegs = () => {
    let red=0, blue=0, gold=0, w=0;
    grid.forEach(row => row.forEach(cell => {
      if (cell==='peg_red') red++;
      else if (cell==='peg_blue') blue++;
      else if (cell==='peg_gold') gold++;
      else if (cell==='obstacle') w++;
    }));
    return { red, blue, gold, w };
  };
  const stats = countPegs();

  // ── CURVE PATHS FOR EDITOR (with rotation) ────────────────────────────────
  const editorCurvePaths = curves.map((pts, ci) => {
    const rot = curveRotations[ci] || 0;
    const rotPts = getRotatedCurvePoints(pts, rot);
    const path = Skia.Path.Make();
    if (rotPts.length > 0) {
      path.moveTo(rotPts[0].x, rotPts[0].y);
      if (rotPts.length > 2) {
        for (let i = 1; i < rotPts.length - 1; i++) {
          const cx3 = (rotPts[i].x + rotPts[i+1].x) / 2;
          const cy3 = (rotPts[i].y + rotPts[i+1].y) / 2;
          path.quadTo(rotPts[i].x, rotPts[i].y, cx3, cy3);
        }
        path.lineTo(rotPts[rotPts.length-1].x, rotPts[rotPts.length-1].y);
      } else if (rotPts.length === 2) {
        path.lineTo(rotPts[1].x, rotPts[1].y);
      }
    }
    return path;
  });

  // Endpoint markers for selected curve
  const selectedCurveEndpoints = selectedCurve !== null && curves[selectedCurve] ? (() => {
    const pts = curves[selectedCurve];
    const rot = curveRotations[selectedCurve] || 0;
    const rotPts = getRotatedCurvePoints(pts, rot);
    if (rotPts.length < 2) return null;
    return {
      a: rotPts[0],
      b: rotPts[rotPts.length - 1],
    };
  })() : null;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex:1 }}>
    <ImageBackground source={require('../assets/images/Peg/wallpaper/editor.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover">
      <LinearGradient colors={['rgba(10,0,30,0.85)','rgba(5,0,50,0.80)','rgba(8,0,24,0.88)']} style={StyleSheet.absoluteFill}/>
    </ImageBackground>
    {/* Ambient glow blobs */}
    <View style={{position:'absolute',top:-60,left:-60,width:220,height:220,borderRadius:110,backgroundColor:'rgba(153,69,255,0.15)'}} pointerEvents="none"/>
    <View style={{position:'absolute',top:80,right:-40,width:160,height:160,borderRadius:80,backgroundColor:'rgba(0,212,255,0.12)'}} pointerEvents="none"/>
    <View style={{position:'absolute',bottom:100,left:20,width:140,height:140,borderRadius:70,backgroundColor:'rgba(255,140,0,0.10)'}} pointerEvents="none"/>
    <SafeAreaView style={{ flex:1 }}>

    {/* HEADER */}
    <View style={st.header}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={st.exitText}>← EXIT</Text>
      </TouchableOpacity>
      <TextInput value={name} onChangeText={setName} style={st.nameInput} placeholderTextColor={C.textMuted}/>
      <View style={{ flexDirection:'row', gap:6 }}>
        <TouchableOpacity onPress={() => {
          const next = !musicMuted; setMusicMuted(next);
          AsyncStorage.setItem('global_muted', next ? '1' : '0');
          try { next ? editMusicPlayer.pause?.() : editMusicPlayer.play(); } catch {}
        }} style={st.iconBtn}>
          <Text style={{ fontSize:15 }}>{musicMuted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowTutorial(true)} style={st.iconBtn}>
          <Text style={{ fontSize:17 }}>❓</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSave} style={st.saveBtn}>
          <Text style={st.saveBtnText}>SAVE</Text>
        </TouchableOpacity>
      </View>
    </View>

    <ScrollView style={{ flex:1 }} showsVerticalScrollIndicator={false}>

    {/* TOOLBAR */}
    <View style={{ padding:12 }}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <Text style={st.toolLabel}>{curveStart ? '📍 TAP THE END POINT (B)' : teleportStart ? '🔵 NOW TAP EXIT POINT (B)' : 'SELECT TOOL'}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection:'row', gap:10 }}>
          {Object.entries(ELEMENTS).map(([key, el]) => {
            const sel = tool === key;
            const imgSrc = key === 'bucket'
              ? (selectedBucket === 'bucket2' ? require('../assets/images/Peg/bucket2.png')
               : selectedBucket === 'bucket3' ? require('../assets/images/Peg/bucket3.png')
               : require('../assets/images/Peg/bucket.png'))
              : el.image;
            return (
              <TouchableOpacity key={key}
                onPress={() => {
                  setTool(key as GridCell);
                  setCurveStart(null);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  selecttPlayer.seekTo(0); selecttPlayer.play();
                  if (key === 'bucket') setShowBucketPicker(true);
                }}
                style={[st.toolBtn, {
                  borderColor: sel ? C.cyan : 'rgba(255,255,255,0.06)',
                  backgroundColor: sel ? 'rgba(0,229,255,0.12)' : C.surface,
                  borderWidth: sel ? 2 : 1,
                }]}>
                {key === 'teleport_a' ? (
                  <Image source={require('../assets/images/Peg/TeleportA.png')} style={st.toolIcon}/>
                ) : imgSrc ? (
                  <Image source={imgSrc} style={st.toolIcon}/>
                ) : (
                  <Text style={{ fontSize:30 }}>{el.emoji}</Text>
                )}
                {el.size === '2x2' && (
                  <View style={st.sizeBadge}><Text style={st.sizeBadgeText}>2x2</Text></View>
                )}
                <Text style={[st.toolName, { color: sel ? C.cyan : C.textMuted }]}>{el.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {ELEMENTS[tool]?.desc && (
        <View style={st.descBox}>
          <Text style={st.descText}>{ELEMENTS[tool].desc}</Text>
        </View>
      )}
    </View>

    {/* STATS & BALLS */}
    <View style={{ paddingHorizontal:12, marginBottom:10, flexDirection:'row', gap:8 }}>
      <View style={st.statCard}>
        <Text style={st.statTitle}>BALLS</Text>
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <TouchableOpacity onPress={() => setBalls(Math.max(1, balls-1))}><Text style={st.bigBtn}>-</Text></TouchableOpacity>
          <Text style={st.statVal}>{balls}</Text>
          <TouchableOpacity onPress={() => setBalls(Math.min(50, balls+1))}><Text style={st.bigBtn}>+</Text></TouchableOpacity>
        </View>
      </View>
      <View style={[st.statCard, { flex:2, justifyContent:'center' }]}>
        <View style={{ flexDirection:'row', justifyContent:'space-around' }}>
          <Text style={{ color:C.orange, fontSize:11, fontWeight:'bold', fontFamily:'monospace' }}>BTC:{stats.red}</Text>
          <Text style={{ color:C.blue,   fontSize:11, fontWeight:'bold', fontFamily:'monospace' }}>SOL:{stats.blue}</Text>
          <Text style={{ color:C.gold,   fontSize:11, fontWeight:'bold', fontFamily:'monospace' }}>SKR:{stats.gold}</Text>
          <Text style={{ color:C.gray,   fontSize:11, fontWeight:'bold', fontFamily:'monospace' }}>W:{stats.w}</Text>
        </View>
        <Text style={{ color:C.textMuted, fontSize:8, fontFamily:'monospace', textAlign:'center', marginTop:4 }}>
          Hit all SKR pegs to complete the level
        </Text>
      </View>
    </View>

    {/* ═══════════════════════════════════════════════════════════════════════
        BLUEPRINT GRID
       ═══════════════════════════════════════════════════════════════════════ */}
    <View style={st.gridWrapper}>
      {/* Blueprint outer border with glow */}
      <View style={st.blueprintFrame}>
        {/* Column labels */}
        <View style={st.colLabels}>
          {Array.from({ length: COLS }).map((_, c) => (
            <View key={`cl${c}`} style={{ width: CELL, alignItems:'center' }}>
              <Text style={st.coordText}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection:'row' }}>
          {/* Row labels */}
          <View style={st.rowLabels}>
            {Array.from({ length: ROWS }).map((_, r) => (
              <View key={`rl${r}`} style={{ height: CELL, justifyContent:'center', alignItems:'center', width:18 }}>
                <Text style={st.coordText}>{r}</Text>
              </View>
            ))}
          </View>

          {/* Grid */}
          <View style={st.gridInner}>
            {/* Skia overlay: curves + grid dots + A/B markers */}
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              {/* Grid intersection dots */}
              {Array.from({ length: ROWS + 1 }).map((_, r) =>
                Array.from({ length: COLS + 1 }).map((_, c) => (
                  <SkiaCircle
                    key={`dot${r}_${c}`}
                    cx={c * CELL + 3} cy={r * CELL + 3}
                    r={1.2}
                    color={C.gridDot}
                  />
                ))
              )}

              {/* Curve paths */}
              {editorCurvePaths.map((p, i) => {
                const isSelected = selectedCurve === i;
                return (
                  <SkiaPath key={`cp${i}`} path={p}
                    color={isSelected ? '#9B30FF' : '#CC00FF'}
                    style="stroke" strokeWidth={isSelected ? 14 : 12}
                    strokeJoin="round" strokeCap="round"
                    opacity={isSelected ? 1 : 0.75}
                  />
                );
              })}

              {/* A/B endpoint markers for selected curve */}
              {selectedCurveEndpoints && (
                <>
                  <SkiaCircle cx={selectedCurveEndpoints.a.x} cy={selectedCurveEndpoints.a.y} r={8} color="rgba(0,255,136,0.8)"/>
                  <SkiaCircle cx={selectedCurveEndpoints.b.x} cy={selectedCurveEndpoints.b.y} r={8} color="rgba(255,69,180,0.8)"/>
                </>
              )}
            </Canvas>

            {/* Grid cells */}
            {grid.map((row, r) => (
              <View key={r} style={{ flexDirection:'row' }}>
                {row.map((cell, c) => {
                  const el = ELEMENTS[cell];
                  const isCurveStart = curveStart?.r === r && curveStart?.c === c;
                  const isTeleportStart = teleportStart?.r === r && teleportStart?.c === c;
                  const isPortalA = cell === 'teleport_a';
                  const isPortalB = cell === 'teleport_b';
                  const isBig = cell === 'bumper_big';
                  const aboveIsBig = r > 0 && grid[r-1]?.[c] === 'bumper_big';
                  const leftIsBig  = c > 0 && grid[r]?.[c-1] === 'bumper_big';
                  const isBigTopLeft = isBig && !aboveIsBig && !leftIsBig;
                  const isBigPeg = cell==='peg_red' || cell==='peg_blue' || cell==='peg_gold' || cell==='bumper';
                  const imgSize = isBigPeg ? CELL * 1.05 : CELL * 0.85;

                  return (
                    <TouchableOpacity key={c} onPress={() => toggleCell(r, c)} activeOpacity={0.6}
                      style={{
                        width: CELL, height: CELL,
                        justifyContent:'center', alignItems:'center',
                        borderWidth: 0.5,
                        borderColor: isCurveStart ? '#00FF88' : isTeleportStart ? '#00D4FF' : C.gridLine,
                        backgroundColor: isCurveStart ? 'rgba(0,255,136,0.2)' : isTeleportStart ? 'rgba(0,229,255,0.2)' : 'transparent',
                        overflow:'visible', zIndex: isBigTopLeft ? 10 : 1,
                      }}>
                      {isBigTopLeft ? (
                        <Image source={ELEMENTS['bumper_big'].image}
                          style={{ position:'absolute', top:0, left:0, width:CELL*2, height:CELL*2, resizeMode:'contain', zIndex:10 }}/>
                      ) : isBig ? null : isPortalA ? (
                        <View style={{ width:CELL*0.72, height:CELL*0.72, borderRadius:CELL*0.36, backgroundColor:'rgba(0,229,255,0.25)', borderWidth:2.5, borderColor:'#00D4FF', alignItems:'center', justifyContent:'center' }}>
                          <Text style={{ color:'#00D4FF', fontSize:10, fontWeight:'900', fontFamily:'monospace' }}>A</Text>
                        </View>
                      ) : isPortalB ? (
                        <View style={{ width:CELL*0.72, height:CELL*0.72, borderRadius:CELL*0.36, backgroundColor:'rgba(255,107,0,0.25)', borderWidth:2.5, borderColor:'#FF6B00', alignItems:'center', justifyContent:'center' }}>
                          <Text style={{ color:'#FF6B00', fontSize:10, fontWeight:'900', fontFamily:'monospace' }}>B</Text>
                        </View>
                      ) : (
                        cell !== 'empty' && el?.image ? (
                          <Image source={el.image} style={{ width:imgSize, height:imgSize, resizeMode:'contain' }}/>
                        ) : cell !== 'empty' && el?.emoji ? (
                          <Text style={{ fontSize:CELL*0.65 }}>{el.emoji}</Text>
                        ) : null
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>

    {/* ═══════════════════════════════════════════════════════════════════════
        TRACK ROTATION PANEL
       ═══════════════════════════════════════════════════════════════════════ */}
    {curves.length > 0 && (
      <View style={st.rotationPanel}>
        <Text style={st.rotationTitle}>TRACK CONTROLS</Text>

        {/* Track selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:10 }}>
          <View style={{ flexDirection:'row', gap:8 }}>
            {curves.map((_, i) => (
              <TouchableOpacity key={`tc${i}`}
                onPress={() => {
                  setSelectedCurve(selectedCurve === i ? null : i);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[st.trackChip, selectedCurve === i && st.trackChipActive]}>
                <Text style={[st.trackChipText, selectedCurve === i && { color: '#9B30FF' }]}>
                  Track {i + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Rotation slider */}
        {selectedCurve !== null && (
          <View>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <Text style={st.sliderLabel}>ROTATION</Text>
              <Text style={st.sliderValue}>{Math.round(curveRotations[selectedCurve] || 0)}°</Text>
            </View>
            <Slider
              style={{ width:'100%', height:36 }}
              minimumValue={-180}
              maximumValue={180}
              step={1}
              value={curveRotations[selectedCurve] || 0}
              onValueChange={(val) => {
                const newRots = [...curveRotations];
                newRots[selectedCurve!] = val;
                setCurveRotations(newRots);
              }}
              onSlidingComplete={() => {
                saveToHistory(grid, curves, curveRotations);
              }}
              minimumTrackTintColor="#9B30FF"
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor="#9B30FF"
            />
            {/* MOVE TRACK: nudge by 1 cell in any direction */}
            <View style={{ marginTop:10, marginBottom:4 }}>
              <Text style={[st.sliderLabel, { marginBottom:6 }]}>MOVE TRACK</Text>
              {/* Up/Down row */}
              <View style={{ alignItems:'center', marginBottom:4 }}>
                <TouchableOpacity onPress={() => {
                  if(selectedCurve===null) return;
                  saveToHistory(grid, curves, curveRotations);
                  const nc=[...curves]; nc[selectedCurve]=nc[selectedCurve].map(pt=>({...pt,r:pt.r-1}));
                  setCurves(nc);
                }} style={st.moveBtn}><Text style={st.moveBtnText}>▲</Text></TouchableOpacity>
              </View>
              <View style={{ flexDirection:'row', justifyContent:'center', gap:8, marginBottom:4 }}>
                <TouchableOpacity onPress={() => {
                  if(selectedCurve===null) return;
                  saveToHistory(grid, curves, curveRotations);
                  const nc=[...curves]; nc[selectedCurve]=nc[selectedCurve].map(pt=>({...pt,c:pt.c-1}));
                  setCurves(nc);
                }} style={st.moveBtn}><Text style={st.moveBtnText}>◀</Text></TouchableOpacity>
                <View style={{ width:40 }}/>
                <TouchableOpacity onPress={() => {
                  if(selectedCurve===null) return;
                  saveToHistory(grid, curves, curveRotations);
                  const nc=[...curves]; nc[selectedCurve]=nc[selectedCurve].map(pt=>({...pt,c:pt.c+1}));
                  setCurves(nc);
                }} style={st.moveBtn}><Text style={st.moveBtnText}>▶</Text></TouchableOpacity>
              </View>
              <View style={{ alignItems:'center' }}>
                <TouchableOpacity onPress={() => {
                  if(selectedCurve===null) return;
                  saveToHistory(grid, curves, curveRotations);
                  const nc=[...curves]; nc[selectedCurve]=nc[selectedCurve].map(pt=>({...pt,r:pt.r+1}));
                  setCurves(nc);
                }} style={st.moveBtn}><Text style={st.moveBtnText}>▼</Text></TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop:2 }}>
              <TouchableOpacity onPress={() => {
                const newRots = [...curveRotations];
                newRots[selectedCurve!] = 0;
                setCurveRotations(newRots);
                saveToHistory(grid, curves, newRots);
              }} style={st.resetRotBtn}>
                <Text style={st.resetRotText}>RESET 0°</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => {
                Alert.alert('Delete Track?', `Remove Track ${selectedCurve! + 1}?`, [
                  { text:'Cancel', style:'cancel' },
                  { text:'Delete', style:'destructive', onPress:() => {
                    saveToHistory(grid, curves, curveRotations);
                    const nc = curves.filter((_, i) => i !== selectedCurve);
                    const nr = curveRotations.filter((_, i) => i !== selectedCurve);
                    setCurves(nc); setCurveRotations(nr); setSelectedCurve(null);
                  }},
                ]);
              }} style={st.deleteTrackBtn}>
                <Text style={st.deleteTrackText}>DELETE TRACK</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    )}

    {/* FOOTER */}
    <View style={st.footer}>
      <TouchableOpacity onPress={() => { playBack(); undo(); }} activeOpacity={0.75} style={st.undoBtn}>
        <Text style={st.undoBtnText}>↩{'\n'}UNDO</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { playBack(); redo(); }} activeOpacity={0.75} style={st.redoBtn}>
        <Text style={st.redoBtnText}>↪{'\n'}REDO</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { playStart(); handlePlayTest(); }} activeOpacity={0.8} style={st.playBtn}>
        <Text style={st.playBtnText}>▶  PLAY TEST</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleClear} activeOpacity={0.75} style={st.clearBtn}>
        <Image source={require('../assets/images/tools/bin.png')} style={{ width:26, height:26, resizeMode:'contain' }}/>
      </TouchableOpacity>
    </View>

    </ScrollView>
    </SafeAreaView>

    <Tutorial visible={showTutorial} onClose={() => setShowTutorial(false)}/>

    {/* BUCKET SKIN PICKER */}
    <Modal visible={showBucketPicker} transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.78)', justifyContent:'center', alignItems:'center' }}>
        <View style={{ backgroundColor:'#0D0040', borderRadius:20, padding:24, width:'82%', borderWidth:1.5, borderColor:'rgba(0,212,255,0.4)' }}>
          <Text style={{ color:C.cyan, fontSize:18, fontWeight:'900', fontFamily:'monospace', textAlign:'center', marginBottom:6 }}>CHOOSE BUCKET</Text>
          <Text style={{ color:C.textMuted, fontSize:10, fontFamily:'monospace', textAlign:'center', marginBottom:18 }}>Select which bucket will appear in your level</Text>
          <View style={{ flexDirection:'row', justifyContent:'space-around', marginBottom:20 }}>
            {(['bucket','bucket2','bucket3'] as const).map(bk => (
              <TouchableOpacity key={bk}
                onPress={() => { setSelectedBucket(bk); setShowBucketPicker(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                style={{ alignItems:'center', padding:10, borderRadius:12, borderWidth:2,
                  borderColor: selectedBucket===bk ? C.cyan : 'rgba(255,255,255,0.15)',
                  backgroundColor: selectedBucket===bk ? 'rgba(0,229,255,0.1)' : 'transparent' }}>
                <Image source={
                  bk==='bucket'  ? require('../assets/images/Peg/bucket.png') :
                  bk==='bucket2' ? require('../assets/images/Peg/bucket2.png') :
                                   require('../assets/images/Peg/bucket3.png')
                } style={{ width:72, height:38, resizeMode:'contain' }}/>
                <Text style={{ color: selectedBucket===bk ? C.cyan : C.textMuted, fontSize:9, fontFamily:'monospace', marginTop:6 }}>
                  {bk==='bucket'?'CLASSIC':bk==='bucket2'?'ENERGY':'LAVA'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setShowBucketPicker(false)}
            style={{ padding:12, borderRadius:10, backgroundColor:'rgba(255,255,255,0.06)', alignItems:'center' }}>
            <Text style={{ color:C.textMuted, fontWeight:'bold', fontFamily:'monospace' }}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12,
    borderBottomWidth:3, borderBottomColor:'rgba(255,140,0,0.45)',
    backgroundColor:'rgba(0,0,0,0.45)' },
  exitText: { color:'#FF8C00', fontSize:13, fontWeight:'900', fontFamily:'monospace',
    textShadowColor:'rgba(255,140,0,0.5)',textShadowRadius:8 },
  nameInput: { color:'#FFE600', fontSize:14, fontWeight:'900', fontFamily:'monospace', textAlign:'center', minWidth:140,
    textShadowColor:'rgba(255,230,0,0.4)',textShadowRadius:6 },
  iconBtn: { backgroundColor:'rgba(0,212,255,0.15)', paddingHorizontal:10, paddingVertical:8,
    borderRadius:10, borderWidth:2, borderColor:'rgba(0,212,255,0.50)',
    shadowColor:'#00D4FF',shadowRadius:6,shadowOpacity:0.4 },
  saveBtn: { backgroundColor:'#00F0B5', paddingHorizontal:15, paddingVertical:8,
    borderRadius:12, flexDirection:'row', alignItems:'center', gap:6,
    shadowColor:'#00F0B5', shadowRadius:14, shadowOpacity:1, elevation:10,
    borderWidth:2, borderColor:'rgba(255,255,255,0.3)' },
  saveBtnText: { color:'#000', fontWeight:'900', fontFamily:'monospace', fontSize:12 },
  toolLabel: { color:'#FFE600', fontSize:10, fontFamily:'monospace', letterSpacing:1.5, fontWeight:'900',
    textShadowColor:'rgba(255,230,0,0.5)',textShadowRadius:6 },
  toolBtn: { width:100, height:120, borderRadius:18, justifyContent:'center', alignItems:'center', paddingVertical:6 },
  toolIcon: { width:72, height:72, resizeMode:'contain' },
  toolName: { fontSize:10, fontFamily:'monospace', marginTop:4, fontWeight:'900' },
  sizeBadge: { position:'absolute', top:4, right:4, backgroundColor:'#00F0B5', borderRadius:5, paddingHorizontal:3,
    shadowColor:'#00F0B5',shadowRadius:4,shadowOpacity:0.8 },
  sizeBadgeText: { color:'#000', fontSize:7, fontWeight:'900', fontFamily:'monospace' },
  descBox: { marginTop:8, backgroundColor:'rgba(255,140,0,0.10)', borderRadius:12, padding:10,
    borderLeftWidth:3, borderLeftColor:'#FF8C00' },
  descText: { color:'rgba(255,255,255,0.75)', fontSize:10, fontFamily:'monospace', fontStyle:'italic' },
  statCard: { flex:1, backgroundColor:'rgba(255,230,0,0.08)', borderRadius:14, padding:12,
    borderWidth:2.5, borderColor:'rgba(255,230,0,0.35)',
    shadowColor:'#FFE600',shadowRadius:8,shadowOpacity:0.3 },
  statTitle: { color:'rgba(255,230,0,0.7)', fontSize:9, fontFamily:'monospace', marginBottom:4, fontWeight:'900' },
  statVal: { color:'#FFE600', fontSize:18, fontWeight:'900', fontFamily:'monospace',
    textShadowColor:'rgba(255,230,0,0.5)',textShadowRadius:6 },
  bigBtn: { color:'#FF8C00', fontSize:22, fontWeight:'900',
    textShadowColor:'rgba(255,140,0,0.6)',textShadowRadius:8 },
  gridWrapper: { paddingHorizontal:6, alignItems:'center', position:'relative' },
  blueprintFrame: {
    backgroundColor:'rgba(8,12,40,0.95)', borderRadius:12, padding:2, paddingLeft:0, paddingTop:0,
    borderWidth:2.5, borderColor:'rgba(0,212,255,0.65)',
    shadowColor:'#00D4FF', shadowOffset:{width:0,height:0}, shadowOpacity:0.7, shadowRadius:22, elevation:14,
  },
  colLabels: { flexDirection:'row', paddingLeft:20, marginBottom:2 },
  rowLabels: { width:18, marginRight:2 },
  coordText: { color:'rgba(0,212,255,0.55)', fontSize:7, fontFamily:'monospace', fontWeight:'900', textAlign:'center' },
  gridInner: { backgroundColor:'rgba(4,8,30,0.95)', borderRadius:8, padding:2 },
  rotationPanel: {
    marginHorizontal:12, marginTop:12, padding:16,
    backgroundColor:'rgba(153,69,255,0.15)', borderRadius:18,
    borderWidth:2.5, borderColor:'rgba(153,69,255,0.55)',
    shadowColor:'#9945FF',shadowRadius:12,shadowOpacity:0.4,
  },
  rotationTitle: { color:'#9945FF', fontSize:11, fontWeight:'900', fontFamily:'monospace', letterSpacing:1.5, marginBottom:10,
    textShadowColor:'rgba(153,69,255,0.6)',textShadowRadius:6 },
  trackChip: { paddingHorizontal:14, paddingVertical:8, borderRadius:12,
    borderWidth:2, borderColor:'rgba(255,255,255,0.18)', backgroundColor:'rgba(255,255,255,0.07)' },
  trackChipActive: { borderColor:'#9945FF', backgroundColor:'rgba(153,69,255,0.25)',
    shadowColor:'#9945FF',shadowRadius:8,shadowOpacity:0.6 },
  trackChipText: { color:'rgba(255,255,255,0.6)', fontSize:11, fontWeight:'900', fontFamily:'monospace' },
  sliderLabel: { color:'rgba(255,255,255,0.5)', fontSize:9, fontFamily:'monospace', letterSpacing:1 },
  sliderValue: { color:'#9945FF', fontSize:14, fontWeight:'900', fontFamily:'monospace',
    textShadowColor:'rgba(153,69,255,0.5)',textShadowRadius:6 },
  resetRotBtn: { paddingHorizontal:14, paddingVertical:7, borderRadius:10,
    backgroundColor:'rgba(255,255,255,0.08)', borderWidth:2, borderColor:'rgba(255,255,255,0.25)' },
  resetRotText: { color:'rgba(255,255,255,0.7)', fontSize:9, fontWeight:'900', fontFamily:'monospace' },
  deleteTrackBtn: { paddingHorizontal:14, paddingVertical:7, borderRadius:10,
    backgroundColor:'rgba(255,56,96,0.18)', borderWidth:2, borderColor:'rgba(255,56,96,0.55)',
    shadowColor:'#FF3860',shadowRadius:6,shadowOpacity:0.4 },
  deleteTrackText: { color:'#FF3860', fontSize:9, fontWeight:'900', fontFamily:'monospace' },
  moveBtn: { width:40, height:40, borderRadius:12,
    backgroundColor:'rgba(153,69,255,0.22)', borderWidth:2.5, borderColor:'rgba(153,69,255,0.60)',
    justifyContent:'center', alignItems:'center',
    shadowColor:'#9945FF',shadowRadius:6,shadowOpacity:0.5 },
  moveBtnText: { color:'#9945FF', fontSize:16, fontWeight:'900' },
  footer: { paddingHorizontal:12, paddingVertical:10, flexDirection:'row', gap:8, marginBottom:24, alignItems:'stretch' },
  undoBtn: { width:60, borderRadius:16, backgroundColor:'rgba(0,212,255,0.18)',
    borderWidth:2.5, borderColor:'rgba(0,212,255,0.6)', justifyContent:'center', alignItems:'center', paddingVertical:12,
    shadowColor:'#00D4FF',shadowRadius:8,shadowOpacity:0.5 },
  undoBtnText: { color:'#00D4FF', fontSize:13, fontWeight:'900', fontFamily:'monospace', textAlign:'center', lineHeight:20 },
  redoBtn: { width:60, borderRadius:16, backgroundColor:'rgba(0,240,181,0.18)',
    borderWidth:2.5, borderColor:'rgba(0,240,181,0.6)', justifyContent:'center', alignItems:'center', paddingVertical:12,
    shadowColor:'#00F0B5',shadowRadius:8,shadowOpacity:0.5 },
  redoBtnText: { color:'#00F0B5', fontSize:13, fontWeight:'900', fontFamily:'monospace', textAlign:'center', lineHeight:20 },
  playBtn: { flex:1, borderRadius:18, overflow:'hidden', backgroundColor:'#FF8C00',
    elevation:14, shadowColor:'#FF4D6D', shadowOffset:{width:0,height:6}, shadowOpacity:0.9, shadowRadius:20,
    justifyContent:'center', alignItems:'center', paddingVertical:16,
    borderWidth:2, borderColor:'rgba(255,255,255,0.25)' },
  playBtnText: { color:'#fff', fontWeight:'900', fontFamily:'monospace', fontSize:16, letterSpacing:1,
    textShadowColor:'rgba(0,0,0,0.4)', textShadowRadius:6 },
  clearBtn: { width:52, borderRadius:16, backgroundColor:'rgba(255,56,96,0.15)',
    borderWidth:2.5, borderColor:'rgba(255,56,96,0.5)', justifyContent:'center', alignItems:'center', paddingVertical:12 },
});
