import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | null = null;

const connectMemoryMongo = async (): Promise<void> => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
};

const clearMemoryMongo = async (): Promise<void> => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
};

const disconnectMemoryMongo = async (): Promise<void> => {
  await mongoose.disconnect();

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

const useMemoryMongo = (): void => {
  beforeAll(async () => {
    await connectMemoryMongo();
  });

  afterEach(async () => {
    await clearMemoryMongo();
  });

  afterAll(async () => {
    await disconnectMemoryMongo();
  });
};

export { connectMemoryMongo, clearMemoryMongo, disconnectMemoryMongo, useMemoryMongo };
