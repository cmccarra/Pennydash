const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

// Import error handler utilities
const { formatErrorResponse } = require('./utils/errorHandler');

// Import database
const { initDB } = require('./db/sequelize');

// Import routes
const transactionRoutes = require('./routes/transactions.sequelize');
const transactionReviewedRoutes = require('./routes/transactions-reviewed');
const categoryRoutes = require('./routes/categories.sequelize');
const reportRoutes = require('./routes/reports.sequelize');
const settingsRoutes = require('./routes/settings.sequelize');
const reviewQueueRoutes = require('./routes/review-queue');
const suggestionRoutes = require('./routes/suggestions');
const aiStatusRoutes = require('./routes/ai-status');
const categorizationRoutes = require('./routes/categorization');
const uploadsRoutes = require('./routes/uploads');
const transactionTestRoutes = require('./routes/transactions-test');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure CORS with more specific settings
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://pennydash.replit.app'] // Update with your production domain(s)
    : ['http://localhost:3000', 'http://localhost:5000', '*'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token', 'x-requested-with'],
  credentials: true,
  maxAge: 86400, // 24 hours, how long preflight requests can be cached
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '5mb' })); // Increase limit for larger payloads
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Make the uploads directory available
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Use routes
app.use('/api/transactions', transactionRoutes);
app.use('/api/transactions', transactionReviewedRoutes);
app.use('/api/transactions', transactionTestRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/review-queue', reviewQueueRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/ai-status', aiStatusRoutes);
app.use('/api/categorize', categorizationRoutes);
app.use('/api/uploads', uploadsRoutes);

// Debug endpoint for development only
app.get('/api/debug/transaction-tags', async (req, res) => {
  try {
    const { getDB } = require('./db/sequelize');
    const sequelize = getDB();
    const { Transaction } = sequelize.models;
    
    // Get the latest transactions
    const transactions = await Transaction.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']]
    });
    
    // Check tags on each transaction
    const results = transactions.map(tx => ({
      id: tx.id,
      description: tx.description,
      tags: tx.tags,
      tagsType: Array.isArray(tx.tags) ? 'array' : typeof tx.tags,
      rawData: tx.dataValues
    }));
    
    res.json({
      message: 'Latest transactions with tag information',
      transactions: results
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Configure static file serving
const publicPath = path.join(__dirname, '../../public');
const rootPath = path.join(__dirname, '../../');

// Create public directory if it doesn't exist
if (!fs.existsSync(publicPath)) {
  try {
    fs.mkdirSync(publicPath, { recursive: true });
    console.log(`Created public directory at ${publicPath}`);
  } catch (error) {
    console.error(`Failed to create public directory: ${error.message}`);
  }
}

// Serve files from the public directory first (prioritize these)
app.use(express.static(publicPath, { 
  index: false,
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Then serve files from the root directory 
app.use(express.static(rootPath, {
  index: false,
  maxAge: 0
}));

// Centralized function to serve index.html for SPA routing
function serveIndexHtml(req, res) {
  const indexPath = path.join(__dirname, '../../index.html');
  
  // Only log in development or for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Serving index.html for path: ${req.path}`);
    
    if (!fs.existsSync(indexPath)) {
      console.error('Error: index.html does not exist at path:', indexPath);
      return res.status(404).send('Error: index.html not found');
    }
  }
  
  // Send the file with error handling
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Error sending index.html for ${req.path}:`, err.message);
      
      // Use our error handler format
      const error = new Error(`Failed to serve index.html: ${err.message}`);
      error.statusCode = 500;
      error.code = 'SERVE_ERROR';
      
      res.status(500).json(formatErrorResponse(error));
    }
  });
}

// Route for root path
app.get('/', serveIndexHtml);

// Fallback route for SPA client-side routing
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  
  serveIndexHtml(req, res);
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  console.error(err.stack);
  
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json(formatErrorResponse(err));
});

// Start server and database
const startServer = async () => {
  try {
    // Initialize database
    await initDB();
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer();

module.exports = app;
