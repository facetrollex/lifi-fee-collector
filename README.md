# lf-fee-collector

### Run (Docker)

```bash
docker compose -f docker/docker-compose.yml up --build
```

### Verify

```bash
curl http://localhost:9999/
```

### Stop

```bash
docker compose -f docker/docker-compose.yml down
```


clean
docker exec LIFI_Fee_Collector mongosh --quiet --eval "use lf_fee_collector" --eval "db.getCollectionNames().forEach(c => { db[c].deleteMany({}); print('cleared: ' + c); })"