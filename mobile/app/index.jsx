// The root route just shows a blank screen — AuthGate in _layout handles
// the actual redirect once auth state is resolved.
import { View } from 'react-native';
export default function Index() {
  return <View style={{ flex: 1, backgroundColor: '#0f1629' }} />;
}
