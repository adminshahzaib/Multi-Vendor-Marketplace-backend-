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

export default router;
