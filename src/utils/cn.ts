import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins classes conditionally and resolves Tailwind conflicts
 * (`cn('p-2', 'p-4')` → `'p-4'`). Use it in every component that accepts a
 * `className` prop.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
