import { BigNumber } from 'ethers';
import {
  FeeEventModel,
  findFeeEvents,
  upsertFeeEvents,
} from '../../repositories/FeeEvent.js';
import { useMemoryMongo } from '../helpers/memoryMongo.js';

describe('FeeEvent repository', () => {
  useMemoryMongo();

  it('returns 0 when upserting an empty event batch', async () => {
    await expect(upsertFeeEvents(137, [])).resolves.toBe(0);
  });

  it('upserts events idempotently by transactionHash + logIndex', async () => {
    const events = [
      {
        transactionHash: '0xaaa',
        logIndex: 0,
        blockNumber: 100,
        token: '0x0000000000000000000000000000000000000001',
        integrator: '0x0000000000000000000000000000000000000002',
        integratorFee: BigNumber.from(10),
        lifiFee: BigNumber.from(5),
      },
      {
        transactionHash: '0xbbb',
        logIndex: 1,
        blockNumber: 101,
        token: '0x0000000000000000000000000000000000000003',
        integrator: '0x0000000000000000000000000000000000000004',
        integratorFee: BigNumber.from(20),
        lifiFee: BigNumber.from(7),
      },
    ];

    await expect(upsertFeeEvents(137, events)).resolves.toBe(2);
    await expect(upsertFeeEvents(137, events)).resolves.toBe(0);

    await expect(FeeEventModel.countDocuments({ chainId: 137 })).resolves.toBe(2);
  });

  it('finds events by chain id with pagination and sort order', async () => {
    await upsertFeeEvents(137, [
      {
        transactionHash: '0x1',
        logIndex: 0,
        blockNumber: 100,
        token: '0x0000000000000000000000000000000000000001',
        integrator: '0x0000000000000000000000000000000000000002',
        integratorFee: BigNumber.from(1),
        lifiFee: BigNumber.from(1),
      },
      {
        transactionHash: '0x2',
        logIndex: 0,
        blockNumber: 200,
        token: '0x0000000000000000000000000000000000000001',
        integrator: '0x0000000000000000000000000000000000000002',
        integratorFee: BigNumber.from(2),
        lifiFee: BigNumber.from(2),
      },
      {
        transactionHash: '0x3',
        logIndex: 1,
        blockNumber: 200,
        token: '0x0000000000000000000000000000000000000001',
        integrator: '0x0000000000000000000000000000000000000002',
        integratorFee: BigNumber.from(3),
        lifiFee: BigNumber.from(3),
      },
    ]);

    await upsertFeeEvents(56, [
      {
        transactionHash: '0x4',
        logIndex: 0,
        blockNumber: 300,
        token: '0x0000000000000000000000000000000000000001',
        integrator: '0x0000000000000000000000000000000000000002',
        integratorFee: BigNumber.from(4),
        lifiFee: BigNumber.from(4),
      },
    ]);

    const pageOne = await findFeeEvents(137, 0, 2);
    expect(pageOne.total).toBe(3);
    expect(pageOne.data).toHaveLength(2);
    expect(pageOne.data[0]?.transactionHash).toBe('0x3');
    expect(pageOne.data[1]?.transactionHash).toBe('0x2');

    const pageTwo = await findFeeEvents(137, 2, 2);
    expect(pageTwo.data).toHaveLength(1);
    expect(pageTwo.data[0]?.transactionHash).toBe('0x1');
  });
});
