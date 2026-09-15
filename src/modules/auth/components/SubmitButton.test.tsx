import { render, screen } from '@testing-library/react-native';

import { SubmitButton } from './SubmitButton';

const LABEL = 'Sign in';

describe('SubmitButton', () => {
  it('shows the label and stays enabled while idle', async () => {
    await render(<SubmitButton isPending={false} label={LABEL} onPress={jest.fn()} />);

    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(false);
  });

  it('swaps the label for a spinner and disables the button while pending', async () => {
    await render(<SubmitButton isPending={true} label={LABEL} onPress={jest.fn()} />);

    expect(screen.queryByText(LABEL)).toBeNull();
    expect(screen.getByRole('button').props.accessibilityState.disabled).toBe(true);
  });
});
