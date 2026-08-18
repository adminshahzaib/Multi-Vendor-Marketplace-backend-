import Order from '../models/Order.js';
import Product from '../models/Product.js';

// @desc    Create new multi-vendor order & split items
// @route   POST /api/orders
// @access  Private/Customer
export const createOrder = async (req, res) => {
  try {
    const { orderItems, shippingAddress, paymentMethod } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ message: 'No order items provided' });
    }

    const { address, city, postalCode, country } = shippingAddress || {};
    if (!address || !city || !postalCode || !country) {
      return res.status(400).json({
        message: 'Complete shipping address is required (address, city, postal code, country)',
      });
    }

    const resolvedPaymentMethod = paymentMethod || 'Cash on Delivery';
    if (resolvedPaymentMethod !== 'Cash on Delivery') {
      return res.status(400).json({ message: 'Only Cash on Delivery is supported' });
    }

    // 1. Fetch real DB products to prevent client-side price tampering
    const productIds = orderItems.map((item) => item.productId);
    const dbProducts = await Product.find({ _id: { $in: productIds } });

    if (dbProducts.length !== orderItems.length) {
      return res.status(404).json({ message: 'One or more products were not found' });
    }

    // 2. Validate stock levels and calculate vendor splits
    const vendorMap = {};
    let calculatedTotalPrice = 0;

    for (const item of orderItems) {
      const dbProduct = dbProducts.find((p) => p._id.toString() === item.productId);

      if (dbProduct.stock < item.quantity) {
        return res
          .status(400)
          .json({ message: `Insufficient stock for product: ${dbProduct.name}` });
      }

      const itemTotalPrice = dbProduct.price * item.quantity;
      calculatedTotalPrice += itemTotalPrice;

      const vendorId = dbProduct.vendor ? dbProduct.vendor.toString() : 'direct';

      // Group items by vendor ID
      if (!vendorMap[vendorId]) {
        vendorMap[vendorId] = {
          vendor: dbProduct.vendor || null,
          items: [],
          subtotal: 0,
        };
      }

      vendorMap[vendorId].items.push({
        product: dbProduct._id,
        name: dbProduct.name,
        price: dbProduct.price,
        quantity: item.quantity,
      });

      vendorMap[vendorId].subtotal += itemTotalPrice;
    }

    const vendorOrders = Object.values(vendorMap);

    // 3. Instantiate and save the parent order (COD = unpaid until delivered)
    const order = new Order({
      customer: req.user._id,
      shippingAddress: { address, city, postalCode, country },
      paymentMethod: resolvedPaymentMethod,
      isPaid: false,
      totalPrice: calculatedTotalPrice,
      vendorOrders,
    });

    const createdOrder = await order.save();

    // 4. Decrement inventory stock counts
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity },
      });
    }

    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get customer's personal order history
// @route   GET /api/orders/mine
// @access  Private/Customer
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .populate('vendorOrders.vendor', 'name storeName')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get sub-orders assigned to the logged-in vendor
// @route   GET /api/orders/vendor
// @access  Private/Vendor
export const getVendorOrders = async (req, res) => {
  try {
    // Find parent orders containing items for this vendor
    const parentOrders = await Order.find({
      'vendorOrders.vendor': req.user._id,
    })
      .populate('customer', 'name email')
      .sort({ createdAt: -1 });

    // Isolate sub-orders relevant only to this vendor
    const filteredOrders = parentOrders.map((order) => {
      const vendorSubOrder = order.vendorOrders.find(
        (v) => v.vendor && v.vendor.toString() === req.user._id.toString()
      );

      return {
        _id: order._id,
        customer: order.customer,
        shippingAddress: order.shippingAddress,
        isPaid: order.isPaid,
        createdAt: order.createdAt,
        subOrder: vendorSubOrder,
      };
    });

    res.json(filteredOrders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update sub-order fulfillment status (Vendor specific)
// @route   PUT /api/orders/:orderId/vendor-status
// @access  Private/Vendor
export const updateVendorOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body; // e.g., 'processing', 'shipped', 'delivered'

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const subOrder = order.vendorOrders.find(
      (v) => v.vendor && v.vendor.toString() === req.user._id.toString()
    );

    if (!subOrder) {
      return res.status(403).json({ message: 'No sub-orders found for your store in this order' });
    }

    const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }

    subOrder.status = status;

    // COD: mark order as paid once all vendor sub-orders are delivered
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

    res.json({
      message: 'Sub-order status updated',
      subOrder,
      isPaid: order.isPaid,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};