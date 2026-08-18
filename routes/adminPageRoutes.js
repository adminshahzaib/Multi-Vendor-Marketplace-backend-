import express from 'express';
import {
  renderHome,
  renderLogin,
  loginAdmin,
  logoutAdmin,
  renderDashboard,
  renderCustomers,
  renderCustomerDetail,
  renderVendors,
  renderVendorDetail,
  renderOrders,
  updateAdminSubOrderStatus,
  renderProducts,
  renderProductNew,
  createAdminProduct,
  renderProductEdit,
  updateAdminProduct,
  deleteAdminProduct,
} from '../controllers/adminPageController.js';
import { requireAdminPage, redirectIfAdminLoggedIn } from '../middleware/adminSession.js';

const router = express.Router();

router.get('/', renderHome);

router.get('/admin/login', redirectIfAdminLoggedIn, renderLogin);
router.post('/admin/login', redirectIfAdminLoggedIn, loginAdmin);
router.post('/admin/logout', requireAdminPage, logoutAdmin);

router.get('/admin', requireAdminPage, renderDashboard);
router.get('/admin/customers', requireAdminPage, renderCustomers);
router.get('/admin/customers/:id', requireAdminPage, renderCustomerDetail);
router.get('/admin/vendors', requireAdminPage, renderVendors);
router.get('/admin/vendors/:id', requireAdminPage, renderVendorDetail);
router.get('/admin/orders', requireAdminPage, renderOrders);
router.post('/admin/orders/:orderId/suborders/:subOrderId/status', requireAdminPage, updateAdminSubOrderStatus);

// Admin Product CRUD Routes
router.get('/admin/products', requireAdminPage, renderProducts);
router.get('/admin/products/new', requireAdminPage, renderProductNew);
router.post('/admin/products', requireAdminPage, createAdminProduct);
router.get('/admin/products/:id/edit', requireAdminPage, renderProductEdit);
router.post('/admin/products/:id/edit', requireAdminPage, updateAdminProduct);
router.post('/admin/products/:id/delete', requireAdminPage, deleteAdminProduct);

export default router;
