// Supports multiple printers using printer property === "KITCHEN or "BAR"

export async function printKOT(data) {
    // Fake printer logic for testing
    const { orderId, table, items, printer } = data

    console.log("========== FAKE PRINTER ==========")
    console.log(`Printer: ${printer}`)
    console.log(`Table: ${table}`)
    console.log(`Order ID: ${orderId}`)
    console.log("--------------------------")
    items.forEach(item => console.log(`${item.name} x${item.qty}`))
    console.log("--------------------------")
    console.log("Printed successfully ✅")
    console.log("=================================\n")

    // Simulate random failure for testing retry
    if (Math.random() < 0.2) {
        throw new Error(`${printer} printer offline`)
    }
}