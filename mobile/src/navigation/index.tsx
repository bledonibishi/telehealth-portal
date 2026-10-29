import React from 'react';
import { Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { IntakeQuizScreen } from '../screens/intake/IntakeQuizScreen';
import { ConsentScreen } from '../screens/onboarding/ConsentScreen';
import { ConsultationStatusScreen } from '../screens/consultation/ConsultationStatusScreen';
import { OnboardingChecklistScreen } from '../screens/onboarding/OnboardingChecklistScreen';
import { BasicInformationScreen } from '../screens/onboarding/BasicInformationScreen';
import { IdPhotoScreen } from '../screens/onboarding/IdPhotoScreen';
import { BodyPhotoScreen } from '../screens/onboarding/BodyPhotoScreen';
import { PrescriptionProofScreen } from '../screens/onboarding/PrescriptionProofScreen';
import { OnboardingChatScreen } from '../screens/onboarding/OnboardingChatScreen';
import { WeightScreen } from '../screens/portal/WeightScreen';
import { InjectionsScreen } from '../screens/portal/InjectionsScreen';
import { MoreScreen } from '../screens/portal/MoreScreen';
import { DoctorScreen } from '../screens/portal/DoctorScreen';
import { OrdersScreen } from '../screens/portal/OrdersScreen';
import { SideEffectsScreen } from '../screens/portal/SideEffectsScreen';
import { ReportsScreen } from '../screens/portal/ReportsScreen';
import { NotificationsScreen } from '../screens/portal/NotificationsScreen';
import { HelpScreen } from '../screens/portal/HelpScreen';
import { MessagesScreen } from '../screens/messaging/MessagesScreen';
import { useUnreadMessageCount } from '../lib/useConversation';
import { MY_PRODUCT_KIND } from '../graphql/portal';
import { UNREAD_NOTIFICATION_COUNT } from '../graphql/operations';
import { colors } from '../theme';
import { AccountScreen } from '../screens/account/AccountScreen';
import { listenForNoticeTaps, registerForPush } from '../lib/push';
import { navigationRef } from './navigationRef';
import { withNativeHeader } from '../lib/nativeHeader';
import { GuideLauncher, GuideTabBar } from '../components/guide/GuideProvider';

const Stack = createNativeStackNavigator();
const OnboardingStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MoreStack = createNativeStackNavigator();

// Screens opened with the navigator's own header bar (a back button on top): they must not leave room for the notch a second time.
const NotificationsWithHeader = withNativeHeader(NotificationsScreen);
const DoctorWithHeader = withNativeHeader(DoctorScreen);
const OrdersWithHeader = withNativeHeader(OrdersScreen);
const AccountWithHeader = withNativeHeader(AccountScreen);
const SideEffectsWithHeader = withNativeHeader(SideEffectsScreen);
const ReportsWithHeader = withNativeHeader(ReportsScreen);
const NewConsultationWithHeader = withNativeHeader(IntakeQuizScreen);
const HelpWithHeader = withNativeHeader(HelpScreen);
const MessagesStack = createNativeStackNavigator();

// The chat, and the written-request form it opens.
function MessagesFlow() {
  return (
    <MessagesStack.Navigator screenOptions={{ headerTintColor: colors.ink700, headerShadowVisible: false, headerStyle: { backgroundColor: colors.page } }}>
      <MessagesStack.Screen name="Chat" component={MessagesScreen} options={{ headerShown: false }} />
      <MessagesStack.Screen name="Help" component={HelpWithHeader} options={{ title: '', headerBackTitle: 'Messages' }} />
    </MessagesStack.Navigator>
  );
}

// Development only: `__DEV__` is false in a release build, so the screen and Storybook are dropped from it.
const StorybookScreen = __DEV__ ? require('../screens/portal/StorybookScreen').StorybookScreen : null;

// Everything that isn't a tab. On a tablet these open full width inside the same column.
function MoreFlow() {
  return (
    <MoreStack.Navigator screenOptions={{ headerTintColor: colors.ink700, headerShadowVisible: false, headerStyle: { backgroundColor: colors.page } }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      <MoreStack.Screen name="Notifications" component={NotificationsWithHeader} options={{ title: '' }} />
      <MoreStack.Screen name="Doctor" component={DoctorWithHeader} options={{ title: '' }} />
      <MoreStack.Screen name="Orders" component={OrdersWithHeader} options={{ title: '' }} />
      <MoreStack.Screen name="Account" component={AccountWithHeader} options={{ title: '' }} />
      <MoreStack.Screen name="SideEffects" component={SideEffectsWithHeader} options={{ title: '' }} />
      {StorybookScreen && <MoreStack.Screen name="Storybook" component={StorybookScreen} options={{ title: 'Component library', headerBackTitle: 'More' }} />}
      <MoreStack.Screen name="Reports" component={ReportsWithHeader} options={{ title: '' }} />
      <MoreStack.Screen name="NewConsultation" component={NewConsultationWithHeader} options={{ title: 'New consultation' }} />
    </MoreStack.Navigator>
  );
}

const icon = (glyph: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;

// The weight journey is for the weight programme and the injection calendar is for injected medicines,
// so each tab appears only for the patient it belongs to.
function PatientTabs() {
  // Once the patient is in the app: ask to send notices, and open the right screen when one is tapped.
  React.useEffect(() => {
    registerForPush();
    return listenForNoticeTaps();
  }, []);
  const { data } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-and-network' });
  const kind: string | null | undefined = data?.myProductKind;
  const { data: unreadData } = useQuery(UNREAD_NOTIFICATION_COUNT, { pollInterval: 60_000 });
  const unread: number = unreadData?.unreadNotificationCount ?? 0;
  const unreadMessages = useUnreadMessageCount();
  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator tabBar={(props) => <GuideTabBar {...props} />} sceneContainerStyle={{ backgroundColor: colors.page }} screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ink700, tabBarInactiveTintColor: colors.slate400, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
      <Tab.Screen name="Status" component={ConsultationStatusScreen} options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      {kind === 'GLP1' && <Tab.Screen name="Weight" component={WeightScreen} options={{ tabBarIcon: icon('⚖️') }} />}
      {!!kind && <Tab.Screen name="Injections" component={InjectionsScreen} options={{ title: kind === 'HRT' ? 'Doses' : 'Injections', tabBarIcon: icon('💉') }} />}
      {/* Help and messages in one place: the chat, with a button for a written request. */}
      <Tab.Screen name="Messages" component={MessagesFlow} options={{ title: 'Messages', tabBarIcon: icon('💬'), tabBarBadge: unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : unreadMessages) : undefined }} />
      <Tab.Screen name="More" component={MoreFlow} options={{ tabBarIcon: icon('☰'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }} />
    </Tab.Navigator>
    <GuideLauncher />
    </View>
  );
}

// A separate stack, not part of the tab bar — patients can't reach the rest
// of the app (Status/Messages/etc.) from in here until a clinician approves it.
function OnboardingFlow() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerTintColor: '#0d9488', contentStyle: { backgroundColor: colors.page } }}>
      <OnboardingStack.Screen name="Checklist" component={OnboardingChecklistScreen} options={{ title: 'Onboarding', headerShown: false }} />
      <OnboardingStack.Screen name="BasicInformation" component={BasicInformationScreen} options={{ title: '' }} />
      <OnboardingStack.Screen name="Consent" component={ConsentScreen} options={{ title: '' }} />
      <OnboardingStack.Screen name="MedicalQuestionnaire" component={IntakeQuizScreen} options={{ title: '' }} />
      <OnboardingStack.Screen name="IdPhoto" component={IdPhotoScreen} options={{ title: '' }} />
      <OnboardingStack.Screen name="BodyPhoto" component={BodyPhotoScreen} options={{ title: '' }} />
      <OnboardingStack.Screen name="PrescriptionProof" component={PrescriptionProofScreen} options={{ title: '' }} />
      {/* Slides up from the bottom, over the step the patient is on. */}
      <OnboardingStack.Screen name="Chat" component={OnboardingChatScreen} options={{ presentation: 'modal', headerShown: false }} />
    </OnboardingStack.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingFlow} />
        <Stack.Screen name="Main" component={PatientTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
