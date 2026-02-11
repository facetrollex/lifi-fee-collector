# lf-fee-collector

Lightweight service that indexes `FeesCollected` events from the LiFi FeeCollector contract and stores them in MongoDB.  
It runs a background worker for chain sync and an API for fee data retrieval.

## Links

- Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- API: [`API.md`](API.md)

## 1. Requirements to run

- Docker + Docker Compose
- Node.js 20+ and npm (for local test commands)

## 2. First start

```bash
npm run setup
```

Then review `docker/.env` and update values if needed.

## 3. Run app

```bash
npm run start
```

Quick check:

```bash
curl http://localhost:9999/
```
Note: Port can be changed under environment configuration, 9999 - default

## 4. Testing

```bash
npm run test
npm run test:coverage
```