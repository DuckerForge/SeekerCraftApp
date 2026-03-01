// app/_layout.tsx
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="editor" />
        <Stack.Screen name="test-play" />
        <Stack.Screen name="my-levels" />
        <Stack.Screen name="browse" />
        <Stack.Screen name="game-play" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="rankings" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="credits"          options={{ headerShown: false }}/>
        <Stack.Screen name="social"  options={{ headerShown: false }}/>
      </Stack>
      <StatusBar style="light" />
    </AppProviders>
  )
}
