require("dotenv").config();

module.exports = {
  expo: {
    name: "SeekerCraft",
    slug: "seekercraft",
    version: "1.0.8",
    orientation: "portrait",
    icon: "./assets/images/log.png",
    scheme: "seekercraft",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.duckerforge.seekercraft",
      buildNumber: "9",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
        backgroundColor: "#1a1a2e",
      },
      package: "com.duckerforge.seekercraft",
      versionCode: 10,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "./plugins/removePermissions",
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#1a1a2e",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      "expo-audio",
      "expo-asset",
      "expo-localization",
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "ba25f42a-7e15-4f32-8297-e2b986d7564a",
      },
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      firebaseMeasurementId: process.env.FIREBASE_MEASUREMENT_ID,
      heliusApiKey: process.env.HELIUS_API_KEY,
    },
  },
};
