import express from "express"
import orderRouter from "./routes/orderRoutes.js"

const PORT = 4000

const app = express()
app.use(express.json())
app.use("/api", orderRouter)

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`)
})