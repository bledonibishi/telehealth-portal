import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, type TextInputProps } from 'react-native';

/** A password input with a Show / Hide button. Style it through `style`, as with a TextInput. */
export function PasswordField({ style, ...props }: Omit<TextInputProps, 'secureTextEntry'>) {
  const [shown, setShown] = useState(false);
  return (
    <View style={s.wrap}>
      <TextInput {...props} secureTextEntry={!shown} autoCapitalize="none" autoCorrect={false} style={[style, s.input]} />
      <TouchableOpacity
        onPress={() => setShown((v) => !v)}
        style={s.toggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
      >
        <Text style={s.toggleText}>{shown ? 'Hide' : 'Show'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', justifyContent: 'center' },
  input: { paddingRight: 64 },
  toggle: { position: 'absolute', right: 12, top: 0, bottom: 12, justifyContent: 'center' },
  toggleText: { color: '#0ea5e9', fontWeight: '600', fontSize: 13 },
});
