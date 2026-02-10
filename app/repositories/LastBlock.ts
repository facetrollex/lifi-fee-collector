import { getModelForClass, modelOptions, prop } from '@typegoose/typegoose';

@modelOptions({ schemaOptions: { collection: 'lastBlock' } })
class LastBlock {
  @prop({ required: true, unique: true, type: Number })
  public chainId!: number;

  @prop({ required: true, type: Number })
  public blockNumber!: number;

  @prop({ required: false, type: Date, default: Date.now })
  public updatedAt!: Date;
}

const LastBlockModel = getModelForClass(LastBlock);

const findLastBlock = async (chainId: number): Promise<number | null> => {
  const doc = await LastBlockModel.findOne({ chainId });
  return doc?.blockNumber ?? null;
};

const updateLastBlock = async (chainId: number, blockNumber: number): Promise<void> => {
  await LastBlockModel.updateOne(
    { chainId },
    { blockNumber, updatedAt: new Date() },
    { upsert: true },
  );
};

/**
 * Ensures a cursor document exists for the given chain id.
 * If the document already exists this is a no-op ($setOnInsert is skipped).
 */
const seedCursor = async (chainId: number, startPoint: number): Promise<void> => {
  await LastBlockModel.updateOne(
    { chainId },
    { $setOnInsert: { chainId, blockNumber: startPoint, updatedAt: new Date() } },
    { upsert: true },
  );
};

/**
 * Atomically advances the cursor by `batchSize` and returns the claimed range.
 * The cursor is only advanced when `blockNumber < maxBlock`, preventing workers
 * from claiming ranges beyond the current chain tip.
 * Returns `null` if no range is available (cursor already >= maxBlock).
 */
const claimNextRange = async (
  chainId: number,
  batchSize: number,
  maxBlock: number,
): Promise<{ fromBlock: number; toBlock: number } | null> => {
  const doc = await LastBlockModel.findOneAndUpdate(
    {
      chainId,
      blockNumber: { $lt: maxBlock },
    },
    [
      {
        $set: {
          updatedAt: new Date(),
          blockNumber: {
            $min: [{ $add: ['$blockNumber', batchSize] }, maxBlock + 1],
          },
        },
      },
    ],
    { new: false, updatePipeline: true },
  );

  if (!doc) return null;

  const fromBlock = doc.blockNumber;
  const toBlock = Math.min(fromBlock + batchSize - 1, maxBlock);

  return { fromBlock, toBlock };
};

export { 
  LastBlockModel, 
  findLastBlock, 
  updateLastBlock, 
  seedCursor,
  claimNextRange,
};
