import React from 'react';
import { useQuery } from '@apollo/client';
import { ME_NAME } from '../graphql/operations';
import { navigationRef } from '../navigation/navigationRef';
import { ProfileButton } from './ProfileButton';

/** The profile button wired to the app: the signed-in patient's initials, opening the Profile screen. */
export function ProfileMenuButton() {
  const { data } = useQuery(ME_NAME, { fetchPolicy: 'cache-first' });
  const initials = `${data?.me?.firstName?.[0] ?? ''}${data?.me?.lastName?.[0] ?? ''}`.toUpperCase();
  // The global ref rather than useNavigation, so the button also works outside a navigator (Storybook).
  return <ProfileButton initials={initials} onPress={() => { if (navigationRef.isReady()) (navigationRef as any).navigate('Profile'); }} />;
}
