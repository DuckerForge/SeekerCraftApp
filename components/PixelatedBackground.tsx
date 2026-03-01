// components/PixelatedBackground.tsx - Sfondo artistico pixellato NO lag
import React, { useMemo } from 'react';
import { View, Dimensions } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// Pattern geometrico procedurale - NO copyright
const generatePattern = () => {
  const PIXEL = 20;
  const cols = Math.floor(SW / PIXEL);
  const rows = Math.floor(SH / PIXEL);
  
  const palette = [
    '#1e3a8a', '#3b82f6', '#60a5fa', '#93c5fd', // Blues
    '#7c2d12', '#ea580c', '#fb923c', '#fdba74', // Oranges
    '#713f12', '#ca8a04', '#fbbf24', '#fde047', // Golds
    '#14532d', '#16a34a', '#4ade80', '#86efac', // Greens
  ];

  const pixels: Array<{ x: number; y: number; color: string }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Pattern procedurale: onde + noise
      const wave = Math.sin(col * 0.3) * Math.cos(row * 0.2);
      const noise = (col * row * 7) % palette.length;
      
      // Solo ~30% dei pixel per performance
      if (Math.random() < 0.3) {
        pixels.push({
          x: col * PIXEL,
          y: row * PIXEL,
          color: palette[Math.floor((wave + noise) % palette.length)],
        });
      }
    }
  }

  return pixels;
};

export default function PixelatedBackground() {
  // Genera pattern una volta sola
  const pattern = useMemo(() => generatePattern(), []);

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0.15, // Molto trasparente
        pointerEvents: 'none',
      }}
    >
      {pattern.map((pixel, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: pixel.x,
            top: pixel.y,
            width: 20,
            height: 20,
            backgroundColor: pixel.color,
          }}
        />
      ))}
    </View>
  );
}
