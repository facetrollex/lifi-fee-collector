import { INVALID_INTEGRATOR_ERROR, parseFeesQuery } from '../../api/feesQuery.js';

describe('feesQuery parser', () => {
  it('returns validation error for non-numeric integrator', () => {
    const parsed = parseFeesQuery({ integrator: 'polygon' });

    expect(parsed).toEqual({
      ok: false,
      error: INVALID_INTEGRATOR_ERROR,
    });
  });

  it('uses defaults when query params are missing', () => {
    const parsed = parseFeesQuery({});

    expect(parsed).toEqual({
      ok: true,
      value: {
        chainId: 137,
        page: 1,
        limit: 20,
        skip: 0,
      },
    });
  });

  it('clamps pagination values and computes skip', () => {
    const parsed = parseFeesQuery({
      integrator: '137',
      page: '-2',
      limit: '500',
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        chainId: 137,
        page: 1,
        limit: 100,
        skip: 0,
      },
    });
  });
});
