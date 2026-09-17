import { classnames } from './classnames';

describe('classnames', () => {
  it('merges conflicting Tailwind classes, keeping the last one', () => {
    expect(classnames('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(classnames('text-base', false && 'hidden', undefined, 'font-bold')).toBe(
      'text-base font-bold',
    );
  });
});
