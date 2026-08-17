import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import session from 'express-session';
import connectDB from '../config/db.js';
import seedAdmin from '../utils/seedAdmin.js';

import authRoutes from '../routes/authRoutes.js';
import productRoutes from '../routes/productRoutes.js';
import orderRoutes from '../routes/orderRoutes.js';
import adminPageRoutes from '../routes/adminPageRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
// Adjusted path to point back to root views directory
app.set('views', path.join(__dirname, '../views'));

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'marketplace-admin-session',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

// Database & Seed Connection Middleware for Serverless Environment
app.use(async (req, res, next) => {
  try {
    await connectDB();
    await seedAdmin();
    next();
  } catch (error) {
    console.error('Serverless DB/Seed Initialization Error:', error);
    res.status(500).json({ error: 'Database Connection Failed' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use(adminPageRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API is running cleanly' });
});

// Export default app for Vercel Serverless Function engine
export default app;