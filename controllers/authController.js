import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

// @desc    Register new user (Customer or Vendor)
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, storeName } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Public signup cannot create admin accounts
    if (role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be registered publicly' });
    }

    const allowedRoles = ['customer', 'vendor'];
    const safeRole = allowedRoles.includes(role) ? role : 'customer';

    // Role-specific validation
    if (safeRole === 'vendor' && !storeName) {
      return res.status(400).json({ message: 'Store name is required for vendor accounts' });
    }

    // Create new user document
    const user = await User.create({
      name,
      email,
      password,
      role: safeRole,
      storeName: safeRole === 'vendor' ? storeName : '',
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeName: user.storeName,
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data received' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

    // Validate email and hashed password
    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeName: user.storeName,
        token: generateToken(user._id, user.role),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile details
// @route   GET /api/auth/profile
// @access  Private
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeName: user.storeName,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};