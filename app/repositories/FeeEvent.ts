import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose';
import type { ParsedFeeCollectedEvents } from '../utils/rpc.js';

@index({ transactionHash: 1, logIndex: 1 }, { unique: true })
@modelOptions({ schemaOptions: { collection: 'feeEvents' } })
class FeeEvent {
  @prop({ required: true, type: Number })
  public chainId!: number;

  @prop({ required: true, type: String })
  public transactionHash!: string;

  @prop({ required: true, type: Number })
  public logIndex!: number;

  @prop({ required: true, type: Number })
  public blockNumber!: number;

  @prop({ required: true, type: String })
  public token!: string;

  @prop({ required: true, type: String })
  public eventIntegrator!: string;

  @prop({ required: true, type: String })
  public integratorFee!: string;

  @prop({ required: true, type: String })
  public lifiFee!: string;

  @prop({ required: false, type: Date, default: Date.now })
  public createdAt!: Date;
}

const FeeEventModel = getModelForClass(FeeEvent);

/**
 * Upsert parsed fee events into the database.
 * Uses `{transactionHash, logIndex}` as the dedup key so re-processing
 * the same block range is safe (idempotent).
 */
const upsertFeeEvents = async (
  chainId: number,
  events: ParsedFeeCollectedEvents[],
): Promise<number> => {
  if (events.length === 0) return 0;

  const ops = events.map((e) => ({
    updateOne: {
      filter: { transactionHash: e.transactionHash, logIndex: e.logIndex },
      update: {
        $setOnInsert: {
          chainId,
          transactionHash: e.transactionHash,
          logIndex: e.logIndex,
          blockNumber: e.blockNumber,
          token: e.token,
          eventIntegrator: e.integrator,
          integratorFee: e.integratorFee.toString(),
          lifiFee: e.lifiFee.toString(),
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await FeeEventModel.bulkWrite(ops, { ordered: false });
  return result.upsertedCount;
};

/**
 * Find fee events by chain id with pagination, sorted by blockNumber desc.
 */
const findFeeEvents = async (
  chainId: number,
  skip: number,
  limit: number,
): Promise<{ data: FeeEvent[]; total: number }> => {
  const [data, total] = await Promise.all([
    FeeEventModel.find({ chainId })
      .select('-_id -__v')
      .sort({ blockNumber: -1, logIndex: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FeeEventModel.countDocuments({ chainId }),
  ]);

  return { data, total };
};

export { FeeEventModel, upsertFeeEvents, findFeeEvents };
