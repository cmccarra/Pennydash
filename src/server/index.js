const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');

// Import routes
const transactionRoutes = require('./routes/transactions');
const categoryRoutes = require('./routes/categories');
const reportRoutes = require('./routes/reports');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads/'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept only CSV and XML files
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/xml' || 
        file.mimetype === 'text/xml' ||
        file.originalname.endsWith('.csv') ||
        file.originalname.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and XML files are allowed'), false);
    }
  }
});

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
