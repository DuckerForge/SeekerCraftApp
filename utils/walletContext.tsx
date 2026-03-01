// utils/walletContext.tsx
// REGOLA: legge AsyncStorage velocemente, poi lascia decidere alla login screen.
// NON chiama Firebase all'avvio. MAI.
import 'react-native-get-random-values'
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Buffer } from 'buffer'
import bs58 from 'bs58'
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import { getOrCreateUser, unlockAchievement, logActivity } from '@/utils/firebase'

global.Buffer = Buffer

const CLUSTER = 'mainnet-beta'

export interface WalletUser {
  walletAddress: string
  displayName: string
  avatarSeed: string
  totalScore: number
  levelsPlayed: number
  levelsCreated: number
  levelsCompleted: number
  minutesPlayed: number
  weeklyScore: number
  achievements: Record<string, number>
}

interface WalletContextType {
  connected: boolean
  user: WalletUser | null
  connecting: boolean
  sessionLoading: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  switchAccount: () => Promise<void>
  refreshUser: () => Promise<void>
  unlockAch: (key: string) => Promise<string | null>
}

const WalletContext = createContext<WalletContextType>({
  connected: false,
  user: null,
  connecting: false,
  sessionLoading: true,
  connect: async () => {},
  disconnect: async () => {},
  switchAccount: async () => {},
  refreshUser: async () => {},
  unlockAch: async () => null,
})

export const useWallet = () => useContext(WalletContext)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected,      setConnected]      = useState(false)
  const [user,           setUser]           = useState<WalletUser | null>(null)
  const [connecting,     setConnecting]     = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)

  // Legge AsyncStorage all'avvio (<10ms, locale, zero rete)
  // Se trova wallet → imposta sessione con dati base → aggiorna Firebase in background
  // L'utente NON deve premere connect se aveva già una sessione attiva
  useEffect(() => {
    AsyncStorage.getItem('wallet_address')
      .then(addr => {
        if (addr) {
          setUser({
            walletAddress: addr,
            displayName: `${addr.slice(0, 4)}...${addr.slice(-4)}`,
            avatarSeed: addr.slice(-8),
            totalScore: 0, levelsPlayed: 0, levelsCreated: 0,
            levelsCompleted: 0, minutesPlayed: 0, weeklyScore: 0,
            achievements: {},
          })
          setConnected(true)
          // Carica dati reali Firebase in background (non blocca)
          getOrCreateUser(addr)
            .then(data => setUser({ walletAddress: addr, ...data }))
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setSessionLoading(false))
  }, [])

  // connect() = chiamato SOLO dalla login screen al click del bottone
  // Stesso pattern identico a SKRBurner
  const connect = useCallback(async () => {
    if (connecting) return
    setConnecting(true)
    try {
      let addr = ''
      await transact(async (wallet: Web3MobileWallet) => {
        const auth = await wallet.authorize({
          cluster: CLUSTER,
          identity: { name: 'SeekerCraft', uri: 'https://seekercraft.app' },
        })
        addr = bs58.encode(Buffer.from(auth.accounts[0].address, 'base64'))
        // Save auth_token so we can properly deauthorize later (= force account picker on next connect)
        if (auth.auth_token) {
          await AsyncStorage.setItem('wallet_auth_token', auth.auth_token)
        }
      })
      if (!addr) throw new Error('No address from wallet')
      await AsyncStorage.setItem('wallet_address', addr)
      const userData = await getOrCreateUser(addr)
      setUser({ walletAddress: addr, ...userData })
      setConnected(true)
      // Achievement in background
      unlockAchievement(addr, 'first_login').then(isNew => {
        if (isNew) {
          try { (global as any).showAchievement?.('first_login') } catch {}
          logActivity(addr, userData.displayName, 'joined').catch(() => {})
        }
      }).catch(() => {})
      unlockAchievement(addr, 'beta_player').then(isNew => {
        if (isNew) try { (global as any).showAchievement?.('beta_player') } catch {}
      }).catch(() => {})
    } catch (err: any) {
      console.error('[WalletContext] connect:', err)
      Alert.alert('Connection Failed', err.message || 'Make sure Phantom / Solflare / Backpack is installed.')
    } finally {
      setConnecting(false)
    }
  }, [connecting])

  const disconnect = useCallback(async () => {
    // Deauthorize from the wallet app so the next connect() shows account picker
    const storedToken = await AsyncStorage.getItem('wallet_auth_token').catch(() => null)
    if (storedToken) {
      try {
        await transact(async (wallet: Web3MobileWallet) => {
          await wallet.deauthorize({ auth_token: storedToken })
        })
      } catch {
        // Ignore — wallet may already be closed or token expired
      }
    }
    await AsyncStorage.multiRemove(['wallet_address', 'wallet_auth_token'])
    setConnected(false)
    setUser(null)
  }, [])

  const switchAccount = useCallback(async () => {
    // Deauthorize current session so wallet shows account picker on next authorize
    const storedToken = await AsyncStorage.getItem('wallet_auth_token').catch(() => null)
    if (storedToken) {
      try {
        await transact(async (wallet: Web3MobileWallet) => {
          await wallet.deauthorize({ auth_token: storedToken })
        })
      } catch {}
    }
    await AsyncStorage.multiRemove(['wallet_address', 'wallet_auth_token'])
    setConnected(false)
    setUser(null)
    // Immediately re-connect — wallet will now prompt account selection
    await connect()
  }, [connect])

  const refreshUser = useCallback(async () => {
    const addr = user?.walletAddress
    if (!addr) return
    try {
      const data = await getOrCreateUser(addr)
      setUser({ walletAddress: addr, ...data })
    } catch {}
  }, [user])

  const unlockAch = useCallback(async (key: string): Promise<string | null> => {
    const addr = user?.walletAddress
    if (!addr) return null
    const ok = await unlockAchievement(addr, key)
    if (ok) { refreshUser(); return key }
    return null
  }, [user, refreshUser])

  return (
    <WalletContext.Provider value={{
      connected, user, connecting, sessionLoading,
      connect, disconnect, switchAccount, refreshUser, unlockAch,
    }}>
      {children}
    </WalletContext.Provider>
  )
}
