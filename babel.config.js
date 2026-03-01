module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // ...altri plugin se ne hai...
      'react-native-reanimated/plugin', // <--- QUESTO DEVE ESSERE L'ULTIMO
    ],
  };
};
