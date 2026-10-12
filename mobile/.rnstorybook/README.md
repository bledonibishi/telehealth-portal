# Component library (Storybook)

Every shared mobile component has a story next to it (`Button.tsx` and `Button.stories.tsx`). Build and check a component here before using it in a screen.

```bash
pnpm --filter @telehealth/mobile storybook    # starts Expo with Storybook as the app; open it in Expo Go or a simulator
```

The normal `pnpm dev` is unchanged and contains none of Storybook.

- **New component:** add `Name.stories.tsx` beside it. Stories are found automatically; `storybook.requires.ts` is regenerated when Metro starts, so commit it.
- **Colours and spacing:** use `src/theme.ts` (see Foundations / Colors), never raw hex values.
- **Reusable first:** if a screen needs something that two screens could share, build it as a component with a story, not inline in the screen.
