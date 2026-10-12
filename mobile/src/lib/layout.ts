import { useWindowDimensions } from 'react-native';

/** From this width a screen is laid out for a tablet: roomier padding, a centred column, two columns of cards. */
export const TABLET_MIN_WIDTH = 768;
const CONTENT_MAX_WIDTH = 960;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;
  return {
    width,
    height,
    isTablet,
    isLandscape: width > height,
    gutter: isTablet ? 28 : 16,
    contentMaxWidth: isTablet ? CONTENT_MAX_WIDTH : undefined,
  };
}
