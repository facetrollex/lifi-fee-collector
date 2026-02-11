import { BlockJobModel, claimExpiredOrFailed, createJob } from '../../repositories/BlockJob.js';
import { claimNextRange, seedCursor } from '../../repositories/LastBlock.js';
import { useMemoryMongo } from '../helpers/memoryMongo.js';

describe('multi-worker integration', () => {
  useMemoryMongo();

  it('allows only one worker to claim a single available range', async () => {
    const chainId = 137;
    await seedCursor(chainId, 78_600_000);

    const [rangeA, rangeB] = await Promise.all([
      claimNextRange(chainId, 10, 78_600_009),
      claimNextRange(chainId, 10, 78_600_009),
    ]);

    const claims = [
      { workerId: 'worker-a', range: rangeA },
      { workerId: 'worker-b', range: rangeB },
    ].filter(
      (claim): claim is { workerId: string; range: { fromBlock: number; toBlock: number } } =>
        claim.range !== null,
    );

    expect(claims).toHaveLength(1);
    const [{ workerId, range }] = claims;

    const job = await createJob(chainId, range.fromBlock, range.toBlock, workerId, 60_000);

    expect(job.fromBlock).toBe(78_600_000);
    expect(job.toBlock).toBe(78_600_009);
    expect(job.lockedBy).toBe(workerId);
    await expect(BlockJobModel.countDocuments({ chainId })).resolves.toBe(1);
  });

  it('lets worker B reclaim worker A job after lease expiry', async () => {
    const chainId = 137;
    await seedCursor(chainId, 78_600_000);

    const range = await claimNextRange(chainId, 10, 78_600_030);
    expect(range).not.toBeNull();
    if (!range) {
      return;
    }

    const job = await createJob(chainId, range.fromBlock, range.toBlock, 'worker-a', 60_000);
    await BlockJobModel.updateOne(
      { _id: job._id },
      { lockedUntil: new Date(Date.now() - 5_000), status: 'processing' },
    );

    const reclaimed = await claimExpiredOrFailed(chainId, 'worker-b', 60_000);

    expect(reclaimed).not.toBeNull();
    expect(reclaimed?._id.toString()).toBe(job._id.toString());
    expect(reclaimed?.lockedBy).toBe('worker-b');
    expect(reclaimed?.status).toBe('processing');
    expect(reclaimed?.attempts).toBe(2);
  });
});
