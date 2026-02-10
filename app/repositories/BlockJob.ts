import { 
  getModelForClass, 
  index, 
  modelOptions, 
  prop, 
  type DocumentType 
} from '@typegoose/typegoose';
import type { Types } from 'mongoose';

@index({ chainId: 1, fromBlock: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'blockJobs' } })
class BlockJob {
  @prop({ required: true, type: Number })
  public chainId!: number;

  @prop({ required: true, type: Number })
  public fromBlock!: number;

  @prop({ required: true, type: Number })
  public toBlock!: number;

  @prop({ required: true, type: String, default: 'processing' })
  public status!: 'pending' | 'processing' | 'completed' | 'failed';

  @prop({ required: false, type: String, default: null })
  public lockedBy!: string | null;

  @prop({ required: false, type: Date, default: null })
  public lockedUntil!: Date | null;

  @prop({ required: false, type: Number, default: 0 })
  public attempts!: number;

  @prop({ required: false, type: String, default: null })
  public error!: string | null;

  @prop({ required: false, type: Date, default: Date.now })
  public createdAt!: Date;

  @prop({ required: false, type: Date, default: Date.now })
  public updatedAt!: Date;
}

const BlockJobModel = getModelForClass(BlockJob);

type BlockJobDoc = DocumentType<BlockJob>;

/**
 * Create a new job in `processing` state, locked by the given worker.
 */
const createJob = async (
  chainId: number,
  fromBlock: number,
  toBlock: number,
  workerId: string,
  leaseTtlMs: number,
): Promise<BlockJobDoc> => {
  const now = new Date();
  return BlockJobModel.create({
    chainId,
    fromBlock,
    toBlock,
    status: 'processing',
    lockedBy: workerId,
    lockedUntil: new Date(now.getTime() + leaseTtlMs),
    attempts: 1,
    error: null,
    createdAt: now,
    updatedAt: now,
  });
};

/**
 * Atomically claim a failed or lease-expired job for retry.
 * Returns the claimed job, or `null` if none available.
 */
const claimExpiredOrFailed = async (
  chainId: number,
  workerId: string,
  leaseTtlMs: number,
): Promise<BlockJobDoc | null> => {
  const now = new Date();
  return BlockJobModel.findOneAndUpdate(
    {
      chainId,
      attempts: { $lt: 10 }, // Max attempts for failed jobs
      $or: [
        { status: 'failed' },
        { status: 'processing', lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        lockedBy: workerId,
        lockedUntil: new Date(now.getTime() + leaseTtlMs),
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
};

/**
 * Delete a completed job from the collection.
 */
const markCompleted = async (jobId: Types.ObjectId): Promise<void> => {
  await BlockJobModel.deleteOne({ _id: jobId });
};

/**
 * Mark a job as failed, storing the error message for diagnostics.
 */
const markFailed = async (jobId: Types.ObjectId, errorMsg: string): Promise<void> => {
  await BlockJobModel.updateOne(
    { _id: jobId },
    {
      status: 'failed',
      lockedBy: null,
      lockedUntil: null,
      error: errorMsg,
      updatedAt: new Date(),
    },
  );
};

export { BlockJobModel, createJob, claimExpiredOrFailed, markCompleted, markFailed };
export type { BlockJobDoc };
