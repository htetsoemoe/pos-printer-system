# pos-printer-system

Build a fully Dockerized POS printer system with Redis queue (BullMQ), duplicate-print prevention, multi-printer support, and a fake printer for testing.

## Requirements

- Node.js 20 or later
- npm
- Docker Desktop or Docker Engine

## Install Dependencies

```bash
npm install
```

## Run With Docker Compose

This starts:
- `redis` on port `6379`
- `api` on port `4000`
- `worker` for processing print jobs

```bash
docker compose up -d --build
```

This project uses the `docker-compose.yml` file in the project root.

API URL:

```text
http://localhost:4000
```

Check container logs:

```bash
docker logs -f pos-api
docker logs -f pos-worker
```

## Run Locally

### 1. Start Redis

If you already have Redis running locally on port `6379`, you can use that.

Or start only Redis with Docker:

```bash
docker compose up -d redis
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the API server

```bash
npm run dev
```

The API will run at:

```text
http://localhost:4000
```

### 4. Start the worker in another terminal

```bash
npm run worker
```

## Available Commands

```bash
npm install
npm run dev
npm run worker
docker compose up -d --build
docker logs -f pos-api
docker logs -f pos-worker
```

## API Endpoint

Create an order:

```http
POST /api/order
Content-Type: application/json
```

Example request body:

```json
{
  "table": "T5",
  "items": [
    { "name": "Fried Rice", "qty": 2, "category": "Food" },
    { "name": "Coke", "qty": 1, "category": "Drinks" }
  ]
}
```

Example curl:

```bash
curl -X POST http://localhost:4000/api/order \
  -H "Content-Type: application/json" \
  -d "{\"table\":\"T5\",\"items\":[{\"name\":\"Fried Rice\",\"qty\":2,\"category\":\"Food\"},{\"name\":\"Coke\",\"qty\":1,\"category\":\"Drinks\"}]}"
```

## Notes

- The worker listens to the BullMQ queue and prints jobs automatically.
- Orders are split by category:
  - non-`Drinks` items go to `KITCHEN`
  - `Drinks` items go to `BAR`
- The controller blocks duplicate requests with the same payload for 30 seconds.
