import { cn } from './cn';

describe('cn', () => {
  it('merges conflicting Tailwind classes, keeping the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy values', () => {
    expect(cn('text-base', false && 'hidden', undefined, 'font-bold')).toBe('text-base font-bold');
  });
});
