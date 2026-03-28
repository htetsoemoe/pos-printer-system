// Duplicate prevention now fingerprints the incoming request body,
// so the same order is not enqueued twice during the dedupe window.
// Multiple-printer: items routed to "KITCHEN" or "BAR"

import crypto from "crypto"
import { printQueue } from "../queue/printQueue.js"
import { connection } from "../queue/connection.js"
import { v4 as uuidv4 } from "uuid"

const DUPLICATE_TTL_SECONDS = 30

function normalizeItems(items = []) {
    return [...items]
        .map(item => ({
            name: item.name,
            qty: item.qty,
            category: item.category
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function buildOrderFingerprint(table, items) {
    const normalizedPayload = JSON.stringify({
        table,
        items: normalizeItems(items)
    })

    return crypto.createHash("sha256").update(normalizedPayload).digest("hex")
}

export async function sendOrder(req, res) {
    try {
        const { table, items } = req.body

        const orderFingerprint = buildOrderFingerprint(table, items)
        const duplicateKey = `duplicate-order:${orderFingerprint}`
        const orderId = uuidv4()
        const wasStored = await connection.set(duplicateKey, orderId, "EX", DUPLICATE_TTL_SECONDS, "NX")

        if (wasStored !== "OK") {
            const existingOrderId = await connection.get(duplicateKey)

            return res.status(409).json({
                success: false,
                duplicate: true,
                message: `Duplicate order ignored within ${DUPLICATE_TTL_SECONDS} seconds`,
                orderId: existingOrderId
            })
        }

        // Example: split items by printer
        const kitchenItems = items.filter(i => i.category !== "Drinks")
        const barItems = items.filter(i => i.category === "Drinks")

        const jobs = []

        if (kitchenItems.length > 0) {
            jobs.push(
                printQueue.add(
                    "print-kot",
                    { orderId, table, items: kitchenItems, printer: "KITCHEN" },
                    { jobId: `order-${orderId}-KITCHEN`, attempts: 5, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: true }
                )
            )
        }

        if (barItems.length > 0) {
            jobs.push(
                printQueue.add(
                    "print-kot",
                    { orderId, table, items: barItems, printer: "BAR" },
                    { jobId: `order-${orderId}-BAR`, attempts: 5, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: true }
                )
            )
        }

        await Promise.all(jobs)

        res.json({ success: true, orderId })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}
