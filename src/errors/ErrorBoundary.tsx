import { Component, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

const COPY = {
  title: 'Something went wrong',
  description: 'The app hit an unexpected problem and could not continue.',
  retryLabel: 'Try again',
} as const;

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * The one class component in this codebase, and a deliberate exception to rule
 * 2 of `AGENTS.md`: `getDerivedStateFromError` has no hook equivalent in any
 * released version of React, so a boundary cannot be an arrow function.
 *
 * Two limits are accepted rather than engineered around, and both are in this
 * folder's README: one boundary at the root means a screen crash blanks the
 * whole app, and "try again" only remounts the subtree — a deterministic error
 * comes straight back.
 */
export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  private readonly reset = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="mb-2 text-2xl font-semibold text-content">{COPY.title}</Text>
        <Text className="mb-6 text-center text-base text-content-muted">{COPY.description}</Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-lg bg-primary px-4 py-3 active:bg-primary-pressed"
          onPress={this.reset}
        >
          <Text className="text-base font-semibold text-content-inverse">{COPY.retryLabel}</Text>
        </Pressable>
      </View>
    );
  }
}
