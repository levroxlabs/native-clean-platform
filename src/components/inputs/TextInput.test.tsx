import { fireEvent, render, screen } from '@testing-library/react-native';

import { TextInput } from './TextInput';

const LABEL = 'Field under test';

describe('TextInput', () => {
  it('renders the label and the current value', async () => {
    await render(<TextInput label={LABEL} onChangeText={jest.fn()} value="hello" />);

    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByLabelText(LABEL).props.value).toBe('hello');
  });

  it('fires onChangeText with what the user typed', async () => {
    const handleChangeText = jest.fn();
    await render(<TextInput label={LABEL} onChangeText={handleChangeText} value="" />);

    await fireEvent.changeText(screen.getByLabelText(LABEL), 'typed value');

    expect(handleChangeText).toHaveBeenCalledWith('typed value');
  });

  it('shows the error message when one is given', async () => {
    await render(<TextInput error="Required" label={LABEL} onChangeText={jest.fn()} value="" />);

    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('shows no error text when none is given', async () => {
    await render(<TextInput label={LABEL} onChangeText={jest.fn()} value="" />);

    expect(screen.queryByText('Required')).toBeNull();
  });
});
