import { BigNumber } from 'ethers';
import { Rpc } from '../../utils/rpc.js';

type MockedRpc = {
  rpc: Rpc;
  provider: {
    getNetwork: jest.Mock;
    getBlockNumber: jest.Mock;
    getCode: jest.Mock;
  };
  contract: {
    filters: { FeesCollected: jest.Mock };
    queryFilter: jest.Mock;
    interface: { parseLog: jest.Mock };
    address: string;
    provider: unknown;
  };
};

const buildRpcWithMocks = (): MockedRpc => {
  const rpc = new Rpc('0x0000000000000000000000000000000000000001', 'http://localhost:8545');

  const provider = {
    getNetwork: jest.fn(),
    getBlockNumber: jest.fn(),
    getCode: jest.fn(),
  };

  const contract = {
    filters: {
      FeesCollected: jest.fn().mockReturnValue('fees-filter'),
    },
    queryFilter: jest.fn(),
    interface: {
      parseLog: jest.fn(),
    },
    address: '0x0000000000000000000000000000000000000001',
    provider,
  };

  (rpc as unknown as { feeCollectorContract: typeof contract }).feeCollectorContract = contract;
  (rpc as unknown as { provider: typeof provider }).provider = provider;

  return { rpc, provider, contract };
};

describe('Rpc utility', () => {
  it('loads fee collector events for block range', async () => {
    const { rpc, contract } = buildRpcWithMocks();
    const events = [{ transactionHash: '0xabc' }];
    contract.queryFilter.mockResolvedValue(events);

    await expect(rpc.loadFeeCollectorEvents(100, 120)).resolves.toEqual(events);

    expect(contract.filters.FeesCollected).toHaveBeenCalledTimes(1);
    expect(contract.queryFilter).toHaveBeenCalledWith('fees-filter', 100, 120);
  });

  it('parses raw events into fee event objects', async () => {
    const { rpc, contract } = buildRpcWithMocks();
    contract.interface.parseLog.mockReturnValue({
      args: [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
        BigNumber.from(12),
        BigNumber.from(34),
      ],
    });

    const parsed = await rpc.parseFeeCollectorEvents([
      {
        transactionHash: '0xhash',
        logIndex: 9,
        blockNumber: 500,
      } as never,
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      transactionHash: '0xhash',
      logIndex: 9,
      blockNumber: 500,
      token: '0x0000000000000000000000000000000000000001',
      integrator: '0x0000000000000000000000000000000000000002',
      integratorFee: BigNumber.from(12),
      lifiFee: BigNumber.from(34),
    });
  });

  it('validates chain id and deployed contract during testConnection', async () => {
    const { rpc, provider } = buildRpcWithMocks();
    provider.getNetwork.mockResolvedValue({ chainId: 137 });
    provider.getBlockNumber.mockResolvedValue(12345);
    provider.getCode.mockResolvedValue('0x1234');

    await expect(rpc.testConnection(137)).resolves.toBeUndefined();
    expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
    expect(provider.getCode).toHaveBeenCalledTimes(1);
  });

  it('throws when RPC network chain id does not match expected', async () => {
    const { rpc, provider } = buildRpcWithMocks();
    provider.getNetwork.mockResolvedValue({ chainId: 10 });

    await expect(rpc.testConnection(137)).rejects.toThrow('Wrong RPC chain id');
  });

  it('throws when contract is not deployed at configured address', async () => {
    const { rpc, provider } = buildRpcWithMocks();
    provider.getNetwork.mockResolvedValue({ chainId: 137 });
    provider.getBlockNumber.mockResolvedValue(12345);
    provider.getCode.mockResolvedValue('0x');

    await expect(rpc.testConnection(137)).rejects.toThrow('No contract deployed');
  });

  it('returns provider max block number', async () => {
    const { rpc, provider } = buildRpcWithMocks();
    provider.getBlockNumber.mockResolvedValue(900);

    await expect(rpc.getMaxBlock()).resolves.toBe(900);
  });
});
