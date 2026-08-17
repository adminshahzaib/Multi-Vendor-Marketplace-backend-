import Product from '../models/Product.js';

// @desc    Fetch all products (Public with filtering & search)
// @route   GET /api/products
// @access  Public
export const getProducts = async (req, res) => {
  try {
    const { keyword, search, category, vendor, sort } = req.query;
    const searchTerm = keyword || search;

    let query = {};

    // Search by product name
    if (searchTerm) {
      query.name = { $regex: searchTerm, $options: 'i' };
    }

    // Filter by category
    if (category && category !== 'All') {
      query.category = category;
    }

    // Filter by vendor
    if (vendor) {
      query.vendor = vendor;
    }

    let result = Product.find(query).populate('vendor', 'name storeName storeRating');

    // Sorting logic
    if (sort === 'price-low') {
      result = result.sort({ price: 1 });
    } else if (sort === 'price-high') {
      result = result.sort({ price: -1 });
    } else if (sort === 'rating') {
      result = result.sort({ rating: -1 });
    } else {
      result = result.sort({ createdAt: -1 }); // Default: Latest items
    }

    const products = await result;
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Fetch single product by ID
// @route   GET /api/products/:id
// @access  Public
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      'vendor',
      'name storeName storeRating'
    );

    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new product (Vendor Only)
// @route   POST /api/products
// @access  Private/Vendor
export const createProduct = async (req, res) => {
  try {
    const { name, description, category, price, originalPrice, stock, image } = req.body;

    const product = new Product({
      vendor: req.user._id, // Set from protected JWT middleware
      name,
      description,
      category,
      price,
      originalPrice: originalPrice || price,
      stock,
      image,
    });

    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a product (Vendor Only - Owner Restriction)
// @route   PUT /api/products/:id
// @access  Private/Vendor
export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Strictly enforce vendor ownership
    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden: You can only edit your own products' });
    }

    const { name, description, category, price, originalPrice, stock, image } = req.body;

    product.name = name || product.name;
    product.description = description || product.description;
    product.category = category || product.category;
    product.price = price !== undefined ? price : product.price;
    product.originalPrice = originalPrice !== undefined ? originalPrice : product.originalPrice;
    product.stock = stock !== undefined ? stock : product.stock;
    product.image = image || product.image;

    const updatedProduct = await product.save();
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a product (Vendor Only - Owner Restriction)
// @route   DELETE /api/products/:id
// @access  Private/Vendor
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Strictly enforce vendor ownership
    if (product.vendor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden: You can only delete your own products' });
    }

    await product.deleteOne();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get inventory listed by the logged-in vendor
// @route   GET /api/products/vendor/inventory
// @access  Private/Vendor
export const getVendorProducts = async (req, res) => {
  try {
    const products = await Product.find({ vendor: req.user._id }).sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};