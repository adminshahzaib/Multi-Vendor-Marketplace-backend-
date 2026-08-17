import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

const formatMoney = (value = 0) => Number(value || 0).toFixed(2);

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

export const renderHome = (req, res) => {
  if (req.session?.adminId) {
    return res.redirect('/admin');
  }
  res.render('home', { title: 'Marketplace API' });
};

export const renderLogin = (req, res) => {
  res.render('admin/login', {
    title: 'Admin Login',
    error: req.session.adminError || '',
    email: '',
  });
  delete req.session.adminError;
};

export const loginAdmin = async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) {
      req.session.adminError = 'Email and password are required.';
      return res.redirect('/admin/login');
    }

    const admin = await User.findOne({ email, role: 'admin' });
    if (!admin || !(await admin.matchPassword(password))) {
      req.session.adminError = 'Invalid admin credentials.';
      return res.redirect('/admin/login');
    }

    req.session.adminId = admin._id.toString();
    req.session.adminName = admin.name;
    res.redirect('/admin');
  } catch (error) {
    req.session.adminError = 'Login failed. Please try again.';
    res.redirect('/admin/login');
  }
};

export const logoutAdmin = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};

export const renderDashboard = async (req, res) => {
  const [customerCount, vendorCount, productCount, orderCount, revenueAgg, recentOrders] =
    await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'vendor' }),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([{ $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
      Order.find()
        .populate('customer', 'name email')
        .sort({ createdAt: -1 })
        .limit(8),
    ]);

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    active: 'dashboard',
    stats: {
      customerCount,
      vendorCount,
      productCount,
      orderCount,
      revenue: formatMoney(revenueAgg[0]?.total),
    },
    recentOrders,
    formatMoney,
    formatDate,
  });
};

export const renderCustomers = async (req, res) => {
  const search = (req.query.q || '').trim();
  const query = { role: 'customer' };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const customers = await User.find(query).select('-password').sort({ createdAt: -1 });
  const customerIds = customers.map((c) => c._id);
  const orderStats = await Order.aggregate([
    { $match: { customer: { $in: customerIds } } },
    {
      $group: {
        _id: '$customer',
        orderCount: { $sum: 1 },
        totalSpent: { $sum: '$totalPrice' },
      },
    },
  ]);

  const statsById = Object.fromEntries(
    orderStats.map((row) => [row._id.toString(), row])
  );

  res.render('admin/customers', {
    title: 'Customers',
    active: 'customers',
    search,
    customers: customers.map((customer) => {
      const stats = statsById[customer._id.toString()] || {};
      return {
        ...customer.toObject(),
        orderCount: stats.orderCount || 0,
        totalSpent: formatMoney(stats.totalSpent),
      };
    }),
    formatDate,
  });
};

export const renderCustomerDetail = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).render('admin/not-found', {
      title: 'Not found',
      active: 'customers',
      message: 'Customer not found.',
    });
  }

  const customer = await User.findOne({ _id: id, role: 'customer' }).select('-password');
  if (!customer) {
    return res.status(404).render('admin/not-found', {
      title: 'Not found',
      active: 'customers',
      message: 'Customer not found.',
    });
  }

  const orders = await Order.find({ customer: customer._id })
    .populate('vendorOrders.vendor', 'name storeName email')
    .sort({ createdAt: -1 });

  const totalSpent = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

  res.render('admin/customer-detail', {
    title: customer.name,
    active: 'customers',
    customer,
    orders,
    totalSpent: formatMoney(totalSpent),
    formatMoney,
    formatDate,
  });
};

export const renderVendors = async (req, res) => {
  const search = (req.query.q || '').trim();
  const query = { role: 'vendor' };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { storeName: { $regex: search, $options: 'i' } },
    ];
  }

  const vendors = await User.find(query).select('-password').sort({ createdAt: -1 });
  const vendorIds = vendors.map((v) => v._id);

  const [productCounts, salesStats] = await Promise.all([
    Product.aggregate([
      { $match: { vendor: { $in: vendorIds } } },
      { $group: { _id: '$vendor', productCount: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $unwind: '$vendorOrders' },
      { $match: { 'vendorOrders.vendor': { $in: vendorIds } } },
      {
        $group: {
          _id: '$vendorOrders.vendor',
          orderCount: { $sum: 1 },
          sales: { $sum: '$vendorOrders.subtotal' },
        },
      },
    ]),
  ]);

  const productsById = Object.fromEntries(
    productCounts.map((row) => [row._id.toString(), row.productCount])
  );
  const salesById = Object.fromEntries(
    salesStats.map((row) => [row._id.toString(), row])
  );

  res.render('admin/vendors', {
    title: 'Vendors',
    active: 'vendors',
    search,
    vendors: vendors.map((vendor) => {
      const sales = salesById[vendor._id.toString()] || {};
      return {
        ...vendor.toObject(),
        productCount: productsById[vendor._id.toString()] || 0,
        orderCount: sales.orderCount || 0,
        sales: formatMoney(sales.sales),
      };
    }),
    formatDate,
  });
};

export const renderVendorDetail = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).render('admin/not-found', {
      title: 'Not found',
      active: 'vendors',
      message: 'Vendor not found.',
    });
  }

  const vendor = await User.findOne({ _id: id, role: 'vendor' }).select('-password');
  if (!vendor) {
    return res.status(404).render('admin/not-found', {
      title: 'Not found',
      active: 'vendors',
      message: 'Vendor not found.',
    });
  }

  const products = await Product.find({ vendor: vendor._id }).sort({ createdAt: -1 });
  const parentOrders = await Order.find({ 'vendorOrders.vendor': vendor._id })
    .populate('customer', 'name email')
    .sort({ createdAt: -1 });

  const salesHistory = parentOrders.map((order) => {
    const subOrder = order.vendorOrders.find(
      (item) => item.vendor.toString() === vendor._id.toString()
    );
    return {
      orderId: order._id,
      customer: order.customer,
      createdAt: order.createdAt,
      isPaid: order.isPaid,
      subOrder,
    };
  });

  const totalSales = salesHistory.reduce(
    (sum, row) => sum + (row.subOrder?.subtotal || 0),
    0
  );

  res.render('admin/vendor-detail', {
    title: vendor.storeName || vendor.name,
    active: 'vendors',
    vendor,
    products,
    salesHistory,
    totalSales: formatMoney(totalSales),
    formatMoney,
    formatDate,
  });
};

export const renderOrders = async (req, res) => {
  const orders = await Order.find()
    .populate('customer', 'name email')
    .populate('vendorOrders.vendor', 'name storeName')
    .sort({ createdAt: -1 });

  res.render('admin/orders', {
    title: 'All Orders',
    active: 'orders',
    orders,
    formatMoney,
    formatDate,
  });
};
