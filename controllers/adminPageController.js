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
  const success = (req.query.success || '').trim();
  const error = (req.query.error || '').trim();

  const orders = await Order.find()
    .populate('customer', 'name email')
    .populate('vendorOrders.vendor', 'name storeName email')
    .sort({ createdAt: -1 });

  res.render('admin/orders', {
    title: 'All Orders',
    active: 'orders',
    orders,
    success,
    error,
    formatMoney,
    formatDate,
  });
};

export const updateAdminSubOrderStatus = async (req, res) => {
  try {
    const { orderId, subOrderId } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.redirect('/admin/orders?error=' + encodeURIComponent('Invalid order status selected.'));
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.redirect('/admin/orders?error=' + encodeURIComponent('Order not found.'));
    }

    const subOrder =
      order.vendorOrders.id(subOrderId) ||
      order.vendorOrders.find((v) => v._id.toString() === subOrderId);

    if (!subOrder) {
      return res.redirect('/admin/orders?error=' + encodeURIComponent('Sub-order not found.'));
    }

    subOrder.status = status;

    // COD check: mark order as paid once all vendor/admin sub-orders are delivered
    const allDelivered = order.vendorOrders.every((v) => v.status === 'delivered');
    if (
      allDelivered &&
      order.paymentMethod === 'Cash on Delivery' &&
      !order.isPaid
    ) {
      order.isPaid = true;
      order.paidAt = new Date();
      order.paymentResult = {
        id: `cod_${order._id}`,
        status: 'collected_on_delivery',
      };
    }

    await order.save();
    res.redirect('/admin/orders?success=' + encodeURIComponent(`Sub-order status updated to ${status}.`));
  } catch (err) {
    console.error('Failed to update admin sub-order status:', err);
    res.redirect('/admin/orders?error=' + encodeURIComponent(err.message || 'Failed to update status.'));
  }
};

const PRODUCT_PRESET_CATEGORIES = [
  'Electronics',
  'Apparel',
  'Home & Kitchen',
  'Books',
  'Health & Beauty',
  'Sports & Outdoors',
];

export const renderProducts = async (req, res) => {
  try {
    const search = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const success = (req.query.success || '').trim();
    const error = (req.query.error || '').trim();

    const query = {};
    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      const matchingVendors = await User.find({
        role: 'vendor',
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { storeName: { $regex: search, $options: 'i' } },
        ],
      }).select('_id');

      const vendorIds = matchingVendors.map((v) => v._id);

      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { vendor: { $in: vendorIds } },
      ];
    }

    const [products, distinctCategories] = await Promise.all([
      Product.find(query)
        .populate('vendor', 'name storeName email')
        .sort({ createdAt: -1 }),
      Product.distinct('category'),
    ]);

    // Merge preset categories with existing categories from DB
    const allCategories = Array.from(
      new Set([...PRODUCT_PRESET_CATEGORIES, ...(distinctCategories || [])])
    ).filter(Boolean);

    res.render('admin/products', {
      title: 'Products Management',
      active: 'products',
      products,
      categories: allCategories,
      selectedCategory: category || 'All',
      search,
      success,
      error,
      formatMoney,
      formatDate,
    });
  } catch (err) {
    console.error('Error rendering admin products:', err);
    res.status(500).render('admin/not-found', {
      title: 'Error',
      active: 'products',
      message: 'Failed to load products list.',
    });
  }
};

export const renderProductNew = async (req, res) => {
  try {
    const distinctCategories = await Product.distinct('category');
    const allCategories = Array.from(
      new Set([...PRODUCT_PRESET_CATEGORIES, ...(distinctCategories || [])])
    ).filter(Boolean);

    res.render('admin/product-form', {
      title: 'Create New Product',
      active: 'products',
      isEdit: false,
      product: null,
      categories: allCategories,
      error: req.query.error || '',
    });
  } catch (err) {
    res.redirect('/admin/products');
  }
};

export const createAdminProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      categoryOption,
      customCategory,
      price,
      originalPrice,
      stock,
      image,
    } = req.body;

    const category =
      categoryOption === 'Other'
        ? (customCategory || '').trim()
        : (categoryOption || '').trim();

    if (!name || !description || !category || price === undefined || stock === undefined) {
      return res.redirect(
        '/admin/products/new?error=' +
          encodeURIComponent('Please fill in all required product fields.')
      );
    }

    const numPrice = Number(price);
    const numOriginalPrice = originalPrice ? Number(originalPrice) : numPrice;
    const numStock = Number(stock);

    if (isNaN(numPrice) || numPrice < 0 || isNaN(numStock) || numStock < 0) {
      return res.redirect(
        '/admin/products/new?error=' +
          encodeURIComponent('Price and Stock must be valid non-negative numbers.')
      );
    }

    if (numOriginalPrice < numPrice) {
      return res.redirect(
        '/admin/products/new?error=' +
          encodeURIComponent('Selling Price cannot be higher than Original Price (MSRP).')
      );
    }

    const newProduct = new Product({
      vendor: null, // Admin-created product explicitly has vendor = null
      name: name.trim(),
      description: description.trim(),
      category,
      price: numPrice,
      originalPrice: numOriginalPrice,
      stock: numStock,
      image:
        (image || '').trim() ||
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
    });

    await newProduct.save();
    res.redirect('/admin/products?success=' + encodeURIComponent('Product created successfully!'));
  } catch (err) {
    console.error('Failed to create admin product:', err);
    res.redirect(
      '/admin/products/new?error=' +
        encodeURIComponent(err.message || 'Failed to create product.')
    );
  }
};

export const renderProductEdit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render('admin/not-found', {
        title: 'Not found',
        active: 'products',
        message: 'Product not found.',
      });
    }

    const product = await Product.findById(id).populate(
      'vendor',
      'name storeName email'
    );
    if (!product) {
      return res.status(404).render('admin/not-found', {
        title: 'Not found',
        active: 'products',
        message: 'Product not found.',
      });
    }

    const distinctCategories = await Product.distinct('category');
    const allCategories = Array.from(
      new Set([...PRODUCT_PRESET_CATEGORIES, ...(distinctCategories || [])])
    ).filter(Boolean);

    res.render('admin/product-form', {
      title: `Edit Product · ${product.name}`,
      active: 'products',
      isEdit: true,
      product,
      categories: allCategories,
      error: req.query.error || '',
    });
  } catch (err) {
    console.error('Failed to load product for edit:', err);
    res.redirect('/admin/products');
  }
};

export const updateAdminProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render('admin/not-found', {
        title: 'Not found',
        active: 'products',
        message: 'Product not found.',
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).render('admin/not-found', {
        title: 'Not found',
        active: 'products',
        message: 'Product not found.',
      });
    }

    const {
      name,
      description,
      categoryOption,
      customCategory,
      price,
      originalPrice,
      stock,
      image,
    } = req.body;

    const category =
      categoryOption === 'Other'
        ? (customCategory || '').trim()
        : (categoryOption || '').trim();

    if (!name || !description || !category || price === undefined || stock === undefined) {
      return res.redirect(
        `/admin/products/${id}/edit?error=` +
          encodeURIComponent('Please fill in all required product fields.')
      );
    }

    const numPrice = Number(price);
    const numOriginalPrice = originalPrice ? Number(originalPrice) : numPrice;
    const numStock = Number(stock);

    if (isNaN(numPrice) || numPrice < 0 || isNaN(numStock) || numStock < 0) {
      return res.redirect(
        `/admin/products/${id}/edit?error=` +
          encodeURIComponent('Price and Stock must be valid non-negative numbers.')
      );
    }

    if (numOriginalPrice < numPrice) {
      return res.redirect(
        `/admin/products/${id}/edit?error=` +
          encodeURIComponent('Selling Price cannot be higher than Original Price (MSRP).')
      );
    }

    product.name = name.trim();
    product.description = description.trim();
    product.category = category;
    product.price = numPrice;
    product.originalPrice = numOriginalPrice;
    product.stock = numStock;
    if (image && image.trim()) {
      product.image = image.trim();
    }

    await product.save();
    res.redirect('/admin/products?success=' + encodeURIComponent('Product updated successfully!'));
  } catch (err) {
    console.error('Failed to update product:', err);
    res.redirect(
      `/admin/products/${req.params.id}/edit?error=` +
        encodeURIComponent(err.message || 'Failed to update product.')
    );
  }
};

export const deleteAdminProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect(
        '/admin/products?error=' + encodeURIComponent('Invalid Product ID')
      );
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.redirect(
        '/admin/products?error=' + encodeURIComponent('Product not found')
      );
    }

    await product.deleteOne();
    res.redirect('/admin/products?success=' + encodeURIComponent('Product deleted successfully!'));
  } catch (err) {
    console.error('Failed to delete product:', err);
    res.redirect(
      '/admin/products?error=' +
        encodeURIComponent(err.message || 'Failed to delete product.')
    );
  }
};
