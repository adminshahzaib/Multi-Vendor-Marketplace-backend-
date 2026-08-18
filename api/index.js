// backend/api/index.js
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
import MongoStore from 'connect-mongo';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);

// Configure View Engine (Adjust relative path for views)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Dynamic CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL, // Deployed frontend URL
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Fallback to allow requests
      }
    },
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
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 12 * 60 * 60, // 12 hours
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 12,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Serverless DB & Seed initialization middleware
let isInitialized = false;
const initializeApp = async () => {
  if (isInitialized) return;
  try {
    await connectDB();
    await seedAdmin();
    isInitialized = true;
  } catch (error) {
    console.error('Initialization error:', error);
  }
};

app.use(async (req, res, next) => {
  await initializeApp();
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use(adminPageRoutes);

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'API is running cleanly' });
});


// Export Express app for Vercel Serverless (DO NOT call app.listen)
export default app;