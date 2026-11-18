import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { t } from '../../../src/i18n';
import { colors } from '../../../src/theme';

// Bottom navigation lives only on the main pages. Plain glyphs keep us free of an icon package for now.
function glyph(char: string) {
  function TabIcon({ color }: { color: unknown }) {
    return <Text style={{ color: color as string, fontSize: 22 }}>{char}</Text>;
  }
  return TabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.hairline, minHeight: 64, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('tabTrips'), tabBarIcon: glyph('▤') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabSettings'), tabBarIcon: glyph('⚙') }} />
    </Tabs>
  );
}
