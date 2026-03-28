import express from 'express'
import { sendOrder } from '../controllers/orderController.js'

const orderRouter = express.Router()
orderRouter.post("/order", sendOrder)

export default orderRouter