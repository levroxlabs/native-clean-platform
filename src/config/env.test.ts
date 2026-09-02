import { readApiBaseUrl } from './env';

describe('readApiBaseUrl', () => {
  it('returns the URL when it is set', () => {
    expect(readApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('accepts the address an Android emulator uses for the host machine', () => {
    expect(readApiBaseUrl('http://10.0.2.2:3000')).toBe('http://10.0.2.2:3000');
  });

  it('drops a trailing slash so paths never double up', () => {
    expect(readApiBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });

  it('names the variable when it is missing', () => {
    expect(() => readApiBaseUrl(undefined)).toThrow('EXPO_PUBLIC_API_URL');
  });

  it('names the variable when it is blank', () => {
    expect(() => readApiBaseUrl('   ')).toThrow('EXPO_PUBLIC_API_URL');
  });

  it('rejects a value that is not an http URL', () => {
    expect(() => readApiBaseUrl('localhost:3000')).toThrow('EXPO_PUBLIC_API_URL');
  });
});
