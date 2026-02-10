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
import { withRetry } from '../utils/helpers.js';


class Collector {
  private readonly workerId: string;
  private readonly integrator: string;
  private rpcConfiguration: {
    rpcUrl: string;
    contractAddress: string;
    startPoint: number;
  };

  private rpcClient: Rpc;

  constructor(workerId: string, integrator: string) {
    this.workerId = workerId;
    this.integrator = integrator;

    switch(this.integrator) {
      case 'polygon':
        if (!chainConfig.rpcUrl || !chainConfig.contractAddress || !chainConfig.startPoint) {
          throw new Error(`Invalid chain config for ${this.integrator}: RPC_URL, CONTRACT_ADDRESS and START_POINT are required`);
        }

        const startPoint = Number(chainConfig.startPoint);

        if (Number.isNaN(startPoint)) {
          throw new Error(`Invalid chain config for ${this.integrator}: START_POINT must be a number`);
        }

        this.rpcConfiguration = {
          rpcUrl: chainConfig.rpcUrl,
          contractAddress: chainConfig.contractAddress,
          startPoint,
        };
        this.rpcClient = new Rpc(this.rpcConfiguration.contractAddress, this.rpcConfiguration.rpcUrl);
        break;
      default:
        throw new Error(`Unsupported integrator: ${this.integrator}`);
    }

    logger.info(`[${this.workerId}] Stage 0: Provisioned ${this.integrator} integrator.`);
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

      const upserted = await withRetry(() => upsertFeeEvents(this.integrator, parsedEvents), this.workerId);

      logger.info(`[${this.workerId}] Stage 4: Completed. Upserted ${upserted}/${parsedEvents.length} Fee Collector Events.`);
      //--------------------------------

      // Stage 5: Mark job completed
      logger.info(`[${this.workerId}] Stage 5: Marking job completed.`);

      await withRetry(() => markCompleted(jobId), this.workerId);

      logger.info(`[${this.workerId}] Stage 5: Completed. Job ${jobId} done.`);
      //--------------------------------
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if(job) {
        const failedJobId = job._id
        await withRetry(() => markFailed(failedJobId, errorMsg), this.workerId);
        logger.error(
          `[${this.workerId}] job ${failedJobId} failed: ${errorMsg}`,
        );
        return false;
      }
    }

    return true; // We did scrape/store attempt, in case of error another iteration may retry it.
  }

  private async claimJob(): Promise<BlockJobDoc | null> { 
    let job: BlockJobDoc | null = await claimExpiredOrFailed(this.integrator, this.workerId, collectorConfig.jobLeaseTtlMs);

    if (job) {
      logger.debug(
        `[${this.workerId}] Stage 1 — retrying job ${job._id}. Block range: [${job.fromBlock}..${job.toBlock}] (attempt: ${job.attempts})`,
      );
    } else {
      const maxBlock = await this.rpcClient.getMaxBlock(); // In chain

      //await seedCursor(this.integrator, this.rpcConfiguration.startPoint);

      const range = await claimNextRange(this.integrator, collectorConfig.batchSize, maxBlock);

      if (!range) {
        logger.debug(`[${this.workerId}] Stage 1 — no blocks available below chain tip ${maxBlock}, idle`);
        return null;
      }

      const { fromBlock, toBlock } = range;

      job = await createJob(this.integrator, fromBlock, toBlock, this.workerId, collectorConfig.jobLeaseTtlMs);

      logger.debug(
        `[${this.workerId}] Stage 1 — claimed new range ` +
        `[${job.fromBlock}..${job.toBlock}]`,
      );
    }

    return job;
  }

  public async seedCursor(): Promise<void> {
    logger.debug(`[${this.workerId}] Seeding cursor for ${this.integrator} chain, cursor: ${this.rpcConfiguration.startPoint}`);
    return withRetry(() => seedCursor(this.integrator, this.rpcConfiguration.startPoint), this.workerId);
  }

  public async testConnection(): Promise<void> {
    logger.debug(`[${this.workerId}] Testing connection to ${this.integrator} chain.`);
    await this.rpcClient.testConnection();
  }
}


export { Collector };
