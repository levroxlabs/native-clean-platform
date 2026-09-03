import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { classifyError, ERROR_KINDS } from './classify';
import { copyForError } from './copy';
import { configureErrorReporter } from './reporter';

const TOAST_DURATION_MS = 4000;
const FADE_DURATION_MS = 200;
const TOAST_TOP_OFFSET = 8;
const HIDDEN_OPACITY = 0;
const VISIBLE_OPACITY = 1;

const IOS_PLATFORM = 'ios';

export interface ErrorToastValue {
  showError: (error: unknown) => void;
}

/**
 * Lives with its provider rather than in a file of its own: only `useErrorToast`
 * reads it, and the provider is the only thing that can fill it.
 */
export const ErrorToastContext = createContext<ErrorToastValue | null>(null);

export const ErrorToastProvider = ({ children }: PropsWithChildren) => {
  const [message, setMessage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(HIDDEN_OPACITY)).current;
  const dismissTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimeout = useCallback(() => {
    if (dismissTimeout.current !== null) clearTimeout(dismissTimeout.current);
    dismissTimeout.current = null;
  }, []);

  const hide = useCallback(() => {
    clearDismissTimeout();
    Animated.timing(opacity, {
      toValue: HIDDEN_OPACITY,
      duration: FADE_DURATION_MS,
      useNativeDriver: true,
    }).start(() => setMessage(null));
  }, [clearDismissTimeout, opacity]);

  const showError = useCallback(
    (error: unknown) => {
      // A session error is already sending the user to sign-in; a red message
      // beside that redirect reads as a second, unrelated failure.
      if (classifyError(error) === ERROR_KINDS.SESSION) return;

      const copy = copyForError(error);

      setMessage(copy);
      // Android gets it from accessibilityLiveRegion below; iOS has no
      // equivalent and would announce nothing at all without this.
      if (Platform.OS === IOS_PLATFORM) AccessibilityInfo.announceForAccessibility(copy);

      clearDismissTimeout();
      dismissTimeout.current = setTimeout(hide, TOAST_DURATION_MS);

      opacity.setValue(HIDDEN_OPACITY);
      Animated.timing(opacity, {
        toValue: VISIBLE_OPACITY,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start();
    },
    [clearDismissTimeout, hide, opacity],
  );

  useEffect(() => {
    configureErrorReporter(showError);

    return () => configureErrorReporter(null);
  }, [showError]);

  useEffect(() => clearDismissTimeout, [clearDismissTimeout]);

  const value = useMemo<ErrorToastValue>(() => ({ showError }), [showError]);

  return (
    <ErrorToastContext.Provider value={value}>
      <View className="flex-1">
        {children}
        {message === null ? null : (
          <Animated.View
            accessibilityLiveRegion="polite"
            className="absolute inset-x-4 rounded-lg bg-danger-surface p-4"
            // Forced inline: an Animated.Value and a runtime safe-area inset
            // cannot travel through className.
            style={{ opacity, top: insets.top + TOAST_TOP_OFFSET }}
          >
            <Pressable accessibilityRole="button" onPress={hide}>
              <Text className="text-sm text-danger">{message}</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </ErrorToastContext.Provider>
  );
};
