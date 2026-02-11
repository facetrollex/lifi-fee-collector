# API Documentation

Base URL (default local): `http://localhost:9999`

## `GET /`

Health endpoint.

- `200 OK`
- Response body: `Api Running`

Example:

```bash
curl http://localhost:9999/
```

## `GET /fees`

Returns paginated fee events for a chain.

### Query parameters

- `integrator` (optional): numeric chain id. Default: `137`.
- `page` (optional): page number. Default: `1`, minimum: `1`.
- `limit` (optional): page size. Default: `20`, min: `1`, max: `100`.

### Success response

- `200 OK`

```json
{
  "data": [
    {
      "chainId": 137,
      "transactionHash": "0x...",
      "logIndex": 0,
      "blockNumber": 123456,
      "token": "0x...",
      "eventIntegrator": "0x...",
      "integratorFee": "100",
      "lifiFee": "10",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Notes:

- Results are sorted by `blockNumber` desc, then `logIndex` desc.

### Error responses

- `400 Bad Request` when `integrator` is not numeric:

```json
{ "error": "Invalid integrator value. Expected numeric chain id." }
```

- `500 Internal Server Error` for unexpected errors:

```json
{ "error": "Internal server error" }
```

Example:

```bash
curl "http://localhost:9999/fees?integrator=137&page=1&limit=20"
```
