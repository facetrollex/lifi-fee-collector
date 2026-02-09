import { getModelForClass, modelOptions, prop } from '@typegoose/typegoose';

@modelOptions({ schemaOptions: { collection: 'lastBlock' } })
class LastBlock {
  @prop({ required: true, unique: true, type: String })
  public integrator!: string;

  @prop({ required: true, type: Number })
  public blockNumber!: number;

  @prop({ required: false, type: Date, default: Date.now })
  public updatedAt!: Date;
}

const LastBlockModel = getModelForClass(LastBlock);

const findLastBlock = async (integrator: string): Promise<number | null> => {
  const doc = await LastBlockModel.findOne({ integrator });
  return doc?.blockNumber ?? null;
};

const updateLastBlock = async (integrator: string, blockNumber: number): Promise<void> => {
  await LastBlockModel.updateOne(
    { integrator },
    { blockNumber, updatedAt: new Date() },
    { upsert: true },
  );
};

/**
 * Atomically advances the cursor by `batchSize` and returns the claimed range.
 * On first call for a given integrator, seeds the cursor from `startPoint`.
 * Returns `{ fromBlock, toBlock }`.
 */
const claimNextRange = async (
  integrator: string,
  batchSize: number,
  startPoint: number,
): Promise<{ fromBlock: number; toBlock: number }> => {
  const doc = await LastBlockModel.findOneAndUpdate(
    { integrator },
    {
      $setOnInsert: { integrator },
      $inc: { blockNumber: batchSize },
      $set: { updatedAt: new Date() },
    },
    { upsert: true, new: false, setDefaultsOnInsert: true },
  );

  // If doc is null this was the first upsert — cursor started at 0, so use startPoint
  const fromBlock = doc?.blockNumber ?? startPoint;
  const toBlock = fromBlock + batchSize - 1;

  // If the upsert just created the document, blockNumber was 0 before $inc,
  // so we need to correct the stored value to startPoint + batchSize.
  if (!doc) {
    await LastBlockModel.updateOne(
      { integrator },
      { blockNumber: startPoint + batchSize },
    );
  }

  return { fromBlock, toBlock };
};

export { LastBlockModel, 
    findLastBlock, 
    updateLastBlock, 
    claimNextRange 
};
