const DEFAULT_CHAIN_ID = 137; // polygon mainnet
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

const INVALID_INTEGRATOR_ERROR = 'Invalid integrator value. Expected numeric chain id.';
const INTERNAL_SERVER_ERROR = 'Internal server error';

type FeesQueryInput = {
  integrator?: unknown;
  page?: unknown;
  limit?: unknown;
};

type ParsedFeesQuery = {
  chainId: number;
  page: number;
  limit: number;
  skip: number;
};

type ParsedFeesQueryResult =
  | { ok: true; value: ParsedFeesQuery }
  | { ok: false; error: string };

const parseChainId = (integratorParam: unknown): number => {
  if (typeof integratorParam !== 'string' || integratorParam.length === 0) {
    return DEFAULT_CHAIN_ID;
  }

  return Number(integratorParam);
};

const parsePage = (pageParam: unknown): number => {
  return Math.max(Number(pageParam) || DEFAULT_PAGE, DEFAULT_PAGE);
};

const parseLimit = (limitParam: unknown): number => {
  return Math.min(Math.max(Number(limitParam) || DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT);
};

const parseFeesQuery = (query: FeesQueryInput): ParsedFeesQueryResult => {
  const chainId = parseChainId(query.integrator);

  if (Number.isNaN(chainId)) {
    return { ok: false, error: INVALID_INTEGRATOR_ERROR };
  }

  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);

  return {
    ok: true,
    value: {
      chainId,
      page,
      limit,
      skip: (page - 1) * limit,
    },
  };
};

export {
  parseFeesQuery,
  INTERNAL_SERVER_ERROR,
  INVALID_INTEGRATOR_ERROR,
  type FeesQueryInput,
  type ParsedFeesQuery,
  type ParsedFeesQueryResult,
};
