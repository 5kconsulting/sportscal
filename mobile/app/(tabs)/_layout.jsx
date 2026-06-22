import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   '#00d68f',
        tabBarInactiveTintColor: '#8896b0',
        // Edge-to-edge dark navy: no rounding on the top of the tab bar
        // or the bottom of the header. The earlier rounded-corner look
        // read as a "screen inside a screen" on real devices (especially
        // when the iPhone's own rounded corners cut just outside the
        // bar's inner curve). Flat reads cleaner.
        tabBarStyle: {
          backgroundColor: '#0f1629',
          borderTopColor:  '#243050',
          borderTopWidth:  0,
        },
        headerStyle: {
          backgroundColor: '#0f1629',
        },
        headerTintColor:  '#ffffff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
