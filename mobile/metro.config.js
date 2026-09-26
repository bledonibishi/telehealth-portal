// Metro config for a pnpm workspace: pnpm uses strict, symlinked
// node_modules rather than yarn/npm's flat hoisting, so Metro needs to be
// told explicitly to follow symlinks and to also watch the monorepo root
// (for @telehealth/shared-types and other workspace packages).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Needed so Metro can see workspace packages like @telehealth/shared-types,
// which live outside this app's own directory.
config.watchFolders = [workspaceRoot];
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
