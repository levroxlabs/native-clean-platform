import { z } from 'zod';

import { parseOrThrow } from './parseOrThrow';
import { API_ERROR_CODES, CLIENT_FAILURE_STATUS } from './responseInterceptor';

const schema = z.object({ id: z.string().uuid() });
const VALID_ID = '0d3d5d8a-6f2e-4d2e-9f1a-6d0f9a3b5c21';

describe('parseOrThrow', () => {
  it('returns the parsed payload when it matches the schema', () => {
    expect(parseOrThrow(schema, { id: VALID_ID })).toEqual({ id: VALID_ID });
  });

  it('throws an ApiError with the client failure status when the payload drifts', () => {
    expect(() => parseOrThrow(schema, { id: 'not-a-uuid' })).toThrow(
      expect.objectContaining({
        status: CLIENT_FAILURE_STATUS,
        code: API_ERROR_CODES.UNEXPECTED_RESPONSE,
      }),
    );
  });
});
