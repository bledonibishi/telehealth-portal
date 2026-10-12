import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Preview } from '@storybook/react-native';
import { colors } from '../src/theme';

const preview: Preview = {
  decorators: [
    // The app's page colour and safe-area context, so a component looks here the way it does in a screen.
    (Story) => (
      <SafeAreaProvider>
        <View style={{ flex: 1, padding: 16, backgroundColor: colors.page, justifyContent: 'center' }}>
          <Story />
        </View>
      </SafeAreaProvider>
    ),
  ],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  },
};

export default preview;
