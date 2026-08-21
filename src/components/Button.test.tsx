import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('renders its label', async () => {
    await render(<Button label="Continue" />);

    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('marks the button as disabled and busy while loading', async () => {
    await render(<Button label="Continue" isLoading />);

    const button = screen.getByRole('button');

    expect(button).toBeDisabled();
    expect(button).toBeBusy();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
