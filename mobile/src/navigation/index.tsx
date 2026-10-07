import React from 'react';
import { Text } from 'react-native';
import { useQuery } from '@apollo/client';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { IntakeQuizScreen } from '../screens/intake/IntakeQuizScreen';
import { ConsultationStatusScreen } from '../screens/consultation/ConsultationStatusScreen';
import { MessagingScreen } from '../screens/messaging/MessagingScreen';
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
import { MY_PRODUCT_KIND } from '../graphql/portal';
import { colors } from '../theme';
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator();
const OnboardingStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MoreStack = createNativeStackNavigator();

// Everything that isn't a tab. On a tablet these open full width inside the same column.
function MoreFlow() {
  return (
    <MoreStack.Navigator screenOptions={{ headerTintColor: colors.ink700, headerShadowVisible: false, headerStyle: { backgroundColor: colors.page } }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ headerShown: false }} />
      <MoreStack.Screen name="Doctor" component={DoctorScreen} options={{ title: '' }} />
      <MoreStack.Screen name="Orders" component={OrdersScreen} options={{ title: '' }} />
      <MoreStack.Screen name="SideEffects" component={SideEffectsScreen} options={{ title: '' }} />
      <MoreStack.Screen name="Reports" component={ReportsScreen} options={{ title: '' }} />
      <MoreStack.Screen name="NewConsultation" component={IntakeQuizScreen} options={{ title: 'New consultation' }} />
    </MoreStack.Navigator>
  );
}

const icon = (glyph: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;

// The weight journey is for the weight programme and the injection calendar is for injected medicines,
// so each tab appears only for the patient it belongs to.
function PatientTabs() {
  const { data } = useQuery(MY_PRODUCT_KIND, { fetchPolicy: 'cache-and-network' });
  const kind: string | null | undefined = data?.myProductKind;
  return (
    <Tab.Navigator sceneContainerStyle={{ backgroundColor: colors.page }} screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ink700, tabBarInactiveTintColor: colors.slate400, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
      <Tab.Screen name="Status" component={ConsultationStatusScreen} options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      {kind === 'GLP1' && <Tab.Screen name="Weight" component={WeightScreen} options={{ tabBarIcon: icon('⚖️') }} />}
      {!!kind && <Tab.Screen name="Injections" component={InjectionsScreen} options={{ title: kind === 'HRT' ? 'Doses' : 'Injections', tabBarIcon: icon('💉') }} />}
      <Tab.Screen name="Messages" component={MessagingScreen} options={{ tabBarIcon: icon('💬') }} />
      <Tab.Screen name="More" component={MoreFlow} options={{ tabBarIcon: icon('☰') }} />
    </Tab.Navigator>
  );
}

// A separate stack, not part of the tab bar — patients can't reach the rest
// of the app (Status/Messages/etc.) from in here until a clinician approves it.
function OnboardingFlow() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerTintColor: '#0d9488', contentStyle: { backgroundColor: colors.page } }}>
      <OnboardingStack.Screen name="Checklist" component={OnboardingChecklistScreen} options={{ title: 'Onboarding', headerShown: false }} />
      <OnboardingStack.Screen name="BasicInformation" component={BasicInformationScreen} options={{ title: '' }} />
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
        <Stack.Screen name="Onboarding" component={OnboardingFlow} />
        <Stack.Screen name="Main" component={PatientTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
