// utils/payments.ts - SeekerCraft payment system v3
// ALL payments are SOL-only (same pattern as SKR Burner app).
// Publish ~$0.25 in SKR (dev wallet) | Achievement 0.25 SKR (50% dev, 50% pool)
// Donation: variable (90% creator, 10% dev)
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
export const PUBLISH_FEE_USD     = 0.25  // $0.25 USD converted to SKR at current price
export const ACHIEVEMENT_FEE_SKR = 0.25  // fixed 0.25 SKR tokens

// ─── TOKEN PRICES ────────────────────────────────────────────────────────────
let _skrPriceCache: { price: number; at: number } | null = null
let _solPriceCache: { price: number; at: number } | null = null

const FALLBACK_SKR_PRICE = 0.025
const isSaneSKRPrice = (p: any): p is number =>
  typeof p === 'number' && isFinite(p) && p > 0.00001 && p < 10000

export const getSKRPriceUSD = async (): Promise<number> => {
  if (_skrPriceCache && Date.now() - _skrPriceCache.at < 60_000) return _skrPriceCache.price
  // Jupiter first — native Solana, reliable
  try {
    const r = await fetch(`https://api.jup.ag/price/v2?ids=${SKR_MINT.toString()}`)
    const d = await r.json()
    const p = parseFloat(d?.data?.[SKR_MINT.toString()]?.price)
    if (isSaneSKRPrice(p)) { _skrPriceCache = { price: p, at: Date.now() }; return p }
  } catch {}
  return isSaneSKRPrice(_skrPriceCache?.price) ? _skrPriceCache!.price : FALLBACK_SKR_PRICE
}

const FALLBACK_SOL_PRICE = 150 // sane default if all APIs fail
const isSanePrice = (p: any): p is number =>
  typeof p === 'number' && isFinite(p) && p > 5 && p < 100_000

export const getSOLPriceUSD = async (): Promise<number> => {
  if (_solPriceCache && Date.now() - _solPriceCache.at < 60_000) return _solPriceCache.price
  // Jupiter — most reliable for Solana ecosystem
  try {
    const r = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112')
    const d = await r.json()
    const p = parseFloat(d?.data?.['So11111111111111111111111111111111111111112']?.price)
    if (isSanePrice(p)) { _solPriceCache = { price: p, at: Date.now() }; return p }
  } catch {}
  // fallback: CoinGecko
  try {
    const r2 = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
    const d2 = await r2.json()
    const p2 = d2?.solana?.usd
    if (isSanePrice(p2)) { _solPriceCache = { price: p2, at: Date.now() }; return p2 }
  } catch {}
  return isSanePrice(_solPriceCache?.price) ? _solPriceCache!.price : FALLBACK_SOL_PRICE
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
  if (!isSanePrice(solPrice)) throw new Error(`Bad SOL price: ${solPrice}`)
  const totalSOL = usdAmount / solPrice
  const totalLamports = Math.floor(totalSOL * LAMPORTS_PER_SOL)
  // sanity: min 1000 lamports (~$0.00015 at $150/SOL) — catches unit errors before signing
  if (!isFinite(totalLamports) || totalLamports < 1000)
    throw new Error(`Computed lamports too low: ${totalLamports} (SOL price was $${solPrice})`)

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

// ─── PUBLISH FEE (~$0.25 in SKR → dev wallet) ────────────────────────────────
// SKR token transfer — amount computed dynamically from price
export const payPublishFee = async (userWallet: string): Promise<PaymentResult> => {
  let txSig = ''
  try {
    const skrPrice = await getSKRPriceUSD()
    const skrAmount = PUBLISH_FEE_USD / skrPrice          // e.g. 0.25 / 0.025 = 10 SKR
    const skrLamports = Math.floor(skrAmount * (10 ** SKR_DECIMALS))
    if (skrLamports <= 0) throw new Error(`Bad SKR amount: ${skrAmount} (price $${skrPrice})`)

    const connection = new Connection(HELIUS_RPC, 'confirmed')

    await transact(async (wallet: Web3MobileWallet) => {
      const auth = await wallet.authorize({ cluster: CLUSTER, identity: { name: 'SeekerCraft', uri: 'https://seekercraft.xyz' } })
      const addrBytes = Buffer.from(auth.accounts[0].address, 'base64')
      const owner = new PublicKey(bs58.encode(addrBytes))

      const senderATA = await getAssociatedTokenAddress(SKR_MINT, owner)
      try {
        const acct = await getAccount(connection, senderATA)
        if (Number(acct.amount) < skrLamports)
          throw new Error(`Insufficient SKR. Need ${skrAmount.toFixed(2)} SKR, have ${(Number(acct.amount) / (10 ** SKR_DECIMALS)).toFixed(2)} SKR`)
      } catch (e: any) {
        if (e.message?.includes('Insufficient')) throw e
        throw new Error('No SKR token account. Buy SKR first.')
      }

      const devATA = await getAssociatedTokenAddress(SKR_MINT, DEV_WALLET)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight })
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))
      try { await getAccount(connection, devATA) } catch {
        tx.add(createAssociatedTokenAccountInstruction(owner, devATA, DEV_WALLET, SKR_MINT))
      }
      tx.add(createTransferInstruction(senderATA, devATA, owner, skrLamports))

      const [signed] = await wallet.signTransactions({ transactions: [tx] })
      txSig = await connection.sendRawTransaction((signed as Transaction).serialize(), { skipPreflight: false })
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed')
    })

    return { success: true, txSignature: txSig, usdAmount: PUBLISH_FEE_USD, skrAmount }
  } catch (err: any) {
    return { success: false, error: err.message || 'SKR payment failed' }
  }
}

// ─── ACHIEVEMENT FEE (0.25 SKR fixed, 50% dev, 50% pool) ────────────────────
export const payAchievementFee = async (userWallet: string): Promise<PaymentResult> => {
  let txSig = ''
  try {
    const skrLamports = Math.floor(ACHIEVEMENT_FEE_SKR * (10 ** SKR_DECIMALS))
    const connection = new Connection(HELIUS_RPC, 'confirmed')

    await transact(async (wallet: Web3MobileWallet) => {
      const auth = await wallet.authorize({ cluster: CLUSTER, identity: { name: 'SeekerCraft', uri: 'https://seekercraft.xyz' } })
      const addrBytes = Buffer.from(auth.accounts[0].address, 'base64')
      const owner = new PublicKey(bs58.encode(addrBytes))

      const senderATA = await getAssociatedTokenAddress(SKR_MINT, owner)
      try {
        const acct = await getAccount(connection, senderATA)
        if (Number(acct.amount) < skrLamports)
          throw new Error(`Insufficient SKR. Need ${ACHIEVEMENT_FEE_SKR} SKR, have ${(Number(acct.amount) / (10 ** SKR_DECIMALS)).toFixed(2)} SKR`)
      } catch (e: any) {
        if (e.message?.includes('Insufficient')) throw e
        throw new Error('No SKR token account. Buy SKR first.')
      }

      const devAmount  = Math.floor(skrLamports * 0.50)
      const poolAmount = skrLamports - devAmount

      const devATA  = await getAssociatedTokenAddress(SKR_MINT, DEV_WALLET)
      const poolATA = await getAssociatedTokenAddress(SKR_MINT, POOL_WALLET)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight })
      tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50000 }))
      try { await getAccount(connection, devATA)  } catch { tx.add(createAssociatedTokenAccountInstruction(owner, devATA,  DEV_WALLET,  SKR_MINT)) }
      try { await getAccount(connection, poolATA) } catch { tx.add(createAssociatedTokenAccountInstruction(owner, poolATA, POOL_WALLET, SKR_MINT)) }
      tx.add(createTransferInstruction(senderATA, devATA,  owner, devAmount))
      tx.add(createTransferInstruction(senderATA, poolATA, owner, poolAmount))

      const [signed] = await wallet.signTransactions({ transactions: [tx] })
      txSig = await connection.sendRawTransaction((signed as Transaction).serialize(), { skipPreflight: false })
      await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed')
    })

    return { success: true, txSignature: txSig, skrAmount: ACHIEVEMENT_FEE_SKR }
  } catch (err: any) {
    return { success: false, error: err.message || 'SKR payment failed' }
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
