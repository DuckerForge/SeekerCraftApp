// app/terms.tsx - SeekerCraft Terms of Service (standalone page)
import React from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'

const { width: SW } = Dimensions.get('window')

const C = {
  bg1: '#040012', bg2: '#0B0033',
  gold: '#FFD700', purple: '#9945FF', green: '#14F195',
  text: '#FFF', muted: 'rgba(255,255,255,0.55)',
  surface: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.09)',
}

interface ArticleProps { num: string; title: string; body: string }
const Article = ({ num, title, body }: ArticleProps) => (
  <View style={st.article}>
    <View style={st.articleHeader}>
      <View style={st.numBadge}>
        <Text style={st.numText}>{num}</Text>
      </View>
      <Text style={st.articleTitle}>{title}</Text>
    </View>
    <Text style={st.articleBody}>{body}</Text>
  </View>
)

const ARTICLES: ArticleProps[] = [
  {
    num: '01', title: 'Acceptance of Terms',
    body: `By accessing or using SeekerCraft ("App") you confirm that:\n\n• You are at least 13 years of age (16 in some jurisdictions)\n• You accept these Terms in full\n• You are accessing the App from a location where its use is lawful under local law\n• If access to or use of blockchain-based features is restricted or prohibited in your jurisdiction, you are responsible for not using those features\n• If acting on behalf of an organization, you have authority to bind it to these Terms\n\nIf you do not agree, please do not use the App.`,
  },
  {
    num: '02', title: 'Description of Service',
    body: `SeekerCraft is a mobile game that lets you:\n\n• Create and publish custom Peggle-style levels\n• Play community-made content\n• Connect a Solana wallet to track scores and achievements\n• Compete on weekly and all-time leaderboards\n\nCommunity features require an internet connection. Leaderboard features require a compatible Solana wallet (Phantom, Solflare, Backpack or equivalent).`,
  },
  {
    num: '03', title: 'Wallet & Accounts',
    body: `SeekerCraft uses your Solana public wallet address as a unique identifier — no email or password required.\n\nBy connecting your wallet you confirm:\n• You are the rightful owner of that wallet\n• Your public address will be displayed on leaderboards\n• We NEVER have access to your private keys or seed phrase — all signing happens inside your wallet app\n\nYou may disconnect at any time via Settings.`,
  },
  {
    num: '04', title: 'User-Generated Content',
    body: `When you publish levels to the community:\n\n• You grant us a non-exclusive, royalty-free license to display and distribute that content within the App\n• You confirm the content does not infringe third-party rights\n• You agree not to publish harmful, illegal, hateful or sexually explicit content\n\nWe reserve the right to remove any content at our discretion. You may delete your own published levels at any time via the Community page.`,
  },
  {
    num: '05', title: 'Blockchain Features',
    body: `Certain features integrate with the Solana blockchain. You acknowledge:\n\n• Blockchain transactions are irreversible and public by nature\n• We do not control the Solana network and are not responsible for network failures or errors\n• Gas/transaction fees (SOL) are your responsibility\n• Nothing in the App constitutes financial advice\n\nCryptocurrency values are volatile. Do not invest more than you can afford to lose.`,
  },
  {
    num: '06', title: 'Prohibited Conduct',
    body: `You agree NOT to:\n\n• Reverse-engineer, decompile or disassemble the App\n• Use bots, scripts or automation to interact with the App or Firebase\n• Attempt unauthorized access to our backend systems\n• Publish levels designed to exploit or harm other users\n• Impersonate other players or create misleading names\n• Use the App for any illegal purpose\n\nViolations may result in immediate removal from community features.`,
  },
  {
    num: '07', title: 'Leaderboards & Achievements',
    body: `Rankings and achievements are provided for entertainment only and carry no monetary value.\n\nWe reserve the right to:\n• Reset weekly leaderboards every Monday at 00:00 UTC\n• Disqualify fraudulent or rule-violating entries without notice\n• Modify scoring, ranking criteria or achievement definitions at any time`,
  },
  {
    num: '08', title: 'Intellectual Property',
    body: `All original App content — artwork, audio, music, UI design, source code, and the SeekerCraft name and logo — is owned by or licensed to us and protected by intellectual property law.\n\nYou may not reproduce, distribute, modify or create derivative works of our content without prior written consent.`,
  },
  {
    num: '09', title: 'Disclaimer of Warranties',
    body: `SeekerCraft is provided "AS IS" and "AS AVAILABLE" without warranties of any kind.\n\nWe do not warrant that:\n• The App will be uninterrupted, error-free or secure\n• Game data (levels, scores, achievements) will be permanently preserved\n• The App will be compatible with all devices or OS versions\n\nYour use of the App is at your sole risk.`,
  },
  {
    num: '10', title: 'Limitation of Liability',
    body: `To the maximum extent permitted by applicable law, we shall not be liable for any indirect, incidental, special, consequential or punitive damages, including:\n\n• Loss of data or game progress\n• Loss of wallet access or cryptocurrency\n• Device damage\n\nThis limitation applies to the fullest extent permitted by law in your jurisdiction.`,
  },
  {
    num: '11', title: 'Changes to These Terms',
    body: `We may update these Terms at any time. Significant changes will be communicated by updating the "Last updated" date shown at the top of this page.\n\nContinued use of the App after changes are posted constitutes your acceptance of the new Terms.`,
  },
  {
    num: '12', title: 'Governing Law & Jurisdiction',
    body: `These Terms shall be governed by and construed in accordance with applicable law.\n\nBy using this App you confirm that:\n\n• You are accessing the App from a jurisdiction where such use is legal\n• You are not subject to any sanction or restriction that prohibits you from using this App or interacting with blockchain-based services\n• You assume full responsibility for compliance with the laws and regulations of your local jurisdiction`,
  },
  {
    num: '13', title: 'Contact Us',
    body: `For questions, legal notices or data-deletion requests:\n\n• X (Twitter): @SeekerCraft\n• In-app: Settings → Privacy\n\nWe aim to respond within 5 business days.`,
  },
]

export default function TermsScreen() {
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[C.bg1, C.bg2, C.bg1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn} activeOpacity={0.7}>
            <Text style={st.backText}>← BACK</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>TERMS OF SERVICE</Text>
          <View style={{ width: 64 }} />
        </View>

        {/* ── Last updated ── */}
        <View style={{ paddingHorizontal: 18, marginBottom: 6 }}>
          <View style={st.datePill}>
            <Text style={st.datePillText}>Last updated: February 2026</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.scroll}>

          {/* ── Intro card ── */}
          <View style={st.introCard}>
            <LinearGradient colors={['rgba(153,69,255,0.18)', 'rgba(20,241,149,0.06)']} style={StyleSheet.absoluteFill} />
            <Text style={st.introTitle}>📋  SeekerCraft Terms of Service</Text>
            <Text style={st.introBody}>
              Please read these Terms carefully before using SeekerCraft. By using the App you agree to be bound by these Terms. If you do not agree, please do not use the App.
            </Text>
          </View>

          {/* ── Articles ── */}
          {ARTICLES.map(a => <Article key={a.num} {...a} />)}

          {/* ── Agreement ── */}
          <View style={st.agreementCard}>
            <LinearGradient colors={['rgba(255,215,0,0.12)', 'rgba(255,215,0,0.04)']} style={StyleSheet.absoluteFill} />
            <Text style={st.agreementText}>
              ✅  By using SeekerCraft you acknowledge that you have read, understood, and agreed to these Terms of Service and our Privacy Policy.
            </Text>
          </View>

          {/* ── Action buttons ── */}
          <View style={st.actions}>
            <TouchableOpacity onPress={() => router.push('/settings')} style={st.actionBtn} activeOpacity={0.8}>
              <Text style={st.actionBtnText}>Privacy Policy  →</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85} style={st.mainActionBtn}>
              <LinearGradient colors={['#FFD700', '#FF9500']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.mainActionGrad}>
                <Text style={st.mainActionText}>I AGREE  →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

      </SafeAreaView>
    </View>
  )
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn:      { padding: 8 },
  backText:     { color: C.gold, fontSize: 12, fontWeight: '900', fontFamily: 'monospace' },
  headerTitle:  { color: C.text, fontSize: 13, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 2 },

  datePill:     { alignSelf: 'flex-start', backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)' },
  datePillText: { color: C.gold, fontSize: 9, fontFamily: 'monospace', letterSpacing: 0.5 },

  scroll: { paddingHorizontal: 16, paddingTop: 10 },

  introCard:  { borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1.5, borderColor: 'rgba(153,69,255,0.35)', overflow: 'hidden' },
  introTitle: { color: C.text, fontSize: 14, fontWeight: '900', fontFamily: 'monospace', marginBottom: 10 },
  introBody:  { color: C.muted, fontSize: 12, fontFamily: 'monospace', lineHeight: 21 },

  article:       { marginBottom: 16 },
  articleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  numBadge:      { backgroundColor: 'rgba(153,69,255,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(153,69,255,0.4)' },
  numText:       { color: C.purple, fontSize: 10, fontWeight: '900', fontFamily: 'monospace' },
  articleTitle:  { color: C.text, fontSize: 13, fontWeight: '900', fontFamily: 'monospace', flex: 1 },
  articleBody:   { color: C.muted, fontSize: 12, fontFamily: 'monospace', lineHeight: 20, backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },

  agreementCard: { borderRadius: 16, padding: 18, marginTop: 8, marginBottom: 18, borderWidth: 1.5, borderColor: 'rgba(255,215,0,0.35)', overflow: 'hidden' },
  agreementText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontFamily: 'monospace', lineHeight: 22, textAlign: 'center', fontStyle: 'italic' },

  actions:        { gap: 10, marginBottom: 4 },
  actionBtn:      { borderRadius: 13, paddingVertical: 13, alignItems: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  actionBtnText:  { color: C.muted, fontFamily: 'monospace', fontSize: 12, fontWeight: '700' },
  mainActionBtn:  { borderRadius: 13, overflow: 'hidden', elevation: 8, shadowColor: C.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  mainActionGrad: { paddingVertical: 15, alignItems: 'center', borderRadius: 13 },
  mainActionText: { color: '#000', fontSize: 15, fontWeight: '900', fontFamily: 'monospace', letterSpacing: 1.2 },
})
