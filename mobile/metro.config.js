// Expo configures Metro for a monorepo by itself (it watches the workspace and follows pnpm's symlinks), so the
// defaults are enough. The overrides this file used to carry were needed before SDK 52 and now only conflict.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
