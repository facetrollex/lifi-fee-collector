import {
  LastBlockModel,
  claimNextRange,
  findLastBlock,
  seedCursor,
  updateLastBlock,
} from '../../repositories/LastBlock.js';
import { useMemoryMongo } from '../helpers/memoryMongo.js';

describe('LastBlock repository', () => {
  useMemoryMongo();

  it('finds null when no cursor exists', async () => {
    await expect(findLastBlock(137)).resolves.toBeNull();
  });

  it('seeds cursor only once for the same chain id', async () => {
    await seedCursor(137, 100);
    await seedCursor(137, 200);

    const cursor = await LastBlockModel.findOne({ chainId: 137 }).lean();
    expect(cursor?.blockNumber).toBe(100);
  });

  it('updates and reads the last block cursor', async () => {
    await updateLastBlock(137, 321);
    await expect(findLastBlock(137)).resolves.toBe(321);
  });

  it('claims a range and advances the cursor by batch size', async () => {
    await seedCursor(137, 100);

    const range = await claimNextRange(137, 10, 130);
    const updated = await LastBlockModel.findOne({ chainId: 137 }).lean();

    expect(range).toEqual({ fromBlock: 100, toBlock: 109 });
    expect(updated?.blockNumber).toBe(110);
  });

  it('claims non-overlapping ranges under concurrent workers', async () => {
    await seedCursor(137, 100);

    const [rangeA, rangeB] = await Promise.all([
      claimNextRange(137, 10, 130),
      claimNextRange(137, 10, 130),
    ]);

    const ranges = [rangeA, rangeB].filter(
      (range): range is { fromBlock: number; toBlock: number } => range !== null,
    );

    expect(ranges).toHaveLength(2);
    expect(new Set(ranges.map((range) => range.fromBlock)).size).toBe(2);

    const sorted = [...ranges].sort((a, b) => a.fromBlock - b.fromBlock);
    expect(sorted).toEqual([
      { fromBlock: 100, toBlock: 109 },
      { fromBlock: 110, toBlock: 119 },
    ]);

    const updated = await LastBlockModel.findOne({ chainId: 137 }).lean();
    expect(updated?.blockNumber).toBe(120);
  });

  it('caps the range at maxBlock when close to chain tip', async () => {
    await seedCursor(137, 100);

    const range = await claimNextRange(137, 10, 105);
    const updated = await LastBlockModel.findOne({ chainId: 137 }).lean();

    expect(range).toEqual({ fromBlock: 100, toBlock: 105 });
    expect(updated?.blockNumber).toBe(106);
  });

  it('returns null when cursor is already at or above max block', async () => {
    await seedCursor(137, 106);

    await expect(claimNextRange(137, 10, 105)).resolves.toBeNull();
  });
});
