import { fireEvent, render, screen } from '@testing-library/react-native';

import { HomeScreen } from './HomeScreen';

const ACCOUNT_LABEL = 'Account';

const navigation = { navigate: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

const renderScreen = async () =>
  render(
    <HomeScreen navigation={navigation as never} route={{ key: 'k', name: 'Home' } as never} />,
  );

describe('HomeScreen', () => {
  it('renders the signed-in area', async () => {
    await renderScreen();

    expect(screen.getByText('Signed-in area')).toBeTruthy();
  });

  it('opens the account area, which now owns both sign-outs', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText(ACCOUNT_LABEL));

    expect(navigation.navigate).toHaveBeenCalledWith('Account', { screen: 'Account' });
  });
});
