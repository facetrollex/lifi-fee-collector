import { logger } from '../utils/logger.js';
import { collectorConfig, polygonConfig } from '../config.js';
import { Rpc, type ParsedFeeCollectedEvents } from '../utils/rpc.js';
import { ethers } from 'ethers';
import { claimNextRange, findLastBlock } from '../repositories/LastBlock.js';
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
        this.rpcConfiguration = {
          rpcUrl: polygonConfig.rpcUrl,
          contractAddress: polygonConfig.contractAddress,
          startPoint: polygonConfig.startPoint,
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

      job = await withRetry(() => this.claimJob());

      if(!job) {
        return false;
      }

      logger.info(`[${this.workerId}] Stage 1: Job claimed successfully. ID: ${job._id}`);
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

      const upserted = await withRetry(() => upsertFeeEvents(this.integrator, parsedEvents));

      logger.info(`[${this.workerId}] Stage 4: Completed. Upserted ${upserted}/${parsedEvents.length} Fee Collector Events.`);
      //--------------------------------

      // Stage 5: Mark job completed
      logger.info(`[${this.workerId}] Stage 5: Marking job completed.`);

      await withRetry(() => markCompleted(job._id));

      logger.info(`[${this.workerId}] Stage 5: Completed. Job ${job._id} done.`);
      //--------------------------------
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      if(job) {
        await markFailed(job._id, errorMsg);
        logger.error(
          `[${this.workerId}] job ${job._id} failed: ${errorMsg}`,
        );
        return false;
      }
    }

    return true; // We did attempt work; another iteration may retry it.
  }

  private async claimJob(): Promise<BlockJobDoc | null> { 
    let job: BlockJobDoc | null = await claimExpiredOrFailed(this.integrator, this.workerId, collectorConfig.jobLeaseTtlMs);

    if (job) {
      logger.debug(
        `[${this.workerId}] Stage 1 — retrying job ${job._id}. Block range: [${job.fromBlock}..${job.toBlock}] (attempt: ${job.attempts})`,
      );
    } else {
      const cursor = await findLastBlock(this.integrator);
      const maxBlock = await this.rpcClient.getMaxBlock();

      if (cursor !== null && cursor >= maxBlock) {
        logger.debug(`[${this.workerId}] Stage 1 — cursor ${cursor} >= MAX_BLOCK ${maxBlock}, idle`);
        return null;
      }

      const { fromBlock, toBlock } = await claimNextRange(this.integrator, collectorConfig.batchSize, this.rpcConfiguration.startPoint);

      job = await createJob(this.integrator, fromBlock, toBlock, this.workerId, collectorConfig.jobLeaseTtlMs);

      logger.debug(
        `[${this.workerId}] Stage 1 — claimed new range ` +
        `[${job.fromBlock}..${job.toBlock}]`,
      );
    }

    return job;
  }
}


export { Collector };
