import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const appConfig = {
    env: process.env.APP_ENV || 'development',
    apiPort: process.env.API_PORT || 9999,
    logLevel: process.env.LOG_LEVEL || 'debug'
};

const dbConfig = {
    mongoURI: process.env.MONGO_URI || 'mongodb://localhost:27017/lf-fee-collector',
};

const collectorConfig = {
    batchSize: Number(process.env.BATCH_SIZE) || 100,
    jobLeaseTtlMs: Number(process.env.JOB_LEASE_TTL_MS) || 120_000,
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 5_000,
};

const activeChain = process.env.ACTIVE_CHAIN || 'polygon';

const polygonConfig = {
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    contractAddress: process.env.POLYGON_CONTRACT_ADDRESS || '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
    startPoint: Number(process.env.POLYGON_START_POINT) || 78600000,
};

export {
    appConfig,
    dbConfig,
    collectorConfig,
    activeChain,
    polygonConfig,
}