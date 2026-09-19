import { formatSessionDate } from './formatSessionDate';

const ISO_DATE = '2026-09-01T12:00:00.000Z';

describe('formatSessionDate', () => {
  it('turns the ISO string the API sends into something a person reads', () => {
    const formatted = formatSessionDate(ISO_DATE);

    expect(formatted).toContain('2026');
    expect(formatted).not.toContain('T12:00:00.000Z');
  });
});
