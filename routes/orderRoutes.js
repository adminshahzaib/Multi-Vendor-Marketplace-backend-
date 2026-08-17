import express from 'express';
import {
  createOrder,
  getMyOrders,
  getVendorOrders,
  updateVendorOrderStatus,
} from '../controllers/orderController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Customer Endpoints
router.post('/', protect, authorizeRoles('customer'), createOrder);
router.get('/mine', protect, authorizeRoles('customer'), getMyOrders);

// Vendor Order Management Endpoints
router.get('/vendor', protect, authorizeRoles('vendor'), getVendorOrders);
router.put(
  '/:orderId/vendor-status',
  protect,
  authorizeRoles('vendor'),
  updateVendorOrderStatus
);

export default router;