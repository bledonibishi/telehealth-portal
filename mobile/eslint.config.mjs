import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Only one job here: keep screens on the shared components (see CLAUDE.md and the component library in Storybook).
const RAW = ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'TextInput'];
const message = (name) =>
  `Don't build <${name}> by hand in a screen. Use a component from src/components (Button, Field, PasswordField, Card…). If none fits, add a variant or a new component with a story.`;

export default tseslint.config(
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['node_modules', '.expo', '.rnstorybook/storybook.requires.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    // Registered only so the existing `eslint-disable react-hooks/...` comments resolve; the hooks rules are not turned on here.
    plugins: { 'react-hooks': reactHooks },
    // Screens must use the library. The library itself (src/components) is where the raw pieces are allowed.
    ignores: ['src/components/**', 'src/**/*.stories.tsx'],
    rules: {
      // "warn" while the existing screens are moved over; change to "error" once they are, so CI blocks new ones.
      'no-restricted-syntax': ['warn', ...RAW.map((name) => ({ selector: `JSXOpeningElement[name.name='${name}']`, message: message(name) }))],
    },
  },
);
