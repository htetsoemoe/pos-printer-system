// Duplicate prevention now fingerprints the incoming request body,
// so the same order is not enqueued twice during the dedupe window.
// Multiple-printer: items routed to "KITCHEN" or "BAR"

import crypto from "crypto"
import { printQueue } from "../queue/printQueue.js"
import { connection } from "../queue/connection.js"
import { v4 as uuidv4 } from "uuid"

// Keep duplicate protection short-lived so accidental double-clicks are blocked
// without preventing the same order from being submitted again later.
const DUPLICATE_TTL_SECONDS = 30

// Convert incoming items into a stable shape and order before hashing them.
// This makes duplicate detection ignore item ordering differences in the request.
function normalizeItems(items = []) {
    return [...items]
        .map(item => ({
            name: item.name,
            qty: item.qty,
            category: item.category
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

// Build a deterministic SHA-256 fingerprint from the table and normalized items.
// The fingerprint becomes the Redis key used to detect repeated submissions.
function buildOrderFingerprint(table, items) {
    const normalizedPayload = JSON.stringify({
        table,
        items: normalizeItems(items)
    })

    return crypto.createHash("sha256").update(normalizedPayload).digest("hex")
}

// Handle an incoming order request, prevent duplicate submissions, split items
// by printer destination, and enqueue print jobs for the worker process.
export async function sendOrder(req, res) {
    try {
        // Read the order payload sent by the POS client.
        const { table, items } = req.body

        // Create a unique duplicate-protection key for this logical order.
        const orderFingerprint = buildOrderFingerprint(table, items)
        const duplicateKey = `duplicate-order:${orderFingerprint}`
        const orderId = uuidv4()

        // Store the dedupe key only if it does not already exist.
        // Redis returns "OK" for the first request and null for duplicates.
        const wasStored = await connection.set(duplicateKey, orderId, "EX", DUPLICATE_TTL_SECONDS, "NX")

        // If the dedupe key already exists, return the original order ID and
        // avoid adding another set of print jobs to the queue.
        if (wasStored !== "OK") {
            const existingOrderId = await connection.get(duplicateKey)

            return res.status(409).json({
                success: false,
                duplicate: true,
                message: `Duplicate order ignored within ${DUPLICATE_TTL_SECONDS} seconds`,
                orderId: existingOrderId
            })
        }

        // Split order items by printer target.
        // Food and non-drink items go to the kitchen; drinks go to the bar.
        const kitchenItems = items.filter(i => i.category !== "Drinks")
        const barItems = items.filter(i => i.category === "Drinks")

        // Collect queue operations so both printer jobs can be created in parallel.
        const jobs = []

        // Add a kitchen print job when the order contains kitchen items.
        if (kitchenItems.length > 0) {
            jobs.push(
                printQueue.add(
                    "print-kot",
                    { orderId, table, items: kitchenItems, printer: "KITCHEN" },
                    { jobId: `order-${orderId}-KITCHEN`, attempts: 5, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: true }
                )
            )
        }

        // Add a bar print job when the order contains drink items.
        if (barItems.length > 0) {
            jobs.push(
                printQueue.add(
                    "print-kot",
                    { orderId, table, items: barItems, printer: "BAR" },
                    { jobId: `order-${orderId}-BAR`, attempts: 5, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: true }
                )
            )
        }

        // Wait until all required print jobs have been saved to Redis.
        await Promise.all(jobs)

        // Respond immediately after enqueueing; actual printing happens in the worker.
        res.json({ success: true, orderId })
    } catch (err) {
        // Return a server error if validation, Redis, or queue operations fail.
        res.status(500).json({ error: err.message })
    }
}
