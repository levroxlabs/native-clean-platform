import { render, screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { FORM_FIELD_TYPES, FormField, type FormFieldType } from './FormField';

const LABEL = 'Field under test';
const DIGITS = 6;

interface Values {
  value: string;
}

interface HostProps {
  type: FormFieldType;
  digits?: number;
  inputProps?: Record<string, unknown>;
}

const Host = ({ type, digits, inputProps }: HostProps) => {
  const { control } = useForm<Values>({ defaultValues: { value: '' } });

  return (
    <FormField
      control={control}
      digits={digits}
      inputProps={inputProps}
      label={LABEL}
      name="value"
      type={type}
    />
  );
};

const renderField = async (props: HostProps) => render(<Host {...props} />);

describe('FormField', () => {
  it('renders an email input for the email type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.EMAIL });

    expect(screen.getByLabelText(LABEL).props.keyboardType).toBe('email-address');
  });

  it('renders a current-password input for the password type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.PASSWORD });

    expect(screen.getByLabelText(LABEL).props.autoComplete).toBe('current-password');
  });

  it('renders a new-password input for the newPassword type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.NEW_PASSWORD });

    expect(screen.getByLabelText(LABEL).props.autoComplete).toBe('new-password');
  });

  it('renders a code input with the given digits for the code type', async () => {
    await renderField({ type: FORM_FIELD_TYPES.CODE, digits: DIGITS });

    expect(screen.getByLabelText(LABEL).props.maxLength).toBe(DIGITS);
  });

  it('throws when the code type is used without digits', async () => {
    await expect(renderField({ type: FORM_FIELD_TYPES.CODE })).rejects.toThrow(
      'FormField requires `digits` when type is "code".',
    );
  });

  it('renders a bare text input for the text type, and passes inputProps through', async () => {
    // The token field is the reason this exists: not a universal enough
    // concept for its own component, so it configures the bare text input
    // through this escape hatch instead.
    await renderField({
      type: FORM_FIELD_TYPES.TEXT,
      inputProps: { autoCapitalize: 'none', autoComplete: 'off', autoCorrect: false },
    });

    const input = screen.getByLabelText(LABEL);

    expect(input.props.autoCapitalize).toBe('none');
    expect(input.props.autoComplete).toBe('off');
    expect(input.props.autoCorrect).toBe(false);
  });
});
