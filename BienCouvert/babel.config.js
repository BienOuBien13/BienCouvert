module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Nécessaire pour expo-router (doit être en dernier)
      'react-native-reanimated/plugin',
    ],
  };
};
