import { render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('renders its label', async () => {
    await render(<Button label="Continue" />);

    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('marks the button as disabled and busy while loading', async () => {
    await render(<Button label="Continue" isLoading />);

    const button = screen.getByRole('button');

    expect(button.props.accessibilityState?.disabled).toBe(true);
    expect(button.props.accessibilityState?.busy).toBe(true);
  });
});
