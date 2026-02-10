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

const chainId = Number(process.env.ACTIVE_CHAIN || 137);

if (Number.isNaN(chainId)) {
    throw new Error('Invalid ACTIVE_CHAIN: expected number');
}

const chainConfig = {
    rpcUrl: process.env.RPC_URL,
    contractAddress: process.env.CONTRACT_ADDRESS,
    startPoint: process.env.START_POINT,
};

export {
    appConfig,
    dbConfig,
    collectorConfig,
    chainId,
    chainConfig,
}