import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getVendorProducts,
} from '../controllers/productController.js';
import { protect, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public Catalog Routes
router.get('/', getProducts);
router.get('/:id', getProductById);

// Protected Vendor Inventory Management Routes
router.get(
  '/vendor/inventory',
  protect,
  authorizeRoles('vendor'),
  getVendorProducts
);

router.post(
  '/',
  protect,
  authorizeRoles('vendor'),
  createProduct
);

router.put(
  '/:id',
  protect,
  authorizeRoles('vendor'),
  updateProduct
);

router.delete(
  '/:id',
  protect,
  authorizeRoles('vendor'),
  deleteProduct
);

export default router;