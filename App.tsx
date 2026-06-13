import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TestModeProvider } from './src/context/TestModeContext';
import { RootStackParamList } from './src/navigation/types';
import { AdminSettingsScreen } from './src/screens/AdminSettingsScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MatchDetailScreen } from './src/screens/MatchDetailScreen';
import { MatchListScreen } from './src/screens/MatchListScreen';
import { PlayerScreen } from './src/screens/PlayerScreen';
import { t } from './src/i18n/strings';
import { colors } from './src/theme/theme';

// Arabic-first UI: allow RTL layout (full flip applies after app reload).
I18nManager.allowRTL(true);

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    primary: colors.accent,
    border: colors.cardBorder,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <TestModeProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.accent,
              headerTitleStyle: { color: colors.text, fontWeight: '800' },
              headerTitleAlign: 'center',
              headerBackTitleVisible: false,
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="MatchList"
              component={MatchListScreen}
              options={{ title: t.allMatchesTitle }}
            />
            <Stack.Screen
              name="MatchDetail"
              component={MatchDetailScreen}
              options={{ title: t.matchDetailTitle }}
            />
            <Stack.Screen
              name="Player"
              component={PlayerScreen}
              options={{ title: t.playerTitle }}
            />
            <Stack.Screen
              name="AdminSettings"
              component={AdminSettingsScreen}
              options={{ title: t.adminTitle }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </TestModeProvider>
    </SafeAreaProvider>
  );
}
