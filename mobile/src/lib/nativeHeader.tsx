import React, { createContext, useContext } from 'react';

/**
 * Whether the screen sits under the navigator's own header bar. That bar already clears the status bar and the notch, so a
 * screen under it must not leave room for them again (it showed as a big empty gap above the title). Screens opened with a
 * header are wrapped in `withNativeHeader` in the navigation; `Screen` asks `useHasNativeHeader`.
 */
const HasNativeHeader = createContext(false);

export const useHasNativeHeader = () => useContext(HasNativeHeader);

/** Wraps a screen component so everything inside knows a native header is above it. Call once per screen, outside any render. */
// Typed loosely on purpose: the navigator's screen types come from a second copy of React's types and reject anything stricter.
export function withNativeHeader(Component: (props: any) => React.ReactElement | null) {
  const Wrapped = (props: any) => (
    <HasNativeHeader.Provider value>
      <Component {...props} />
    </HasNativeHeader.Provider>
  );
  Wrapped.displayName = `withNativeHeader(${Component.name || 'Screen'})`;
  return Wrapped;
}
