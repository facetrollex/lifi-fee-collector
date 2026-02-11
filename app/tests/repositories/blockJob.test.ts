import {
  BlockJobModel,
  claimExpiredOrFailed,
  createJob,
  markCompleted,
  markFailed,
} from '../../repositories/BlockJob.js';
import { useMemoryMongo } from '../helpers/memoryMongo.js';

describe('BlockJob repository', () => {
  useMemoryMongo();

  it('creates a processing job with lease and defaults', async () => {
    const leaseMs = 30_000;
    const now = Date.now();

    const job = await createJob(137, 100, 199, 'worker-a', leaseMs);

    expect(job.chainId).toBe(137);
    expect(job.fromBlock).toBe(100);
    expect(job.toBlock).toBe(199);
    expect(job.status).toBe('processing');
    expect(job.lockedBy).toBe('worker-a');
    expect(job.attempts).toBe(1);
    expect(job.error).toBeNull();
    expect(job.lockedUntil).not.toBeNull();
    expect(job.lockedUntil!.getTime()).toBeGreaterThanOrEqual(now + leaseMs - 500);
  });

  it('claims a failed job and increments attempts', async () => {
    const original = await BlockJobModel.create({
      chainId: 137,
      fromBlock: 1,
      toBlock: 10,
      status: 'failed',
      lockedBy: null,
      lockedUntil: null,
      attempts: 2,
      error: 'boom',
    });

    const claimed = await claimExpiredOrFailed(137, 'worker-b', 60_000);

    expect(claimed?._id.toString()).toBe(original._id.toString());
    expect(claimed?.status).toBe('processing');
    expect(claimed?.lockedBy).toBe('worker-b');
    expect(claimed?.attempts).toBe(3);
  });

  it('enforces uniqueness for chainId and fromBlock', async () => {
    await createJob(137, 100, 199, 'worker-a', 60_000);

    await expect(createJob(137, 100, 299, 'worker-b', 60_000)).rejects.toThrow(
      /duplicate key|E11000/i,
    );
  });

  it('claims a processing job with an expired lease', async () => {
    await BlockJobModel.create({
      chainId: 137,
      fromBlock: 11,
      toBlock: 20,
      status: 'processing',
      lockedBy: 'old-worker',
      lockedUntil: new Date(Date.now() - 5_000),
      attempts: 1,
      error: null,
    });

    const claimed = await claimExpiredOrFailed(137, 'worker-c', 60_000);
    expect(claimed?.lockedBy).toBe('worker-c');
    expect(claimed?.attempts).toBe(2);
  });

  it('does not claim jobs that reached max attempts', async () => {
    await BlockJobModel.create({
      chainId: 137,
      fromBlock: 21,
      toBlock: 30,
      status: 'failed',
      lockedBy: null,
      lockedUntil: null,
      attempts: 10,
      error: 'permanent',
    });

    await expect(claimExpiredOrFailed(137, 'worker-d', 60_000)).resolves.toBeNull();
  });

  it('marks a job as completed by deleting it', async () => {
    const job = await createJob(137, 31, 40, 'worker-e', 60_000);
    await markCompleted(job._id);

    await expect(BlockJobModel.findById(job._id).lean()).resolves.toBeNull();
  });

  it('marks a job as failed and clears lock metadata', async () => {
    const job = await createJob(137, 41, 50, 'worker-f', 60_000);
    await markFailed(job._id, 'rpc timeout');

    const updated = await BlockJobModel.findById(job._id).lean();
    expect(updated?.status).toBe('failed');
    expect(updated?.lockedBy).toBeNull();
    expect(updated?.lockedUntil).toBeNull();
    expect(updated?.error).toBe('rpc timeout');
  });
});
