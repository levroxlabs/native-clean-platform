import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import './global.css';

import { RootNavigator } from '@/navigation';

/** `GestureHandlerRootView` needs a real style object — NativeWind cannot reach it. */
const ROOT_STYLE = { flex: 1 } as const;

const STATUS_BAR_STYLE = 'auto';

const App = () => (
  <GestureHandlerRootView style={ROOT_STYLE}>
    <SafeAreaProvider>
      <StatusBar style={STATUS_BAR_STYLE} />
      <RootNavigator />
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

export default App;
