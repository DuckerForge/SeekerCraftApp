// components/StickmanBuilder.tsx - Cosmic decorations for SeekerCraft home
import React, { useEffect, useRef } from 'react';
import { View, Dimensions, Animated } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// Singola stella/particella animata
function FloatingStar({ x, y, size, delay, color }: {
  x: number; y: number; size: number; delay: number; color: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale   = useRef(new Animated.Value(0.5)).current;
  const floatY  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0.9, duration: 1200 + delay * 100, useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 1.0, duration: 1200 + delay * 100, useNativeDriver: true }),
        Animated.timing(floatY,  { toValue: -6,  duration: 2000 + delay * 200, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0.2, duration: 1200 + delay * 100, useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 0.6, duration: 1200 + delay * 100, useNativeDriver: true }),
        Animated.timing(floatY,  { toValue: 0,   duration: 2000 + delay * 200, useNativeDriver: true }),
      ]),
    ]));
    const timeout = setTimeout(() => pulse.start(), delay * 150);
    return () => { clearTimeout(timeout); pulse.stop(); };
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x, top: y,
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ scale }, { translateY: floatY }],
        shadowColor: color,
        shadowRadius: size * 2,
        shadowOpacity: 0.8,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

// Piccolo satellite orbitante nell'angolo
function OrbitingDot({ cx, cy, radius, speed }: {
  cx: number; cy: number; radius: number; speed: number;
}) {
  const angle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(angle, { toValue: 1, duration: speed, useNativeDriver: true, isInteraction: false })
    ).start();
  }, []);

  const x = angle.interpolate({ inputRange: [0, 1], outputRange: [cx + radius, cx + radius] });
  // usiamo translateX e translateY separatamente tramite style calcolato
  return null; // semplificato - usiamo le stelle statiche animate
}

// Linea di codice binario decorativa (angolo basso a sinistra)
function BinaryDecor() {
  const opacity = useRef(new Animated.Value(0.15)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.35, duration: 3000, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.10, duration: 3000, useNativeDriver: true }),
    ])).start();
  }, []);
  const lines = ['01001010', '10110101', '00101110', '11010010', '01101001'];
  return (
    <Animated.View style={{ position:'absolute', left: 8, bottom: 100, opacity }}>
      {lines.map((l, i) => (
        <View key={i} style={{ flexDirection:'row', marginBottom: 3 }}>
          {l.split('').map((bit, j) => (
            <View key={j} style={{
              width: 6, height: 6, borderRadius: 1, marginRight: 2,
              backgroundColor: bit === '1' ? '#9945FF' : 'transparent',
              borderWidth: bit === '0' ? 1 : 0,
              borderColor: 'rgba(153,69,255,0.3)',
            }}/>
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

// Peg decorativo SKR nell'angolo in alto a destra
function PegDecor() {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 1.0,  duration: 800, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.00, duration: 800, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 0.6,  duration: 800, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);

  const pegs = [
    { x: SW - 50, y: SH * 0.25, size: 14, color: '#FFD700' },
    { x: SW - 28, y: SH * 0.27, size: 10, color: '#9945FF' },
    { x: SW - 64, y: SH * 0.30, size: 8,  color: '#14F195' },
    { x: SW - 40, y: SH * 0.33, size: 12, color: '#3B82F6' },
    { x: SW - 20, y: SH * 0.23, size: 7,  color: '#FF6B00' },
  ];

  return (
    <>
      {pegs.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: p.x, top: p.y,
          width: p.size, height: p.size, borderRadius: p.size / 2,
          backgroundColor: p.color,
          transform: [{ scale: i === 0 ? scale : 1 }],
          opacity: glow,
          shadowColor: p.color, shadowRadius: p.size, shadowOpacity: 0.9,
          shadowOffset: { width: 0, height: 0 },
        }}/>
      ))}
    </>
  );
}

const STARS = [
  { x: SW * 0.12, y: SH * 0.15, size: 3, delay: 0,  color: '#9945FF' },
  { x: SW * 0.88, y: SH * 0.08, size: 4, delay: 2,  color: '#FFD700' },
  { x: SW * 0.05, y: SH * 0.45, size: 2, delay: 4,  color: '#14F195' },
  { x: SW * 0.92, y: SH * 0.55, size: 3, delay: 1,  color: '#3B82F6' },
  { x: SW * 0.15, y: SH * 0.75, size: 5, delay: 3,  color: '#9945FF' },
  { x: SW * 0.78, y: SH * 0.72, size: 3, delay: 5,  color: '#FF6B00' },
  { x: SW * 0.50, y: SH * 0.05, size: 2, delay: 2,  color: '#14F195' },
  { x: SW * 0.33, y: SH * 0.92, size: 4, delay: 0,  color: '#FFD700' },
  { x: SW * 0.68, y: SH * 0.88, size: 2, delay: 6,  color: '#9945FF' },
  { x: SW * 0.02, y: SH * 0.62, size: 3, delay: 1,  color: '#3B82F6' },
];

export default function StickmanBuilder() {
  return (
    <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, pointerEvents:'none', opacity:0.65 }}>
      {/* Stelle fluttuanti */}
      {STARS.map((s, i) => (
        <FloatingStar key={i} x={s.x} y={s.y} size={s.size} delay={s.delay} color={s.color}/>
      ))}
      {/* Peg decorativi angolo destra */}
      <PegDecor/>
      {/* Binario decorativo angolo sinistro */}
      <BinaryDecor/>
    </View>
  );
}
