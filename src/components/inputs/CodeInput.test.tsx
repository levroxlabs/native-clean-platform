import { render, screen } from '@testing-library/react-native';

import { CodeInput } from './CodeInput';

const LABEL = 'Verification code';
const DIGITS = 6;

describe('CodeInput', () => {
  it('gives a code a numeric keypad, the one-time-code hint and a matching max length', async () => {
    await render(<CodeInput digits={DIGITS} label={LABEL} onChangeText={jest.fn()} value="" />);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.maxLength).toBe(DIGITS);
  });
});
