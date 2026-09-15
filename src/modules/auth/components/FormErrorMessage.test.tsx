import { render, screen } from '@testing-library/react-native';

import { FormErrorMessage } from './FormErrorMessage';

describe('FormErrorMessage', () => {
  it('renders the message when there is one', async () => {
    await render(<FormErrorMessage message="Something went wrong" />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('renders nothing when there is no message', async () => {
    await render(<FormErrorMessage message={null} />);

    expect(screen.queryByText(/.+/)).toBeNull();
  });
});
