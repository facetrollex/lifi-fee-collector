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


Mongo logs:
```bash
docker compose -f docker/docker-compose.yml exec mongo sh -c "tail -f /data/db/mongod.log"
```

clean
docker compose -f docker/docker-compose.yml exec mongo mongosh --quiet --eval "use lf_fee_collector" --eval "db.getCollectionNames().forEach(c => { db[c].deleteMany({}); print('cleared: ' + c); })"