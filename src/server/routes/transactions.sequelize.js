const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB } = require('../db/sequelize');
const FileParser = require('../services/fileParser');
const categorySuggestionService = require('../services/categorySuggestion');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Organize transactions into logical batches based on various criteria
 * @param {Array} transactions - Array of transactions to organize
 * @returns {Array} Array of transaction batches
 */
function organizeIntoBatches(transactions) {
  // First try to group by source and transactionType
  const sourceGroups = {};
  
  // Group transactions by source
  transactions.forEach(transaction => {
    const source = transaction.source || 'Unknown';
    if (!sourceGroups[source]) {
      sourceGroups[source] = [];
    }
    sourceGroups[source].push(transaction);
  });
  
  // Split large groups into smaller batches
  const maxBatchSize = 50; // Max transactions per batch
  const batches = [];
  
  Object.keys(sourceGroups).forEach(source => {
    const sourceTransactions = sourceGroups[source];
    
    // Further split by type if the source group is large
    if (sourceTransactions.length > maxBatchSize) {
      const typeGroups = {};
      
      // Group by transaction type
      sourceTransactions.forEach(transaction => {
        const type = transaction.type || 'unknown';
        if (!typeGroups[type]) {
          typeGroups[type] = [];
        }
        typeGroups[type].push(transaction);
      });
      
      // Add each type group as a batch or split further if needed
      Object.keys(typeGroups).forEach(type => {
        const typeTransactions = typeGroups[type];
        
        // If still too large, split by date ranges
        if (typeTransactions.length > maxBatchSize) {
          // Sort by date for chronological batches
          typeTransactions.sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
          });
          
          // Split into batches of maxBatchSize
          for (let i = 0; i < typeTransactions.length; i += maxBatchSize) {
            batches.push(typeTransactions.slice(i, i + maxBatchSize));
          }
        } else {
          batches.push(typeTransactions);
        }
      });
    } else {
      // Small enough to be a single batch
      batches.push(sourceTransactions);
    }
  });
  
  return batches;
}

/**
 * Calculate statistics for a batch of transactions
 * @param {Array} transactions - Array of transactions
 * @returns {Object} Statistics object
 */
function calculateBatchStatistics(transactions) {
  const incomeTransactions = transactions.filter(t => t.type === 'income');
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalExpense = expenseTransactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  
  // Find date range
  let minDate = null;
  let maxDate = null;
  
  if (transactions.length > 0) {
    const dates = transactions.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
    if (dates.length > 0) {
      minDate = new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
      maxDate = new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
    }
  }
  
  // Find unique sources
  const sources = [...new Set(transactions.map(t => t.source).filter(Boolean))];
  
  // Count transactions with/without categories
  const categorizedCount = transactions.filter(t => t.categoryId).length;
  const uncategorizedCount = transactions.filter(t => !t.categoryId).length;
  
  // Calculate net amount (positive value for income dominance, for consistency in UI display)
  const netDifference = totalIncome - totalExpense;
  
  return {
    totalTransactions: transactions.length,
    incomeTransactions: incomeTransactions.length,
    expenseTransactions: expenseTransactions.length,
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    netAmount: Math.abs(netDifference),
    netDirection: netDifference >= 0 ? 'positive' : 'negative',
    dateRange: {
      from: minDate,
      to: maxDate
    },
    sources,
    categorization: {
      categorized: categorizedCount,
      uncategorized: uncategorizedCount,
      percent: transactions.length ? Math.round((categorizedCount / transactions.length) * 100) : 0
    }
  };
}

/**
 * Calculate total statistics across multiple batches
 * @param {Array} batchResults - Array of batch result objects
 * @returns {Object} Aggregated statistics
 */
function calculateTotalStatistics(batchResults) {
  const allTransactions = batchResults.flatMap(batch => batch.transactions);
  return calculateBatchStatistics(allTransactions);
}

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
    const enrichMode = req.body.enrichMode === 'true'; // Whether to use the new enrichment flow
    
    console.log(`Parsing file with extension: ${fileExtension}, enrichMode: ${enrichMode}`);
    
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
    
    // Generate an upload ID for enrichment flow tracking
    const uploadId = `upload_${Date.now()}`;
    
    // If enrichment mode is enabled, we organize transactions into batches
    if (enrichMode) {
      // Group transactions by similar attributes (like source, type, date range)
      const batches = organizeIntoBatches(processedTransactions);
      
      // Store batches with pending status
      const batchResults = [];
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // Save batch metadata
        const batchId = `${uploadId}_batch_${i}`;
        batch.forEach(transaction => {
          transaction.batchId = batchId;
          transaction.uploadId = uploadId;
          transaction.enrichmentStatus = 'pending';
        });
        
        // Save this batch of transactions
        const savedBatch = await Transaction.bulkCreate(batch, {
          returning: true
        });
        
        // Calculate batch statistics
        const batchStatistics = calculateBatchStatistics(savedBatch);
        
        batchResults.push({
          batchId,
          transactions: savedBatch,
          statistics: batchStatistics
        });
      }
      
      // Return the upload ID and batches
      return res.status(201).json({
        message: `Successfully prepared ${processedTransactions.length} transactions for enrichment`,
        uploadId,
        enrichmentMode: true,
        batches: batchResults.map(batch => ({
          batchId: batch.batchId,
          transactionCount: batch.transactions.length,
          statistics: batch.statistics
        })),
        statistics: calculateTotalStatistics(batchResults)
      });
    }
    
    // Traditional (non-enrichment) flow: save all transactions directly
    const savedTransactions = await Transaction.bulkCreate(processedTransactions, {
      returning: true
    });
    
    // Calculate some statistics
    const statistics = calculateBatchStatistics(savedTransactions);
    
    res.status(201).json({
      message: `Successfully imported ${savedTransactions.length} transactions`,
      fileType: fileExtension,
      fileName: fileName,
      dateRange: statistics.dateRange,
      statistics,
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

// Get all batches for a specific upload
router.get('/batches/:uploadId', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const { uploadId } = req.params;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }
    
    // Get all transactions for this upload, grouped by batch
    const transactions = await Transaction.findAll({
      where: {
        uploadId: uploadId
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon'],
          required: false
        }
      ],
      order: [['date', 'DESC']]
    });
    
    // Group transactions by batchId
    const batchMap = {};
    transactions.forEach(transaction => {
      const batchId = transaction.batchId;
      if (!batchId) return;
      
      if (!batchMap[batchId]) {
        batchMap[batchId] = [];
      }
      batchMap[batchId].push(transaction);
    });
    
    // Convert to array of batches with statistics
    const batches = Object.keys(batchMap).map(batchId => {
      const batchTransactions = batchMap[batchId];
      return {
        batchId,
        transactions: batchTransactions,
        statistics: calculateBatchStatistics(batchTransactions),
        status: batchTransactions[0]?.enrichmentStatus || 'pending'
      };
    });
    
    res.json({
      uploadId,
      batches,
      statistics: calculateTotalStatistics(batches.map(b => ({ transactions: b.transactions })))
    });
  } catch (error) {
    console.error('Error getting batches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch enrichment endpoint - update multiple transactions in a batch
router.put('/batches/:batchId/enrich', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const { batchId } = req.params;
    const enrichData = req.body;
    
    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }
    
    // Verify the batch exists
    const batchTransactions = await Transaction.findAll({
      where: {
        batchId: batchId
      }
    });
    
    if (batchTransactions.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    // Prepare update data
    const updateData = {};
    
    // Only update fields that are provided in the request
    if (enrichData.categoryId) {
      updateData.categoryId = enrichData.categoryId;
    }
    
    if (enrichData.subcategoryId) {
      updateData.subcategoryId = enrichData.subcategoryId;
    }
    
    if (enrichData.tags) {
      updateData.tags = Array.isArray(enrichData.tags) ? enrichData.tags : [enrichData.tags];
    }
    
    if (enrichData.notes) {
      updateData.notes = enrichData.notes;
    }
    
    if (enrichData.accountType) {
      updateData.accountType = enrichData.accountType;
    }
    
    if (enrichData.source) {
      updateData.source = enrichData.source;
    }
    
    if (enrichData.account) {
      updateData.account = enrichData.account;
    }
    
    // Update enrichment status
    updateData.enrichmentStatus = 'enriched';
    
    // Update all transactions in the batch
    await Transaction.update(updateData, {
      where: {
        batchId: batchId
      }
    });
    
    // Get the updated transactions
    const updatedTransactions = await Transaction.findAll({
      where: {
        batchId: batchId
      },
      include: [
        { model: Category, as: 'category' },
        { model: Category, as: 'subcategory', required: false }
      ],
      order: [['date', 'DESC']]
    });
    
    res.json({
      message: `Enriched ${updatedTransactions.length} transactions`,
      batchId,
      transactions: updatedTransactions,
      statistics: calculateBatchStatistics(updatedTransactions)
    });
  } catch (error) {
    console.error('Error enriching batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete a batch (mark as processed)
router.post('/batches/:batchId/complete', async (req, res) => {
  try {
    const { Transaction } = getModels();
    const { batchId } = req.params;
    
    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }
    
    // Update the enrichment status for all transactions in the batch
    await Transaction.update(
      { enrichmentStatus: 'completed' },
      {
        where: {
          batchId: batchId
        }
      }
    );
    
    // Get the updated transactions
    const updatedTransactions = await Transaction.findAll({
      where: {
        batchId: batchId
      }
    });
    
    res.json({
      message: `Completed batch with ${updatedTransactions.length} transactions`,
      batchId,
      status: 'completed'
    });
  } catch (error) {
    console.error('Error completing batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete an entire upload (mark all batches as processed)
router.post('/upload/:uploadId/complete', async (req, res) => {
  try {
    const { Transaction } = getModels();
    const { uploadId } = req.params;
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }
    
    // Update all transactions for this upload
    await Transaction.update(
      { enrichmentStatus: 'completed' },
      {
        where: {
          uploadId: uploadId
        }
      }
    );
    
    // Get the updated transactions
    const transactions = await Transaction.findAll({
      where: {
        uploadId: uploadId
      }
    });
    
    // Get unique batch IDs
    const batchIds = [...new Set(transactions.map(t => t.batchId).filter(Boolean))];
    
    res.json({
      message: `Completed upload with ${transactions.length} transactions across ${batchIds.length} batches`,
      uploadId,
      batchIds,
      status: 'completed'
    });
  } catch (error) {
    console.error('Error completing upload:', error);
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