const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

// Import database
const { initDB } = require('./db/sequelize');

// Import routes
const transactionRoutes = require('./routes/transactions.sequelize');
const categoryRoutes = require('./routes/categories.sequelize');
const reportRoutes = require('./routes/reports.sequelize');
const settingsRoutes = require('./routes/settings.sequelize');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Make the uploads directory available
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Use routes
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);

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

// Serve static files from the root
app.use(express.static(path.join(__dirname, '../../')));

// Serve index.html for the root path and all other non-API routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../index.html'));
});

// Fallback to index.html for SPA routing
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: true,
    message: err.message || 'Something went wrong on the server',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
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
