// components/WallpaperBackground.tsx - Background con tutte le immagini disponibili
import React, { useState, useEffect, useRef } from 'react';
import { ImageBackground, Dimensions } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

const WALLPAPERS = [
  require('../assets/images/Peg/wallpaper/bear.jpg'),
  require('../assets/images/Peg/wallpaper/garden.jpeg'),
  require('../assets/images/Peg/wallpaper/icon.jpeg'),
  require('../assets/images/Peg/wallpaper/luna.jpg'),
  require('../assets/images/Peg/wallpaper/papera.jpg'),
  require('../assets/images/Peg/wallpaper/snake.jpg'),
  require('../assets/images/Peg/wallpaper/space.jpeg'),
  require('../assets/images/Peg/wallpaper/tropical.jpeg'),
  require('../assets/images/Peg/wallpaper/vulcano.jpeg'),
];

// Tiene traccia dell'ultimo indice usato per non ripetere
let _lastIndex = -1;

function getNextRandom(): number {
  if (WALLPAPERS.length === 1) return 0;
  let next: number;
  do {
    next = Math.floor(Math.random() * WALLPAPERS.length);
  } while (next === _lastIndex);
  _lastIndex = next;
  return next;
}

export default function WallpaperBackground() {
  const [wallpaper, setWallpaper] = useState(() => WALLPAPERS[getNextRandom()]);

  return (
    <ImageBackground
      source={wallpaper}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: SW,
        height: SH,
      }}
      resizeMode="cover"
      blurRadius={2}
      opacity={0.3}
    />
  );
}
