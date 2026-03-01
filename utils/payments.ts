// utils/payments.ts - SeekerCraft payment system v3
// ALL payments are SOL-only (same pattern as SKR Burner app).
// Publish $1.00 (90% dev, 10% pool) | Achievement $0.50 (50% dev, 50% pool)
// Donation: variable (70% creator, 20% dev, 10% pool)
import { Buffer } from 'buffer'
import bs58 from 'bs58'
import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
import {
  Connection, PublicKey, Transaction, ComputeBudgetProgram,
  SystemProgram, LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

global.Buffer = global.Buffer || Buffer

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
export const SKR_MINT     = new PublicKey('SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3')
export const SKR_DECIMALS = 6
export const DEV_WALLET   = new PublicKey('qXhoL96gkzqe2KFMpVPseEWVzyzVUibw7YcXknUJQ85')
export const POOL_WALLET  = new PublicKey('EGEA1dTzyreEU7jyy9XjGfP7fnQbsGEytJD27qdjmhfz')
const heliusKey = Constants.expoConfig?.extra?.heliusApiKey ?? ''
export const HELIUS_RPC   = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
export const CLUSTER      = 'mainnet-beta' as const

// ─── PRICES ──────────────────────────────────────────────────────────────────
export const PUBLISH_FEE_USD     = 0.50
export const ACHIEVEMENT_FEE_USD = 0.50

// ─── TOKEN PRICES ────────────────────────────────────────────────────────────
let _skrPriceCache: { price: number; at: number } | null = null
let _solPriceCache: { price: number; at: number } | null = null

export const getSKRPriceUSD = async (): Promise<number> => {
  if (_skrPriceCache && Date.now() - _skrPriceCache.at < 60_000) return _skrPriceCache.price
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=seeker&vs_currencies=usd')
    const d = await r.json()
    const price = d?.seeker?.usd ?? 0.02
    _skrPriceCache = { price, at: Date.now() }
    return price
  } catch { return _skrPriceCache?.price ?? 0.02 }
}

export const getSOLPriceUSD = async (): Promise<number> => {
  if (_solPriceCache && Date.now() - _solPriceCache.at < 60_000) return _solPriceCache.price
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
    const d = await r.json()
    const price = d?.solana?.usd ?? 150
    _solPriceCache = { price, at: Date.now() }
    return price
  } catch { return _solPriceCache?.price ?? 150 }
}

// ─── DEVICE FINGERPRINT ───────────────────────────────────────────────────────
export const getDeviceFingerprint = async (): Promise<string> => {
  const cached = await AsyncStorage.getItem('device_fingerprint')
  if (cached) return cached
  try {
    const Device = await import('expo-device')
    const App    = await import('expo-application')
    const Crypto = await import('expo-crypto')
    const raw = `${Device.modelName}|${Device.osVersion}|${App.applicationId}`
    const fp  = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw)
    await AsyncStorage.setItem('device_fingerprint', fp)
    return fp
  } catch {
    const fp = Math.random().toString(36).slice(2)
    await AsyncStorage.setItem('device_fingerprint', fp)
    return fp
  }
}

// ─── TREASURY BALANCE ────────────────────────────────────────────────────────
export const getTreasuryBalance = async (): Promise<{ skrAmount: number; usdValue: number }> => {
  try {
    const conn = new Connection(HELIUS_RPC, 'confirmed')
    const ata = await getAssociatedTokenAddress(SKR_MINT, POOL_WALLET)
    const info = await conn.getTokenAccountBalance(ata)
    const skrAmount = info.value.uiAmount ?? 0
    const skrPrice = await getSKRPriceUSD()
    return { skrAmount, usdValue: skrAmount * skrPrice }
  } catch { return { skrAmount: 0, usdValue: 0 } }
}

// ─── Helper: USD → SOL amount ────────────────────────────────────────────────
export const usdToSOL = async (usd: number): Promise<number> => {
  const solPrice = await getSOLPriceUSD()
  return usd / solPrice
}

// ─── CORE: SOL-only payment (same pattern as SKR Burner) ─────────────────────
// Checks SOL balance first, then builds tx with priority fee, signs via MWA
export interface PaymentResult {
  success: boolean; txSignature?: string; error?: string; usdAmount?: number; solAmount?: number; skrAmount?: number
}

const doSOLPayment = async (
  usdAmount: number,
  splits: { wallet: PublicKey; percent: number }[],
): Promise<{ txSig: string; solPaid: number }> => {
  const solPrice = await getSOLPriceUSD()
  const totalSOL = usdAmount / solPrice
  const totalLamports = Math.floor(totalSOL * LAMPORTS_PER_SOL)

  const connection = new Connection(HELIUS_RPC, 'confirmed')
  let txSig = ''

  await transact(async (wallet: Web3MobileWallet) => {
    const auth = await wallet.authorize({
      cluster: CLUSTER,
      identity: { name: 'SeekerCraft', uri: 'https://seekercraft.xyz' },
    })

    const addrBytes = Buffer.from(auth.accounts[0].address, 'base64')
    const owner = new PublicKey(bs58.encode(addrBytes))

    // CHECK SOL BALANCE before building tx
    const balance = await connection.getBalance(owner)
    const needed = totalLamports + 10000 // tx fee buffer
    if (balance < needed) {
      throw new Error(`Insufficient SOL. Need ~${(needed / LAMPORTS_PER_SOL).toFixed(4)} SOL, have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`)
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight })

    // Priority fee (like SKR Burner)
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))

    for (const split of splits) {
      const lamports = Math.floor(totalLamports * split.percent)
      if (lamports <= 0) continue
      tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: split.wallet, lamports }))
    }

    const [signed] = await wallet.signTransactions({ transactions: [tx] })
    txSig = await connection.sendRawTransaction(
      (signed as Transaction).serialize(),
      { skipPreflight: false }
    )
    await connection.confirmTransaction(
      { signature: txSig, blockhash, lastValidBlockHeight },
      'confirmed'
    )
  })

  return { txSig, solPaid: totalSOL }
}

// ─── PUBLISH FEE ($1.00 → 90% dev, 10% pool) ─────────────────────────────
export const payPublishFee = async (userWallet: string): Promise<PaymentResult> => {
  try {
    const { txSig, solPaid } = await doSOLPayment(PUBLISH_FEE_USD, [
      { wallet: DEV_WALLET,  percent: 0.90 },
      { wallet: POOL_WALLET, percent: 0.10 },
    ])
    return { success: true, txSignature: txSig, usdAmount: PUBLISH_FEE_USD, solAmount: solPaid }
  } catch (err: any) {
    return { success: false, error: err.message || 'Payment failed' }
  }
}

// ─── ACHIEVEMENT FEE ($0.50 → 50% dev, 50% pool) ──────────────────────────
export const payAchievementFee = async (userWallet: string): Promise<PaymentResult> => {
  try {
    const { txSig, solPaid } = await doSOLPayment(ACHIEVEMENT_FEE_USD, [
      { wallet: DEV_WALLET,  percent: 0.50 },
      { wallet: POOL_WALLET, percent: 0.50 },
    ])
    return { success: true, txSignature: txSig, usdAmount: ACHIEVEMENT_FEE_USD, solAmount: solPaid }
  } catch (err: any) {
    return { success: false, error: err.message || 'Payment failed' }
  }
}

// ─── SKR DONATION (variable → 70% creator, 20% dev, 10% pool) ────────────
// Donations are in SKR tokens, not SOL
export const payDonation = async (
  userWallet: string,
  creatorWallet: string,
  skrAmount: number,
): Promise<PaymentResult> => {
  let txSig = ''
  try {
    const connection = new Connection(HELIUS_RPC, 'confirmed')
    const skrLamports = Math.floor(skrAmount * (10 ** SKR_DECIMALS))

    await transact(async (wallet: Web3MobileWallet) => {
      const auth = await wallet.authorize({ cluster: CLUSTER, identity: { name: 'SeekerCraft', uri: 'https://seekercraft.xyz' } })
      const addrBytes = Buffer.from(auth.accounts[0].address, 'base64')
      const owner = new PublicKey(bs58.encode(addrBytes))

      // Get sender's SKR token account
      const senderATA = await getAssociatedTokenAddress(SKR_MINT, owner)

      // Check SKR balance
      try {
        const accountInfo = await getAccount(connection, senderATA)
        const balance = Number(accountInfo.amount)
        if (balance < skrLamports) {
          throw new Error(`Insufficient SKR. Need ${skrAmount} SKR, have ${(balance / (10 ** SKR_DECIMALS)).toFixed(2)} SKR`)
        }
      } catch (e: any) {
        if (e.message?.includes('Insufficient')) throw e
        throw new Error('No SKR token account found. You need SKR tokens to donate.')
      }

      const creatorPubkey = new PublicKey(creatorWallet)

      // Calculate splits: 90% creator, 10% dev — no pool wallet
      const creatorAmount = Math.floor(skrLamports * 0.90)
      const devAmount     = skrLamports - creatorAmount // remainder to dev

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight })

      // Priority fee
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))

      // Create ATAs if needed and add transfer instructions
      const recipients = [
        { wallet: creatorPubkey, amount: creatorAmount },
        { wallet: DEV_WALLET, amount: devAmount },
      ]

      for (const r of recipients) {
        if (r.amount <= 0) continue
        const recipientATA = await getAssociatedTokenAddress(SKR_MINT, r.wallet)
        // Try to create ATA if it doesn't exist (idempotent)
        try {
          await getAccount(connection, recipientATA)
        } catch {
          tx.add(createAssociatedTokenAccountInstruction(owner, recipientATA, r.wallet, SKR_MINT))
        }
        tx.add(createTransferInstruction(senderATA, recipientATA, owner, r.amount))
      }

      const [signed] = await wallet.signTransactions({ transactions: [tx] })
      txSig = await connection.sendRawTransaction(
        (signed as Transaction).serialize(),
        { skipPreflight: false }
      )
      await connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        'confirmed'
      )
    })

    return { success: true, txSignature: txSig, usdAmount: 0, solAmount: 0, skrAmount }
  } catch (err: any) {
    return { success: false, error: err.message || 'SKR transfer failed' }
  }
}

// Helper: get user's SKR balance
export const getSKRBalance = async (walletAddress: string): Promise<number> => {
  try {
    const connection = new Connection(HELIUS_RPC, 'confirmed')
    const owner = new PublicKey(walletAddress)
    const ata = await getAssociatedTokenAddress(SKR_MINT, owner)
    const account = await getAccount(connection, ata)
    return Number(account.amount) / (10 ** SKR_DECIMALS)
  } catch { return 0 }
}
