import { logger } from '../utils/logger.js';
import { collectorConfig, chainConfig } from '../config.js';
import { Rpc, type ParsedFeeCollectedEvents } from '../utils/rpc.js';
import { ethers } from 'ethers';
import { seedCursor, claimNextRange } from '../repositories/LastBlock.js';
import {
  createJob,
  claimExpiredOrFailed,
  markCompleted,
  markFailed,
  type BlockJobDoc,
} from '../repositories/BlockJob.js';
import { upsertFeeEvents } from '../repositories/FeeEvent.js';
import { toErrorMessage, withRetry } from '../utils/helpers.js';

type CollectorMode = 'historical' | 'realtime';


class Collector {
  private readonly workerId: string;
  private readonly chainId: number;
  private rpcConfiguration: {
    rpcUrl: string;
    contractAddress: string;
    startPoint: number;
  };
  private mode: CollectorMode = 'historical';

  private rpcClient: Rpc;

  constructor(workerId: string, chainId: number) {
    this.workerId = workerId;
    this.chainId = chainId;

    if (!chainConfig.rpcUrl || !chainConfig.contractAddress || !chainConfig.startPoint) {
      throw new Error(
        `Invalid chain config for chain id ${this.chainId}: RPC_URL, CONTRACT_ADDRESS and START_POINT are required`
      );
    }

    const startPoint = Number(chainConfig.startPoint);

    if (Number.isNaN(startPoint)) {
      throw new Error(`Invalid chain config for chain id ${this.chainId}: START_POINT must be a number`);
    }

    this.rpcConfiguration = {
      rpcUrl: chainConfig.rpcUrl,
      contractAddress: chainConfig.contractAddress,
      startPoint,
    };
    this.rpcClient = new Rpc(this.rpcConfiguration.contractAddress, this.rpcConfiguration.rpcUrl);

    logger.info(`[${this.workerId}] Stage 0: Provisioned chain id ${this.chainId}.`);
  }

  /**
   * Run one collection iteration.
   * Returns `true` if a batch was processed, `false` if nothing to do (caller should sleep).
   */
  async collect(): Promise<boolean> {
    let job: BlockJobDoc | null = null;

    try {
      // Stage 1: Claim the Job
      logger.info(`[${this.workerId}] Stage 1: Claim the Job.`);

      job = await withRetry(() => this.claimJob(), this.workerId);

      if(!job) {
        return false;
      }

      const jobId = job._id;

      logger.info(`[${this.workerId}] Stage 1: Job claimed successfully. ID: ${jobId}`);
      //--------------------------------

      // Stage 2: Load Fee Collector Events
      logger.info(`[${this.workerId}] Stage 2: Loading Fee Collector Events.`);

      const events: ethers.Event[] = await this.rpcClient.loadFeeCollectorEvents(job.fromBlock, job.toBlock);

      logger.info(`[${this.workerId}] Stage 2: Completed. Loaded ${events.length} Fee Collector Events.`);
      //--------------------------------

      // Stage 3: Parse Fee Collector Events
      logger.info(`[${this.workerId}] Stage 3: Parsing Fee Collector Events.`);

      const parsedEvents: ParsedFeeCollectedEvents[] = await this.rpcClient.parseFeeCollectorEvents(events);

      logger.info(`[${this.workerId}] Stage 3: Completed. Parsed ${parsedEvents.length} Fee Collector Events.`);
      //--------------------------------

      // Stage 4: Store Fee Collector Events into database
      logger.info(`[${this.workerId}] Stage 4: Storing Fee Collector Events into database.`);

      const upserted = await withRetry(() => upsertFeeEvents(this.chainId, parsedEvents), this.workerId);

      logger.info(`[${this.workerId}] Stage 4: Completed. Upserted ${upserted}/${parsedEvents.length} Fee Collector Events.`);
      //--------------------------------

      // Stage 5: Mark job completed
      logger.info(`[${this.workerId}] Stage 5: Marking job completed.`);

      await withRetry(() => markCompleted(jobId), this.workerId);

      logger.info(`[${this.workerId}] Stage 5: Completed. Job ${jobId} done.`);
      //--------------------------------
    } catch (err: unknown) {
      const errorMsg = toErrorMessage(err);
      logger.error(`[${this.workerId}] Job failed: ${errorMsg}`);

      if(job) {
        const failedJobId = job._id
        await withRetry(() => markFailed(failedJobId, errorMsg), this.workerId);
        return false;
      }
    }

    return true; // We did scrape/store attempt, in case of error another iteration may retry it.
  }

  public async seedCursor(): Promise<void> {
    logger.debug(`[${this.workerId}] Seeding cursor for chain id ${this.chainId}, cursor: ${this.rpcConfiguration.startPoint}`);
    return withRetry(() => seedCursor(this.chainId, this.rpcConfiguration.startPoint), this.workerId);
  }

  public async testConnection(): Promise<void> {
    logger.debug(`[${this.workerId}] Testing connection to chain id ${this.chainId}.`);
    await this.rpcClient.testConnection(this.chainId);
  }

  private async claimJob(): Promise<BlockJobDoc | null> { 
    let job: BlockJobDoc | null = await claimExpiredOrFailed(this.chainId, this.workerId, collectorConfig.jobLeaseTtlMs);

    if (job) {
      logger.debug(
        `[${this.workerId}] Stage 1 — retrying job ${job._id}. Block range: [${job.fromBlock}..${job.toBlock}] (attempt: ${job.attempts})`,
      );
    } else {
      const maxBlock = await this.rpcClient.getMaxBlock(); // In chain
      const range = await claimNextRange(this.chainId, collectorConfig.batchSize, maxBlock);

      if (!range) {
        this.changeMode('realtime');
        logger.debug(`[${this.workerId}] Stage 1 — no blocks available below chain tip ${maxBlock}, idle`);
        return null;
      }

      const { fromBlock, toBlock } = range;
      const lagBlocks = maxBlock - toBlock;
      this.updateModeByLag(lagBlocks);

      job = await createJob(this.chainId, fromBlock, toBlock, this.workerId, collectorConfig.jobLeaseTtlMs);

      logger.debug(
        `[${this.workerId}] Stage 1 — claimed new range ` +
        `[${job.fromBlock}..${job.toBlock}]`,
      );
    }

    return job;
  }

  private changeMode(mode: CollectorMode): void {
    if (this.mode === mode) {
      return;
    }

    logger.debug(`[${this.workerId}] Changing mode from ${this.mode} to ${mode}.`);
    this.mode = mode;
  }

  private updateModeByLag(lagBlocks: number): void {
    const realtimeEnterLagThreshold = collectorConfig.batchSize;
    const historicalEnterLagThreshold = collectorConfig.batchSize * 5;

    if (this.mode === 'historical' && lagBlocks <= realtimeEnterLagThreshold) {
      this.changeMode('realtime');
      return;
    }

    if (this.mode === 'realtime' && lagBlocks >= historicalEnterLagThreshold) {
      this.changeMode('historical');
    }
  }
  
  public getMode(): CollectorMode {
    return this.mode;
  }

  public getPollIntervalMs(): number {
    return this.mode === 'realtime'
      ? collectorConfig.realtimePollIntervalMs
      : collectorConfig.historicalpollIntervalMs;
  }
}


export { 
  Collector, 
  type CollectorMode 
};
