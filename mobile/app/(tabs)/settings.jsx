import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';

export default function Settings() {
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);

  function handleLogout() {
    Alert.alert(
      'Sign out?',
      'You can sign back in anytime.',
      [
        { text: 'Cancel',    style: 'cancel' },
        { text: 'Sign out',  style: 'destructive', onPress: logout },
      ],
    );
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently removes your account, all kids, sources, and events. ' +
      'Active subscriptions will be cancelled. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Are you sure?',
            'Last chance — this is permanent.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await api.del('/api/auth/delete-account');
                    await logout();
                  } catch (err) {
                    setDeleting(false);
                    Alert.alert('Could not delete account', err.message || 'Please try again or contact support.');
                  }
                },
              },
            ],
          ),
        },
      ],
    );
  }

  return (
    <View style={s.root}>
      <View style={s.section}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{user?.name}</Text>
        <Text style={s.sub}>{user?.email}</Text>
      </View>

      <View style={s.section}>
        <Text style={s.label}>Plan</Text>
        <Text style={s.value}>
          {user?.plan === 'premium' ? 'Premium' : 'Free'}
        </Text>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[s.deleteBtn, deleting && { opacity: 0.6 }]}
        onPress={handleDeleteAccount}
        disabled={deleting}
        activeOpacity={0.7}
      >
        {deleting
          ? <ActivityIndicator color="#8896b0" />
          : <Text style={s.deleteText}>Delete account</Text>}
      </TouchableOpacity>

      <Text style={s.footer}>SportsCal v0.1.0 — mobile beta</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#f4f6fa', padding: 20 },
  section:  {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#e8ecf4',
  },
  label:    { fontSize: 11, color: '#8896b0', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  value:    { fontSize: 16, fontWeight: '600', color: '#0f1629' },
  sub:      { fontSize: 13, color: '#8896b0', marginTop: 2 },
  logoutBtn:{
    borderWidth: 1, borderColor: '#ff6b6b', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8, backgroundColor: '#ffffff',
  },
  logoutText: { color: '#ff6b6b', fontSize: 15, fontWeight: '500' },
  deleteBtn: {
    borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    marginTop: 24, backgroundColor: 'transparent',
  },
  deleteText: { color: '#8896b0', fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
  footer:   { textAlign: 'center', fontSize: 12, color: '#8896b0', marginTop: 32 },
});
