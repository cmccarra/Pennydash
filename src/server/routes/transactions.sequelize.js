const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../db/sequelize');
const FileParser = require('../services/fileParser');
const categorySuggestionService = require('../services/categorySuggestion');
const { Op } = require('sequelize');

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

// Get the Sequelize models
const getModels = () => {
  const sequelize = getDB();
  return sequelize.models;
};

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const transactions = await Transaction.findAll({
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon']
        },
        {
          model: Category,
          as: 'subcategory',
          attributes: ['id', 'name', 'color', 'icon'],
          required: false
        }
      ],
      order: [['date', 'DESC']]
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific transaction
router.get('/:id', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const transaction = await Transaction.findByPk(req.params.id, {
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon']
        },
        {
          model: Category,
          as: 'subcategory',
          attributes: ['id', 'name', 'color', 'icon'],
          required: false
        }
      ]
    });
    
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
    const { Transaction } = getModels();
    const transactionData = req.body;
    
    // Convert tags from string to array if needed
    if (transactionData.tags && typeof transactionData.tags === 'string') {
      transactionData.tags = transactionData.tags.split(',').map(tag => tag.trim());
    }
    
    // Validate the transaction data
    try {
      const newTransaction = await Transaction.create(transactionData);
      
      // Fetch the created transaction with its category and subcategory
      const savedTransaction = await Transaction.findByPk(newTransaction.id, {
        include: [
          { model: getModels().Category, as: 'category' },
          { model: getModels().Category, as: 'subcategory', required: false }
        ]
      });
      
      res.status(201).json(savedTransaction);
    } catch (validationError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: validationError.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a transaction
router.put('/:id', async (req, res) => {
  try {
    const { Transaction } = getModels();
    const transactionData = req.body;
    
    // Convert tags from string to array if needed
    if (transactionData.tags && typeof transactionData.tags === 'string') {
      transactionData.tags = transactionData.tags.split(',').map(tag => tag.trim());
    }
    
    // Find the transaction first
    const transaction = await Transaction.findByPk(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Update the transaction
    await transaction.update(transactionData);
    
    // Get the updated transaction with its category and subcategory
    const updatedTransaction = await Transaction.findByPk(req.params.id, {
      include: [
        { model: getModels().Category, as: 'category' },
        { model: getModels().Category, as: 'subcategory', required: false }
      ]
    });
    
    res.json(updatedTransaction);
  } catch (error) {
    // Check if it's a validation error
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
  try {
    const { Transaction } = getModels();
    
    // Find the transaction first
    const transaction = await Transaction.findByPk(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Delete the transaction
    await transaction.destroy();
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for testing tags
router.get('/debug/tags-test', async (req, res) => {
  try {
    const testTags = ["tag1", "tag2", "tag3"];
    const { Transaction } = getModels();
    
    // Create a test transaction with explicit tags
    const transaction = await Transaction.create({
      date: new Date().toISOString().split('T')[0],
      description: "Test transaction with tags",
      amount: 100,
      type: "expense",
      tags: testTags
    });
    
    // Get the transaction back from the database
    const saved = await Transaction.findByPk(transaction.id);
    
    res.json({
      message: "Tags test",
      tagsBeforeSave: testTags,
      tagsAfterSave: saved.tags,
      tagsType: Array.isArray(saved.tags) ? "array" : typeof saved.tags,
      fullTransaction: saved
    });
  } catch (error) {
    console.error("Error in tags test:", error);
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
    
    // Get account information from request body if provided
    const accountType = req.body.accountType || '';
    const accountName = req.body.accountName || '';
    const accountTypeEnum = req.body.accountTypeEnum || '';
    
    console.log(`Parsing file with extension: ${fileExtension}`);
    
    // Parse the file based on its extension
    let transactions;
    try {
      transactions = await FileParser.parseFile(filePath);
      console.log(`Successfully parsed ${transactions.length} transactions from file`);
      
      // Debug the first parsed transaction's tags field
      if (transactions.length > 0) {
        console.log('🔍 First parsed transaction:', JSON.stringify({
          description: transactions[0].description,
          tags: transactions[0].tags,
          Tags: transactions[0].Tags
        }));
      }
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
    
    const { Transaction } = getModels();
    
    // Add source file information and override account info if provided
    const processedTransactions = transactions.map(transaction => {
      // Create a new transaction object with the existing data
      const updatedTransaction = { ...transaction };
      
      // Set the source file name
      updatedTransaction.importSource = fileName;
      
      // Override source, account, accountType if provided in the request
      if (accountType) {
        updatedTransaction.source = accountType;
      }
      
      if (accountName) {
        updatedTransaction.account = accountName;
      }
      
      if (accountTypeEnum) {
        updatedTransaction.accountType = accountTypeEnum;
      }
      
      // Make sure tags is always an array
      if (!updatedTransaction.tags) {
        updatedTransaction.tags = [];
      } else if (typeof updatedTransaction.tags === 'string') {
        // Check for both semicolon and comma separators
        if (updatedTransaction.tags.includes(';')) {
          updatedTransaction.tags = updatedTransaction.tags.split(';').map(tag => tag.trim());
        } else if (updatedTransaction.tags.includes(',')) {
          updatedTransaction.tags = updatedTransaction.tags.split(',').map(tag => tag.trim());
        } else {
          updatedTransaction.tags = [updatedTransaction.tags.trim()];
        }
        console.log(`📋 Converted tags for transaction "${updatedTransaction.description}": ${JSON.stringify(updatedTransaction.tags)}`);
      } else if (Array.isArray(updatedTransaction.tags)) {
        console.log(`📋 Tags already array for "${updatedTransaction.description}": ${JSON.stringify(updatedTransaction.tags)}`);
      } else {
        console.log(`📋 Unknown tags type for "${updatedTransaction.description}": ${typeof updatedTransaction.tags}`);
        // Default to empty array if we can't determine the format
        updatedTransaction.tags = [];
      }
      
      return updatedTransaction;
    });
    
    console.log(`Saving ${processedTransactions.length} transactions to database`);
    
    // Save transactions to database
    const savedTransactions = await Transaction.bulkCreate(processedTransactions, {
      returning: true
    });
    
    // Calculate some statistics
    const incomeTransactions = savedTransactions.filter(t => t.type === 'income');
    const expenseTransactions = savedTransactions.filter(t => t.type === 'expense');
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = expenseTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    
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

// Import CSV file specifically - uses the same functionality as /upload but with clearer endpoint
router.post('/import/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No CSV file uploaded' });
    }
    
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileExt = path.extname(fileName).toLowerCase();
    
    // Verify it's a CSV file
    if (fileExt !== '.csv') {
      return res.status(400).json({ error: 'File must be a CSV file' });
    }
    
    console.log(`Processing CSV file: ${filePath}`);
    
    // Parse the CSV file
    let transactions;
    try {
      transactions = await FileParser.parseCSV(filePath);
      console.log(`Successfully parsed ${transactions.length} transactions from CSV`);
      
      // Debug the first parsed transaction
      if (transactions.length > 0) {
        console.log('First parsed transaction:', JSON.stringify(transactions[0], null, 2));
      }
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'CSV parsing error', 
        details: parseError.message
      });
    }
    
    if (transactions.length === 0) {
      return res.status(400).json({ error: 'No transactions found in the CSV file' });
    }
    
    // Get the Transaction model
    const { Transaction } = getModels();
    
    // Add source file information and override account info if provided
    const processedTransactions = transactions.map(transaction => {
      // Create a new transaction object with the existing data
      const updatedTransaction = { ...transaction };
      
      // Set the import source filename
      updatedTransaction.importSource = fileName;
      
      // Override account info if provided in the request
      if (req.body.accountType) {
        updatedTransaction.source = req.body.accountType;
      }
      
      if (req.body.accountName) {
        updatedTransaction.account = req.body.accountName;
      }
      
      if (req.body.accountTypeEnum) {
        updatedTransaction.accountType = req.body.accountTypeEnum;
      }
      
      // Make sure tags is always an array
      if (!updatedTransaction.tags) {
        updatedTransaction.tags = [];
      } else if (typeof updatedTransaction.tags === 'string') {
        // Check for both semicolon and comma separators
        if (updatedTransaction.tags.includes(';')) {
          updatedTransaction.tags = updatedTransaction.tags.split(';').map(tag => tag.trim());
        } else if (updatedTransaction.tags.includes(',')) {
          updatedTransaction.tags = updatedTransaction.tags.split(',').map(tag => tag.trim());
        } else {
          updatedTransaction.tags = [updatedTransaction.tags.trim()];
        }
        console.log(`📋 Converted tags for transaction "${updatedTransaction.description}": ${JSON.stringify(updatedTransaction.tags)}`);
      } else if (Array.isArray(updatedTransaction.tags)) {
        console.log(`📋 Tags already array for "${updatedTransaction.description}": ${JSON.stringify(updatedTransaction.tags)}`);
      } else {
        console.log(`📋 Unknown tags type for "${updatedTransaction.description}": ${typeof updatedTransaction.tags}`);
        // Default to empty array if we can't determine the format
        updatedTransaction.tags = [];
      }
      
      return updatedTransaction;
    });
    
    console.log(`Saving ${processedTransactions.length} transactions to database`);
    
    // Save transactions to database
    const savedTransactions = await Transaction.bulkCreate(processedTransactions, {
      returning: true
    });
    
    // Calculate some statistics
    const incomeTransactions = savedTransactions.filter(t => t.type === 'income');
    const expenseTransactions = savedTransactions.filter(t => t.type === 'expense');
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = expenseTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    
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
      message: `Successfully imported ${savedTransactions.length} transactions from CSV`,
      fileType: 'csv',
      fileName: fileName,
      added: savedTransactions.length,
      skipped: 0,
      failed: 0,
      total: transactions.length,
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
    console.error('CSV import endpoint error:', error);
    res.status(500).json({ 
      error: error.message, 
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// Update multiple transactions' category at once
router.post('/batch-categorize', async (req, res) => {
  try {
    const { transactionIds, categoryId, subcategoryId } = req.body;
    
    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Transaction IDs array is required' });
    }
    
    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID is required' });
    }
    
    const { Transaction, Category } = getModels();
    
    // Verify the category exists
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Verify subcategory if provided
    if (subcategoryId) {
      const subcategory = await Category.findByPk(subcategoryId);
      if (!subcategory) {
        return res.status(404).json({ error: 'Subcategory not found' });
      }
    }
    
    // Prepare update data
    const updateData = { categoryId };
    
    // Add subcategory if provided
    if (subcategoryId) {
      updateData.subcategoryId = subcategoryId;
    }
    
    console.log(`Applying category ID ${categoryId} to transaction IDs: ${transactionIds.join(', ')}`);
    
    // Update all transactions
    await Transaction.update(updateData, {
      where: {
        id: {
          [Op.in]: transactionIds
        }
      }
    });
    
    // Get the updated transactions with their categories
    const updatedTransactions = await Transaction.findAll({
      where: {
        id: {
          [Op.in]: transactionIds
        }
      },
      include: [
        { model: Category, as: 'category' },
        { model: Category, as: 'subcategory', required: false }
      ]
    });
    
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
    const { Transaction } = getModels();
    const transaction = await Transaction.findByPk(req.params.id);
    
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
    const { Transaction } = getModels();
    const transaction = await Transaction.findByPk(req.params.id);
    
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
    const { Transaction, Category } = getModels();
    
    const transactions = await Transaction.findAll({
      where: {
        categoryId: null
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon'],
          required: false
        },
        {
          model: Category,
          as: 'subcategory',
          attributes: ['id', 'name', 'color', 'icon'],
          required: false
        }
      ],
      order: [['date', 'DESC']]
    });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get upload statistics (unique source file names, account types, etc.)
router.get('/upload-stats', async (req, res) => {
  try {
    const { Transaction } = getModels();
    
    // Get all transactions
    const transactions = await Transaction.findAll();
    
    // Get unique source files
    const uploadedFiles = {};
    transactions.forEach(t => {
      // Use importSource instead of sourceFileName
      if (t.importSource && !uploadedFiles[t.importSource]) {
        uploadedFiles[t.importSource] = {
          fileName: t.importSource,
          fileType: t.importSource.split('.').pop().toLowerCase(),
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
      
      if (t.importSource) {
        const fileStats = uploadedFiles[t.importSource];
        fileStats.count++;
        
        if (t.account) fileStats.accounts.add(t.account);
        else if (t.merchant) fileStats.accounts.add(t.merchant);
        
        if (t.accountType) fileStats.accountTypes.add(t.accountType);
        else if (t.source) fileStats.accountTypes.add(t.source);
        
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
          fileStats.income += Number(t.amount);
        } else {
          fileStats.expense += Number(t.amount);
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
      // Use account if available, otherwise use merchant
      const accountName = t.account || t.merchant;
      
      if (accountName) {
        if (!accounts[accountName]) {
          accounts[accountName] = {
            name: accountName,
            type: t.accountType || t.source || 'unknown',
            transactionCount: 0,
            income: 0,
            expense: 0,
            tags: new Set()
          };
        }
        
        accounts[accountName].transactionCount++;
        
        // Add transaction tags to account tags
        if (t.tags && Array.isArray(t.tags)) {
          t.tags.forEach(tag => accounts[accountName].tags.add(tag));
        }
        
        if (t.type === 'income') {
          accounts[accountName].income += Number(t.amount);
        } else {
          accounts[accountName].expense += Number(t.amount);
        }
      }
    });
    
    const accountStats = Object.values(accounts).map(account => ({
      ...account,
      tags: Array.from(account.tags || []),
      balance: account.income - account.expense
    }));
    
    // Overall stats
    const totalTransactions = transactions.length;
    const categorizedTransactions = transactions.filter(t => t.categoryId).length;
    const totalIncome = transactions.filter(t => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    
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