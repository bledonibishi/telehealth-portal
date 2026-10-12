import type { StorybookConfig } from '@storybook/react-native';

// Stories live next to the component they show (Button.tsx + Button.stories.tsx), so a component and its examples change together.
const main: StorybookConfig = {
  stories: ['../src/**/*.stories.?(ts|tsx)'],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
};

export default main;
