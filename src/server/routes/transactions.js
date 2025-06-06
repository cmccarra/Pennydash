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
    console.log(`Upload directory: ${uploadDir}`);
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const filename = Date.now() + '-' + file.originalname;
    console.log(`Saving file as: ${filename}`);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Get file extension
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Accept CSV, XML, Excel (xlsx, xls), PDF, and OFX/QFX files
    if (
      // Check by mimetype
      file.mimetype === 'text/csv' || 
      file.mimetype === 'application/xml' || 
      file.mimetype === 'text/xml' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/pdf' ||
      // Check by extension
      ext === '.csv' ||
      ext === '.xml' ||
      ext === '.xlsx' ||
      ext === '.xls' ||
      ext === '.pdf' ||
      ext === '.ofx' ||
      ext === '.qfx'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Supported file formats: CSV, XML, Excel, PDF, OFX/QFX'), false);
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
    console.log(`Processing uploaded file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ error: `File not found at path: ${filePath}` });
    }
    
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName).toLowerCase().slice(1);
    
    // Get account type from request body if provided
    const accountType = req.body.accountType || '';
    const accountName = req.body.accountName || '';
    
    console.log(`Parsing file with extension: ${fileExtension}`);
    
    // Parse the file based on its extension
    let transactions;
    try {
      transactions = await FileParser.parseFile(filePath);
      console.log(`Successfully parsed ${transactions.length} transactions from file`);
    } catch (parseError) {
      console.error('Error parsing file:', parseError);
      return res.status(400).json({ 
        error: `Error parsing file: ${parseError.message}`, 
        details: parseError.stack 
      });
    }
    
    if (!transactions || transactions.length === 0) {
      return res.status(400).json({ error: 'No transactions found in the uploaded file' });
    }
    
    // Add source file information and override account info if provided
    const processedTransactions = transactions.map(transaction => {
      // Create a new transaction object with the existing data
      const updatedTransaction = { ...transaction };
      
      // Set the source file name
      updatedTransaction.sourceFileName = fileName;
      
      // Override account type and name if provided in the request
      if (accountType && !updatedTransaction.accountType) {
        updatedTransaction.accountType = accountType;
      }
      
      if (accountName && !updatedTransaction.account) {
        updatedTransaction.account = accountName;
      }
      
      return updatedTransaction;
    });
    
    console.log(`Saving ${processedTransactions.length} transactions to database`);
    
    // Save transactions to database
    const savedTransactions = await db.addTransactions(processedTransactions);
    
    // Calculate some statistics
    const incomeTransactions = savedTransactions.filter(t => t.type === 'income');
    const expenseTransactions = savedTransactions.filter(t => t.type === 'expense');
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    
    // Find date range
    let minDate = null;
    let maxDate = null;
    
    if (savedTransactions.length > 0) {
      const dates = savedTransactions.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
      if (dates.length > 0) {
        minDate = new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
        maxDate = new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
      }
    }
    
    res.status(201).json({
      message: `Successfully imported ${savedTransactions.length} transactions`,
      fileType: fileExtension,
      fileName: fileName,
      dateRange: {
        from: minDate,
        to: maxDate
      },
      statistics: {
        totalTransactions: savedTransactions.length,
        incomeTransactions: incomeTransactions.length,
        expenseTransactions: expenseTransactions.length,
        totalIncome: totalIncome,
        totalExpense: totalExpense,
        netAmount: totalIncome - totalExpense
      },
      transactions: savedTransactions
    });
  } catch (error) {
    console.error('Upload endpoint error:', error);
    res.status(500).json({ 
      error: error.message, 
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
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

// Get upload statistics (unique source file names, account types, etc.)
router.get('/upload-stats', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    
    // Get unique source files
    const uploadedFiles = {};
    transactions.forEach(t => {
      if (t.sourceFileName && !uploadedFiles[t.sourceFileName]) {
        uploadedFiles[t.sourceFileName] = {
          fileName: t.sourceFileName,
          fileType: t.sourceFileName.split('.').pop().toLowerCase(),
          source: t.source,
          count: 0,
          accounts: new Set(),
          accountTypes: new Set(),
          dateRange: {
            from: null,
            to: null
          },
          income: 0,
          expense: 0
        };
      }
      
      if (t.sourceFileName) {
        const fileStats = uploadedFiles[t.sourceFileName];
        fileStats.count++;
        
        if (t.account) fileStats.accounts.add(t.account);
        if (t.accountType) fileStats.accountTypes.add(t.accountType);
        
        // Track date range
        const date = new Date(t.date);
        if (!isNaN(date.getTime())) {
          if (!fileStats.dateRange.from || date < new Date(fileStats.dateRange.from)) {
            fileStats.dateRange.from = t.date;
          }
          if (!fileStats.dateRange.to || date > new Date(fileStats.dateRange.to)) {
            fileStats.dateRange.to = t.date;
          }
        }
        
        // Track financials
        if (t.type === 'income') {
          fileStats.income += t.amount;
        } else {
          fileStats.expense += t.amount;
        }
      }
    });
    
    // Convert sets to arrays for JSON serialization
    const uploadStats = Object.values(uploadedFiles).map(file => ({
      ...file,
      accounts: Array.from(file.accounts),
      accountTypes: Array.from(file.accountTypes),
      netAmount: file.income - file.expense
    }));
    
    // Get account stats
    const accounts = {};
    transactions.forEach(t => {
      if (t.account) {
        if (!accounts[t.account]) {
          accounts[t.account] = {
            name: t.account,
            type: t.accountType || 'unknown',
            transactionCount: 0,
            income: 0,
            expense: 0
          };
        }
        
        accounts[t.account].transactionCount++;
        if (t.type === 'income') {
          accounts[t.account].income += t.amount;
        } else {
          accounts[t.account].expense += t.amount;
        }
      }
    });
    
    const accountStats = Object.values(accounts).map(account => ({
      ...account,
      balance: account.income - account.expense
    }));
    
    // Overall stats
    const totalTransactions = transactions.length;
    const categorizedTransactions = transactions.filter(t => t.categoryId).length;
    const totalIncome = transactions.filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      overallStats: {
        totalTransactions,
        categorizedTransactions,
        uncategorizedTransactions: totalTransactions - categorizedTransactions,
        categorizationProgress: totalTransactions > 0 ? 
          Math.round((categorizedTransactions / totalTransactions) * 100) : 0,
        totalIncome,
        totalExpense,
        netAmount: totalIncome - totalExpense
      },
      uploadedFiles: uploadStats,
      accounts: accountStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
