import { render, screen } from '@testing-library/react-native';

import { EmailInput } from './EmailInput';

const LABEL = 'Email';

describe('EmailInput', () => {
  it('configures the keyboard and autofill for an email address', async () => {
    await render(<EmailInput label={LABEL} onChangeText={jest.fn()} value="" />);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoComplete).toBe('email');
    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.secureTextEntry).toBe(false);
  });
});
