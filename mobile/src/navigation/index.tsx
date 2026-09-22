import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignUpScreen } from '../screens/auth/SignUpScreen';
import { IntakeQuizScreen } from '../screens/intake/IntakeQuizScreen';
import { ConsultationStatusScreen } from '../screens/consultation/ConsultationStatusScreen';
import { MessagingScreen } from '../screens/messaging/MessagingScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function PatientTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Status" component={ConsultationStatusScreen} />
      <Tab.Screen name="New Consultation" component={IntakeQuizScreen} />
      <Tab.Screen name="Messages" component={MessagingScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Main" component={PatientTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
