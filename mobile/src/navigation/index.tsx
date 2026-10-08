import React from 'react';
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
import { OrdersScreen } from '../screens/orders/OrdersScreen';
import { AccountScreen } from '../screens/account/AccountScreen';
import { navigationRef } from './navigationRef';

const Stack = createNativeStackNavigator();
const OnboardingStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function PatientTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Status" component={ConsultationStatusScreen} />
      <Tab.Screen name="New Consultation" component={IntakeQuizScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Messages" component={MessagingScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

// A separate stack, not part of the tab bar — patients can't reach the rest
// of the app (Status/Messages/etc.) from in here until a clinician approves it.
function OnboardingFlow() {
  return (
    <OnboardingStack.Navigator screenOptions={{ headerTintColor: '#0d9488' }}>
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
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingFlow} />
        <Stack.Screen name="Main" component={PatientTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
