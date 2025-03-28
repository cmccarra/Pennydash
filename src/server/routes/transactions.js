const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/inMemoryDB');
const Transaction = require('../models/transaction');
const FileParser = require('../services/fileParser');
const categorySuggestionService = require('../services/categorySuggestion');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
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

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific transaction
router.get('/:id', async (req, res) => {
  try {
    const transaction = await db.getTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new transaction
router.post('/', async (req, res) => {
  try {
    const transactionData = req.body;
    const errors = Transaction.validate(transactionData);
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const transaction = new Transaction(transactionData);
    const savedTransaction = await db.addTransaction(transaction);
    
    res.status(201).json(savedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a transaction
router.put('/:id', async (req, res) => {
  try {
    const transactionData = req.body;
    const errors = Transaction.validate(transactionData);
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const updatedTransaction = await db.updateTransaction(req.params.id, transactionData);
    
    if (!updatedTransaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(updatedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.deleteTransaction(req.params.id);
    
    if (!result) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload transactions from file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    const fileName = path.basename(filePath);
    
    // Parse the file based on its extension
    const transactions = await FileParser.parseFile(filePath);
    
    // Add source file information
    const processedTransactions = transactions.map(transaction => ({
      ...transaction,
      sourceFileName: fileName
    }));
    
    // Save transactions to database
    const savedTransactions = await db.addTransactions(processedTransactions);
    
    res.status(201).json({
      message: `Successfully imported ${savedTransactions.length} transactions`,
      transactions: savedTransactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update multiple transactions' category at once
router.post('/batch-categorize', async (req, res) => {
  try {
    const { transactionIds, categoryId } = req.body;
    
    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Transaction IDs array is required' });
    }
    
    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required' });
    }
    
    const category = await db.getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const updatedTransactions = await db.updateTransactionsCategory(transactionIds, categoryId);
    
    res.json({
      message: `Updated ${updatedTransactions.length} transactions`,
      transactions: updatedTransactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get category suggestions for a transaction
router.get('/:id/suggest-category', async (req, res) => {
  try {
    const transaction = await db.getTransactionById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const suggestion = await categorySuggestionService.suggestCategory(transaction.description);
    
    res.json(suggestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Find similar transactions
router.get('/:id/similar', async (req, res) => {
  try {
    const transaction = await db.getTransactionById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const threshold = parseFloat(req.query.threshold) || 0.7;
    const similarTransactions = await categorySuggestionService.findSimilarTransactions(transaction, threshold);
    
    res.json(similarTransactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get uncategorized transactions
router.get('/filter/uncategorized', async (req, res) => {
  try {
    const transactions = await db.getUncategorizedTransactions();
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
