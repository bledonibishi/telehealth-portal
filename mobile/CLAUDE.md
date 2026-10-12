# Mobile app rules for Claude

## Use the component library (Storybook) — don't design new UI

Every shared component has a story next to it (`Button.tsx` + `Button.stories.tsx`). Run `pnpm --filter @telehealth/mobile storybook`, or open More → Component library in a dev build, to see them. The shared components live in `src/components/` (basics in `src/components/ui.tsx`, plus `PasswordField` and others).

- **Before writing any UI**, look for an existing component that does the job (button, card, pill, notice, field, progress bar, password field, and whatever else has a `*.stories.tsx`). Use it. Do not hand-build a button, card, input or badge out of `Pressable`/`View`/`TextInput` inside a screen.
- **Don't restyle a library component** inside a screen with ad-hoc styles or one-off colours. If it needs a new look or behaviour, add a prop or variant to the component, with a story for it, so everyone gets it.
- **If nothing fits**, build a new component in `src/components/` with a `.stories.tsx` covering its states (default, loading, disabled, error, etc.), then use it in the screen. Don't leave a one-off in the screen file.
- **Colours and spacing** come from `src/theme.ts` (see Storybook → Foundations / Colors). No raw hex values.
- Changing a shared component changes every screen that uses it: check its story still looks right, and update the story in the same change.
- Say so plainly if what the owner asks for would break this (for example a one-off design that should be a library variant), and recommend the library way.
- `pnpm --filter @telehealth/mobile lint` warns on a hand-built `Pressable`/`TextInput` (and the touchables) inside `src/screens`. Don't add new warnings; when you touch a screen, move its raw pieces onto library components.
