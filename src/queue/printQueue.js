import { Queue } from 'bullmq'
import { connection } from './connection.js'

export const printQueue = new Queue("print-jobs", {
    connection
})