const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

// Import routes
const transactionRoutes = require('./routes/transactions');
const categoryRoutes = require('./routes/categories');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

module.exports = app;
