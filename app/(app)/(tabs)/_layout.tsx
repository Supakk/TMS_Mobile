import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { t } from '../../../src/i18n';
import { colors } from '../../../src/theme';

// Bottom navigation lives only on the main pages. There is no tab for stats, scanning or inspections yet:
// the backend has nothing for them, and an empty tab would only be a place to get lost.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.hairline, minHeight: 64, paddingTop: 6 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabTrips'),
          tabBarIcon: ({ color }) => <Ionicons name="cube-outline" size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabSettings'),
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={24} color={color as string} />,
        }}
      />
    </Tabs>
  );
}
