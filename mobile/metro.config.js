// Expo configures Metro for a monorepo by itself (it watches the workspace and follows pnpm's symlinks), so the
// defaults are enough. The overrides this file used to carry were needed before SDK 52 and now only conflict.
const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');

// On while developing (it is the "Component library" row in More) and in `pnpm storybook`; off in a production build,
// so none of Storybook ends up in a release.
module.exports = withStorybook(getDefaultConfig(__dirname), {
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true' || process.env.NODE_ENV !== 'production',
  configPath: require('path').resolve(__dirname, '.rnstorybook'),
});
