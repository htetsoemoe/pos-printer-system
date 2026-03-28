import { Worker } from 'bullmq'
import { connection } from "../queue/connection.js"
import { printKOT } from "../services/printService.js"

// npm run worker, That starts the worker process
// "worker": "node src/workers/printWorker.js" in package.json
// Listen to the 'print-jobs' queue and process jobs automatically

// This class represents a worker that is able to process jobs from the queue. 
// As soon as the class is instantiated and a connection to Redis is established it will start processing jobs.
const worker = new Worker(
    "print-jobs",
    async job => {
        console.log("Processing job:", job.id)

        const { orderId, table, items, printer } = job.data

        await printKOT({ orderId, table, items, printer })

        console.log(`✅ Job ${job.id} printed on ${printer}`)
    },
    { connection }
)

worker.on("completed", job => {
    console.log("Completed job:", job.id)
})

worker.on("failed", (job, err) => {
    console.error("Failed job:", job.id, err.message)
})