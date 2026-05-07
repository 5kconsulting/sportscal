import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   '#00d68f',
        tabBarInactiveTintColor: '#8896b0',
        // Floating-panel look: rounded top corners on the bottom tab
        // bar reveal the screen bg behind them, matching the design
        // mockups. Position absolute lets the tab bar sit cleanly above
        // the screen content without an opaque base.
        tabBarStyle: {
          backgroundColor: '#0f1629',
          borderTopColor:  '#243050',
          borderTopWidth:  0,
          borderTopLeftRadius:  22,
          borderTopRightRadius: 22,
        },
        // Mirror move on the navigation header — rounded bottom corners
        // make the dark navy title band feel like a pull-down sheet.
        headerStyle: {
          backgroundColor:         '#0f1629',
          borderBottomLeftRadius:  22,
          borderBottomRightRadius: 22,
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
