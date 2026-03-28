# Project Reference

## Overview

`pos-printer-system` is a small POS printing service built with Node.js, Express, BullMQ, and Redis.

The project accepts order requests through an API, splits the order by printer target, pushes print jobs into a Redis-backed queue, and lets a worker process those jobs asynchronously.

This project currently includes:
- an API service
- a Redis service
- a BullMQ worker
- a fake printer implementation for testing
- duplicate-request protection for repeated order submissions

## Tech Stack

- Node.js 20
- Express
- BullMQ
- Redis
- Docker
- Docker Compose

## Project Structure

- `src/app.js`
  Starts the Express server on port `4000`.
- `src/routes/orderRoutes.js`
  Defines the `/api/order` endpoint.
- `src/controllers/orderController.js`
  Validates the incoming payload flow, prevents duplicate requests, splits items by category, and adds jobs to the queue.
- `src/queue/printQueue.js`
  Creates the BullMQ queue instance named `print-jobs`.
- `src/queue/connection.js`
  Creates the shared Redis connection.
- `src/workers/printWorker.js`
  Runs the worker process that consumes jobs from the queue.
- `src/services/printService.js`
  Contains the fake printing logic used for testing.
- `docker-compose.yml`
  Starts `redis`, `api`, and `worker`.
- `Dockerfile`
  Builds the Node.js container image.

## Runtime Architecture

The request and print flow works like this:

1. A client sends `POST /api/order`.
2. The API receives the order in `orderController`.
3. The controller creates a fingerprint from the payload.
4. Redis stores a short-lived dedupe key to block accidental resubmission.
5. The controller splits items into kitchen and bar groups.
6. Each group is added to the BullMQ queue as a separate print job.
7. The worker reads jobs from Redis and processes them.
8. The print service logs the formatted order as a fake printer output.

## Services in Docker

`docker-compose.yml` starts three containers:

- `redis`
  Redis server on port `6379`
- `pos-api`
  Express API server on port `4000`
- `pos-worker`
  BullMQ worker process

Main Docker command:

```bash
docker compose up -d --build
```

This project uses the `docker-compose.yml` file in the repository root.

## Install Dependencies

For local development:

```bash
npm install
```

## Run Commands

### Docker

Start all services:

```bash
docker compose up -d --build
```

Start only Redis:

```bash
docker compose up -d redis
```

Check API logs:

```bash
docker logs -f pos-api
```

Check worker logs:

```bash
docker logs -f pos-worker
```

### Local

Start the API:

```bash
npm run dev
```

Start the worker in another terminal:

```bash
npm run worker
```

API base URL:

```text
http://localhost:4000
```

## API Reference

### Create Order

```http
POST /api/order
Content-Type: application/json
```

Example request:

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

Successful response example:

```json
{
  "success": true,
  "orderId": "generated-uuid"
}
```

Duplicate response example:

```json
{
  "success": false,
  "duplicate": true,
  "message": "Duplicate order ignored within 30 seconds",
  "orderId": "existing-order-id"
}
```

## Printer Routing Logic

The order controller routes items based on category:

- items where `category !== "Drinks"` go to `KITCHEN`
- items where `category === "Drinks"` go to `BAR`

That means one incoming order can produce two queue jobs:
- one kitchen ticket
- one bar ticket

## Duplicate Request Protection

Duplicate protection is implemented in `src/controllers/orderController.js`.

The controller:
- normalizes the incoming item list
- creates a SHA-256 fingerprint from `{ table, items }`
- stores a Redis key like `duplicate-order:<hash>`
- uses Redis `SET` with `NX` and `EX`

Meaning:
- `NX` only saves the key if it does not already exist
- `EX 30` expires the key after 30 seconds

This prevents the same logical order from being enqueued twice during that 30-second window.

Example:

If the same request body is sent twice within 30 seconds, the first request is accepted and the second one is rejected as a duplicate.

## Queue Behavior

The queue name is:

```text
print-jobs
```

Each job added by the controller:
- uses the BullMQ job name `print-kot`
- includes `orderId`, `table`, `items`, and `printer`
- retries up to 5 times
- uses exponential backoff with a 3000ms base delay
- removes completed jobs automatically

## Worker Behavior

The worker is defined in `src/workers/printWorker.js`.

`printWorker` is the background process of the project.

It runs separately from the API server and waits for new jobs in the BullMQ queue. This is important because the API only accepts orders and adds jobs to Redis. The actual printing work is done later by the worker in the background.

This separation gives the project a cleaner flow:

- the API can respond quickly without waiting for printing to finish
- printing can continue independently of the incoming HTTP request
- failed jobs can be retried by the queue system
- the print logic is isolated from request handling

In practice, that means:

1. `orderController` adds a job into the `print-jobs` queue.
2. `printWorker` picks up that job from Redis.
3. `printWorker` reads `orderId`, `table`, `items`, and `printer` from `job.data`.
4. It calls `printKOT(...)` from the print service.
5. The worker logs whether the job completed or failed.

It:
- subscribes to the `print-jobs` queue
- logs when a job starts
- calls `printKOT(...)`
- logs completion
- logs failure messages when a job errors

The worker is started with:

```bash
npm run worker
```

In Docker, it runs inside the `pos-worker` container.

To watch worker activity:

```bash
docker logs -f pos-worker
```

If the worker is not running, orders can still be accepted by the API and added to Redis, but they will stay in the queue and will not print until the worker starts.

## Fake Printer Service

The fake printer in `src/services/printService.js` prints ticket data to the console instead of using a real printer.

It logs:
- printer name
- table
- order ID
- item list

It also simulates random printer failure for retry testing.

## Redis Connection

The Redis connection is defined in `src/queue/connection.js` and currently uses:

- host: `redis`
- port: `6379`

This works well inside Docker Compose, where the Redis service name is `redis`.

## Notes

- The current print service is for testing only.
- For local non-Docker runs, the Redis host may need to be changed if `redis` is not resolvable on your machine.
- Duplicate protection is time-based, not permanent.
- Sending the same order again after the 30-second window is allowed.
