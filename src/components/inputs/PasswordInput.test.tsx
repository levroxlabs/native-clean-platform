import { render, screen } from '@testing-library/react-native';

import { PasswordInput } from './PasswordInput';

const LABEL = 'Password';

describe('PasswordInput', () => {
  it('hides the input and offers to fill the current password by default', async () => {
    await render(<PasswordInput label={LABEL} onChangeText={jest.fn()} value="" />);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe('current-password');
  });

  it('asks the password manager to generate rather than to fill a new password', async () => {
    await render(<PasswordInput label={LABEL} onChangeText={jest.fn()} value="" variant="new" />);

    expect(screen.getByLabelText(LABEL).props.autoComplete).toBe('new-password');
  });
});
