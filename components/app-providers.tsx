// components/app-providers.tsx (v3) – Global music + achievement toast
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { PropsWithChildren, DeviceEventEmitter } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { WalletProvider } from '@/utils/walletContext'
import AchievementToast from '@/components/AchievementToast'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAudioPlayer } from 'expo-audio'

// ── Global music player: main.mp3 loops across all screens ─────────────────
function GlobalMusicPlayer() {
  const player = useAudioPlayer(require('../assets/images/tools/main.mp3'))
  const shouldPlayRef = useRef(false)

  useEffect(() => {
    let mounted = true

    AsyncStorage.getItem('global_muted').then(v => {
      if (!mounted) return
      if (v !== '1') {
        shouldPlayRef.current = true
        try { player.loop = true; player.play() } catch {}
      }
    })

    const muteSub = DeviceEventEmitter.addListener('MUTE_CHANGED', ({ muted }: { muted: boolean }) => {
      try { muted ? player.pause?.() : (player.loop = true, player.play()) } catch {}
    })

    // Pause global music when a screen with own music takes over
    const pauseSub = DeviceEventEmitter.addListener('PAUSE_GLOBAL_MUSIC', () => {
      shouldPlayRef.current = false
      try { player.pause?.() } catch {}
    })

    // Resume global music when that screen exits
    const resumeSub = DeviceEventEmitter.addListener('RESUME_GLOBAL_MUSIC', () => {
      shouldPlayRef.current = true
      AsyncStorage.getItem('global_muted').then(v => {
        if (!shouldPlayRef.current) return // PAUSE fired while async was pending
        if (v !== '1') try { player.loop = true; player.play() } catch {}
      })
    })

    return () => {
      mounted = false
      muteSub.remove()
      pauseSub.remove()
      resumeSub.remove()
      try { player.pause?.() } catch {}
    }
  }, [])

  return null
}

// ── Achievement queue ───────────────────────────────────────────────────────
function InnerProviders({ children }: PropsWithChildren) {
  const [pendingAch, setPendingAch] = useState<string | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const shownRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    ;(global as any).showAchievement = (key: string) => {
      if (!key) return
      if (shownRef.current.has(key)) return
      shownRef.current.add(key)
      setQueue(prev => (prev.includes(key) ? prev : [...prev, key]))
      import('@react-native-async-storage/async-storage').then(({ default: AS }) => {
        AS.getItem('earnable_achievements').then(v => {
          const arr: string[] = v ? JSON.parse(v) : []
          if (!arr.includes(key))
            AS.setItem('earnable_achievements', JSON.stringify([...arr, key]))
        })
      })
    }
    return () => { delete (global as any).showAchievement }
  }, [])

  // Process queue with a small delay between toasts so they don't flash rapidly
  useEffect(() => {
    if (!pendingAch && queue.length > 0) {
      const t = setTimeout(() => {
        setQueue(prev => {
          if (prev.length === 0) return prev
          setPendingAch(prev[0])
          return prev.slice(1)
        })
      }, 600)
      return () => clearTimeout(t)
    }
  }, [pendingAch, queue])

  const handleDone = useCallback(() => setPendingAch(null), [])

  return (
    <>
      {children}
      <AchievementToast achievementKey={pendingAch} onDone={handleDone} />
    </>
  )
}

// ── Root export ─────────────────────────────────────────────────────────────
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <GlobalMusicPlayer />
        <InnerProviders>
          {children}
        </InnerProviders>
      </WalletProvider>
    </SafeAreaProvider>
  )
}
