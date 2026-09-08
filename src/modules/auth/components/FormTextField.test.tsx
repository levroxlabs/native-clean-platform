import { render, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { VERIFICATION_CODE_DIGITS } from '../validations';
import { FIELD_TYPES, type FieldType, FormTextField } from './FormTextField';

const LABEL = 'Field under test';

interface Values {
  value: string;
}

const Host = ({ type }: { type: FieldType }) => {
  const { control } = useForm<Values>({ defaultValues: { value: '' } });

  return <FormTextField control={control} label={LABEL} name="value" type={type} />;
};

const renderField = async (type: FieldType) => render(<Host type={type} />);

describe('FormTextField', () => {
  it('gives a verification code a numeric keypad and the one-time-code hint', async () => {
    await renderField(FIELD_TYPES.CODE);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.autoComplete).toBe('one-time-code');
    expect(input.props.maxLength).toBe(VERIFICATION_CODE_DIGITS);
  });

  it('asks the password manager to generate rather than to fill a new password', async () => {
    await renderField(FIELD_TYPES.NEW_PASSWORD);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.autoComplete).toBe('new-password');
    expect(input.props.secureTextEntry).toBe(true);
  });

  it('keeps a pasted token intact, with no autocorrect and no autocapitalisation', async () => {
    // Either one silently produces a token the API rejects with the same
    // generic error it gives an invented one — the user could not tell why.
    await renderField(FIELD_TYPES.TOKEN);

    const input = screen.getByLabelText(LABEL);

    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.secureTextEntry).toBe(false);
  });

  it('leaves the existing kinds alone', async () => {
    await renderField(FIELD_TYPES.EMAIL);

    expect(screen.getByLabelText(LABEL).props.keyboardType).toBe('email-address');
  });
});
