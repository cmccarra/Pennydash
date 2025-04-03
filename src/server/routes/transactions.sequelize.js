const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB, getModels } = require('../db/sequelize');
const FileParser = require('../services/fileParser');
const categorySuggestionService = require('../services/categorySuggestion');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

/**
 * Organize transactions into logical batches based on various criteria
 * @param {Array} transactions - Array of transactions to organize
 * @returns {Array} Array of transaction batches
 */
/**
 * Organize transactions into logical batches based on various criteria
 * @param {Array} transactions - Array of transactions to organize
 * @returns {Array} Array of transaction batches with metadata
 */
// Import the improved batch organization logic from our service module
const batchOrganization = require('../services/batchOrganization');
const { organizeIntoBatches, findCommonWords, getDateRange, getFormattedDateRange } = batchOrganization;

// Legacy function kept for reference, but not used
function _organizeIntoBatchesOld(transactions) {
  const natural = require('natural');
  const maxBatchSize = 50; // Max transactions per batch
  const batches = [];
  const processedTransactions = new Set();
  
  // Helper function to normalize description for pattern matching
  const normalizeText = (text) => {
    if (!text) return '';
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Replace multiple spaces with single space
      .trim();
  };
  
  // Extract merchant name from description where possible
  const extractMerchant = (description) => {
    if (!description) return null;
    
    // Common patterns for merchant names in transaction descriptions
    const merchantPatterns = [
      // Credit card format with location: "MERCHANT NAME      CITY"
      /^([A-Z0-9\s]{3,}?)\s{2,}[A-Z\s]+$/,
      // Format with numbers and dates at end: "MERCHANT NAME 123456 03/15"
      /^([A-Z0-9\s]{3,}?)\s+\d+\s+\d+\/\d+$/,
      // Generic merchant at start of description
      /^([A-Z0-9\s&]{3,}?)(?:\s+-|\s{2,}|\d{4,}|$)/
    ];
    
    for (const pattern of merchantPatterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Fallback to first 3 words
    return description.split(/\s+/).slice(0, 3).join(' ');
  };
  
  // STEP 1: Group by exact merchant matches where available
  const merchantGroups = {};
  
  transactions.forEach(transaction => {
    // Skip transactions with missing description
    if (!transaction.description) return;
    
    // Use merchant if available, otherwise try to extract from description
    const merchant = transaction.merchant || extractMerchant(transaction.description);
    
    if (merchant) {
      if (!merchantGroups[merchant]) {
        merchantGroups[merchant] = [];
      }
      merchantGroups[merchant].push(transaction);
      processedTransactions.add(transaction.id);
    }
  });
  
  // Add merchant groups as batches
  Object.keys(merchantGroups).forEach(merchant => {
    const merchantTransactions = merchantGroups[merchant];
    
    // If merchant group is too large, split by type and date
    if (merchantTransactions.length > maxBatchSize) {
      // Split by transaction type
      const typeGroups = {
        income: merchantTransactions.filter(t => t.type === 'income'),
        expense: merchantTransactions.filter(t => t.type === 'expense')
      };
      
      Object.keys(typeGroups).forEach(type => {
        const typeTransactions = typeGroups[type];
        if (typeTransactions.length === 0) return;
        
        // If still too large, split by date
        if (typeTransactions.length > maxBatchSize) {
          // Sort by date
          typeTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
          
          // Split into batches of maxBatchSize
          for (let i = 0; i < typeTransactions.length; i += maxBatchSize) {
            const batch = typeTransactions.slice(i, i + maxBatchSize);
            const dateRange = getDateRange(batch);
            batches.push({
              transactions: batch,
              metadata: {
                source: 'merchant_type_date',
                merchant,
                type,
                dateRange,
                summary: `${merchant} ${type} transactions (${dateRange.from} to ${dateRange.to})`
              }
            });
          }
        } else {
          batches.push({
            transactions: typeTransactions,
            metadata: {
              source: 'merchant_type',
              merchant,
              type,
              summary: `${merchant} ${type} transactions`
            }
          });
        }
      });
    } else {
      batches.push({
        transactions: merchantTransactions,
        metadata: {
          source: 'merchant',
          merchant,
          summary: `Transactions from ${merchant}`
        }
      });
    }
  });
  
  // STEP 2: Group remaining transactions by description pattern similarity
  const remainingTransactions = transactions.filter(t => !processedTransactions.has(t.id));
  
  if (remainingTransactions.length > 0) {
    // Create groups of similar descriptions
    const descriptionGroups = [];
    
    remainingTransactions.forEach(transaction => {
      if (!transaction.description) return;
      
      const normalizedDesc = normalizeText(transaction.description);
      
      // Try to find a matching group
      let foundGroup = false;
      
      for (const group of descriptionGroups) {
        const sampleDesc = normalizeText(group[0].description);
        
        // Use Jaro-Winkler string similarity (good for common prefixes)
        const similarity = natural.JaroWinklerDistance(normalizedDesc, sampleDesc);
        
        if (similarity > 0.85) { // High similarity threshold
          group.push(transaction);
          processedTransactions.add(transaction.id);
          foundGroup = true;
          break;
        }
      }
      
      // If no similar group found, create a new one
      if (!foundGroup) {
        descriptionGroups.push([transaction]);
        processedTransactions.add(transaction.id);
      }
    });
    
    // Add description similarity groups as batches
    descriptionGroups.forEach(group => {
      // Find common words in descriptions for the summary
      const descriptions = group.map(t => t.description || '');
      const commonWords = findCommonWords(descriptions);
      const summaryText = commonWords.length > 0 
        ? `Transactions related to ${commonWords.join(' ')}`
        : `Similar transactions (${group.length})`;
      
      if (group.length > maxBatchSize) {
        // Split by date if too large
        group.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        for (let i = 0; i < group.length; i += maxBatchSize) {
          const batch = group.slice(i, i + maxBatchSize);
          const dateRange = getDateRange(batch);
          batches.push({
            transactions: batch,
            metadata: {
              source: 'similar_description_date',
              commonWords,
              dateRange,
              summary: `${summaryText} (${dateRange.from} to ${dateRange.to})`
            }
          });
        }
      } else {
        batches.push({
          transactions: group,
          metadata: {
            source: 'similar_description',
            commonWords,
            summary: summaryText
          }
        });
      }
    });
  }
  
  // STEP 3: Group any remaining transactions by source and type
  const finalRemainingTransactions = transactions.filter(t => !processedTransactions.has(t.id));
  
  if (finalRemainingTransactions.length > 0) {
    const sourceGroups = {};
    
    // Group by source
    finalRemainingTransactions.forEach(transaction => {
      const source = transaction.source || 'Unknown';
      if (!sourceGroups[source]) {
        sourceGroups[source] = [];
      }
      sourceGroups[source].push(transaction);
    });
    
    // Process source groups
    Object.keys(sourceGroups).forEach(source => {
      const sourceTransactions = sourceGroups[source];
      
      if (sourceTransactions.length > maxBatchSize) {
        // Split by type
        const typeGroups = {
          income: sourceTransactions.filter(t => t.type === 'income'),
          expense: sourceTransactions.filter(t => t.type === 'expense')
        };
        
        Object.keys(typeGroups).forEach(type => {
          const typeTransactions = typeGroups[type];
          if (typeTransactions.length === 0) return;
          
          if (typeTransactions.length > maxBatchSize) {
            // Sort by date and split into batches
            typeTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            for (let i = 0; i < typeTransactions.length; i += maxBatchSize) {
              const batch = typeTransactions.slice(i, i + maxBatchSize);
              const dateRange = getDateRange(batch);
              batches.push({
                transactions: batch,
                metadata: {
                  source: 'source_type_date',
                  sourceType: source,
                  type,
                  dateRange,
                  summary: `${source} ${type} transactions (${dateRange.from} to ${dateRange.to})`
                }
              });
            }
          } else {
            batches.push({
              transactions: typeTransactions,
              metadata: {
                source: 'source_type',
                sourceType: source,
                type,
                summary: `${source} ${type} transactions`
              }
            });
          }
        });
      } else {
        batches.push({
          transactions: sourceTransactions,
          metadata: {
            source: 'source',
            sourceType: source,
            summary: `Transactions from ${source}`
          }
        });
      }
    });
  }
  
  return batches;
}

// NOTE: getDateRange and findCommonWords functions are now imported from batchOrganization service

/**
 * Calculate statistics for a batch of transactions
 * @param {Array} transactions - Array of transactions
 * @returns {Object} Statistics object
 */
function calculateBatchStatistics(transactions) {
  console.log(`Calculating batch statistics for ${transactions.length} transactions`);
  
  // Handle edge case of empty array
  if (!transactions || transactions.length === 0) {
    return {
      totalTransactions: 0,
      incomeTransactions: 0,
      expenseTransactions: 0,
      totalIncome: 0,
      totalExpense: 0,
      netAmount: 0,
      netDirection: 'neutral',
      dateRange: { from: null, to: null },
      sources: [],
      categorization: {
        categorized: 0,
        uncategorized: 0,
        percentage: 0
      }
    };
  }
  
  // Make sure transaction types are properly defined
  const incomeTransactions = transactions.filter(t => t.type === 'income');
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  
  console.log(`Found ${incomeTransactions.length} income and ${expenseTransactions.length} expense transactions`);
  
  // Safely calculate totals with error handling
  let totalIncome = 0;
  try {
    totalIncome = incomeTransactions.reduce((sum, t) => {
      const amount = Number(t.amount || 0);
      return isNaN(amount) ? sum : sum + amount;
    }, 0);
  } catch (err) {
    console.error('Error calculating total income:', err);
  }
  
  let totalExpense = 0;
  try {
    totalExpense = expenseTransactions.reduce((sum, t) => {
      const amount = Number(t.amount || 0);
      return isNaN(amount) ? sum : sum + amount;
    }, 0);
  } catch (err) {
    console.error('Error calculating total expense:', err);
  }
  
  // Find date range with careful error handling
  let minDate = null;
  let maxDate = null;
  
  try {
    const validDates = transactions
      .map(t => {
        try {
          const d = new Date(t.date);
          return isNaN(d.getTime()) ? null : d;
        } catch (e) {
          console.log(`Invalid date format in transaction: ${t.id} - ${t.date}`);
          return null;
        }
      })
      .filter(Boolean);
    
    if (validDates.length > 0) {
      minDate = new Date(Math.min(...validDates.map(d => d.getTime()))).toISOString().split('T')[0];
      maxDate = new Date(Math.max(...validDates.map(d => d.getTime()))).toISOString().split('T')[0];
    }
  } catch (err) {
    console.error('Error processing date range:', err);
  }
  
  // Find unique sources
  const sources = [...new Set(transactions.map(t => t.source).filter(Boolean))];
  
  // Count transactions with/without categories
  const categorizedCount = transactions.filter(t => t.categoryId).length;
  const uncategorizedCount = transactions.filter(t => !t.categoryId).length;
  
  // Calculate net amount
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
/**
 * Optimized version of calculateBatchStatistics for large transaction sets
 * Uses sampling for expensive operations but calculates core metrics accurately
 * @param {Array} transactions - Array of transaction objects
 * @returns {Object} Statistics object with totals, date ranges, etc.
 */
function calculateBatchStatisticsOptimized(transactions) {
  console.log(`Using optimized batch statistics for ${transactions.length} transactions`);
  
  // Handle edge case of empty array
  if (!transactions || transactions.length === 0) {
    return {
      totalTransactions: 0,
      incomeTransactions: 0,
      expenseTransactions: 0,
      totalIncome: 0,
      totalExpense: 0,
      netAmount: 0,
      netDirection: 'neutral',
      dateRange: { from: null, to: null },
      sources: [],
      categorization: {
        categorized: 0,
        uncategorized: 0,
        percentage: 0
      },
      isOptimized: true
    };
  }
  
  // Take a sample of transactions for expensive operations
  const sampleSize = Math.min(200, transactions.length);
  const sample = transactions.slice(0, sampleSize);
  
  // Count by type - use the full dataset for accuracy on these core metrics
  const incomeTransactions = transactions.filter(t => t.type === 'income');
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  
  // Calculate amounts
  let totalIncome = incomeTransactions.reduce((sum, t) => {
    const amount = parseFloat(t.amount) || 0;
    return sum + amount;
  }, 0);
  
  let totalExpense = expenseTransactions.reduce((sum, t) => {
    const amount = parseFloat(t.amount) || 0;
    return sum + amount;
  }, 0);
  
  // Calculate net amounts
  const netAmount = totalIncome - totalExpense;
  const netDirection = netAmount > 0 ? 'positive' : (netAmount < 0 ? 'negative' : 'neutral');
  
  // Calculate date range using the full dataset
  const dates = transactions
    .map(t => new Date(t.date))
    .filter(d => !isNaN(d.getTime()));
  
  let dateRange = {
    from: null,
    to: null
  };
  
  if (dates.length > 0) {
    dateRange.from = new Date(Math.min(...dates.map(d => d.getTime())));
    dateRange.to = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Format dates
    dateRange.from = dateRange.from.toISOString().split('T')[0];
    dateRange.to = dateRange.to.toISOString().split('T')[0];
  }
  
  // Calculate sources using the sample for performance
  const sourceMap = {};
  sample.forEach(t => {
    const source = t.source || t.accountType || 'Unknown';
    if (!sourceMap[source]) {
      sourceMap[source] = 0;
    }
    sourceMap[source]++;
  });
  
  const sources = Object.keys(sourceMap).map(key => ({
    name: key,
    count: sourceMap[key],
    percentage: Math.round((sourceMap[key] / sample.length) * 100)
  }));
  
  // Calculate categorization data using the sample
  const categorized = sample.filter(t => t.categoryId != null).length;
  const categorization = {
    categorized,
    uncategorized: sample.length - categorized,
    percentage: Math.round((categorized / sample.length) * 100)
  };
  
  // Return statistics
  return {
    totalTransactions: transactions.length,
    incomeTransactions: incomeTransactions.length,
    expenseTransactions: expenseTransactions.length,
    totalIncome,
    totalExpense,
    netAmount,
    netDirection,
    dateRange,
    sources,
    categorization,
    isOptimized: true
  };
}

function calculateTotalStatistics(batchResults) {
  console.log(`Calculating total statistics for ${batchResults.length} batches`);
  
  // Combine all transactions
  const allTransactions = batchResults.flatMap(batch => batch.transactions);
  console.log(`Total of ${allTransactions.length} transactions across all batches`);
  
  // Use optimized function for large transaction sets
  if (allTransactions.length > 500) {
    console.log(`Using optimized statistics calculation for large dataset (${allTransactions.length} transactions)`);
    return calculateBatchStatisticsOptimized(allTransactions);
  }
  
  // Use standard calculation for smaller sets
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

// Note: getModels is already imported at the top of the file

// Get transactions by upload ID
router.get('/by-upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const limit = parseInt(req.query.limit || '10');
    const { Transaction } = getModels();
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }
    
    const transactions = await Transaction.findAll({
      where: { uploadId },
      limit,
      order: [['createdAt', 'DESC']]
    });
    
    res.json(transactions);
  } catch (error) {
    console.error('Error getting transactions by upload ID:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    
    // Enhance transactions with suggestionConfidence (copy from categoryConfidence)
    const enhancedTransactions = transactions.map(tx => {
      const txJson = tx.toJSON();
      // Use categoryConfidence as suggestionConfidence if available, otherwise generate a random value for testing
      if (txJson.categoryConfidence !== undefined && txJson.categoryConfidence !== null) {
        txJson.suggestionConfidence = txJson.categoryConfidence;
      } else if (txJson.needsReview === false) {
        // If needsReview is false but no confidence score, assume high confidence
        txJson.suggestionConfidence = 0.9;
      } else if (txJson.needsReview === true) {
        // If needsReview is true but no confidence score, assume low confidence
        txJson.suggestionConfidence = 0.4;
      } else {
        // Default value when nothing is available
        txJson.suggestionConfidence = 0.5;
      }
      return txJson;
    });
    
    res.json(enhancedTransactions);
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
    
    // Add suggestionConfidence field
    const txJson = transaction.toJSON();
    if (txJson.categoryConfidence !== undefined && txJson.categoryConfidence !== null) {
      txJson.suggestionConfidence = txJson.categoryConfidence;
    } else if (txJson.needsReview === false) {
      // If needsReview is false but no confidence score, assume high confidence
      txJson.suggestionConfidence = 0.9;
    } else if (txJson.needsReview === true) {
      // If needsReview is true but no confidence score, assume low confidence
      txJson.suggestionConfidence = 0.4;
    } else {
      // Default value when nothing is available
      txJson.suggestionConfidence = 0.5;
    }
    
    res.json(txJson);
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
    console.log(`Upload request received: ${JSON.stringify({
      body: req.body,
      file: req.file ? { 
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size
      } : null
    })}`);
    
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
      
      // If we're explicitly setting a credit card account type, make sure transaction types are correct
      if (accountTypeEnum === 'credit_card' || updatedTransaction.accountType === 'credit_card') {
        updatedTransaction.accountType = 'credit_card';
        
        // For credit cards, determine if we need to adjust the transaction type
        const description = (updatedTransaction.description || '').toLowerCase();
        const isPayment = description.includes('payment') && 
                         (description.includes('received') || 
                          description.includes('thank you'));
        const isRefund = description.includes('refund') || 
                        description.includes('credit') || 
                        description.includes('return');
                        
        // For credit cards:
        // - Regular charges (positive amounts) should be expenses 
        // - Payments to the card and refunds should be income
        const originalType = updatedTransaction.type;
        
        if (isPayment || isRefund) {
          updatedTransaction.type = 'income';
        } else {
          updatedTransaction.type = 'expense';
        }
        
        console.log(`CREDIT CARD TRANSACTION: "${updatedTransaction.description}" | Original type: ${originalType} | New type: ${updatedTransaction.type} | Amount: ${updatedTransaction.amount} | Is Payment: ${isPayment} | Is Refund: ${isRefund}`);
      } else if (accountTypeEnum) {
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
        // Handle both legacy format (array of transactions) and new format (object with transactions and metadata)
        const batchTransactions = Array.isArray(batch) ? batch : batch.transactions;
        const batchMetadata = Array.isArray(batch) ? {} : batch.metadata || {};
        
        // Save batch metadata with detailed logging
        const batchId = `${uploadId}_batch_${i}`;
        console.log(`Creating batch ${batchId} with ${batchTransactions.length} transactions`);
        
        batchTransactions.forEach(transaction => {
          // Make sure we're explicitly setting these values to avoid null/undefined
          transaction.batchId = batchId;
          transaction.uploadId = uploadId;
          transaction.enrichmentStatus = 'pending';
          
          // Add batch metadata if available
          if (batchMetadata.summary) {
            transaction.batchSummary = batchMetadata.summary;
          }
          if (batchMetadata.source) {
            transaction.batchSource = batchMetadata.source;
          }
          
          // Validate required fields
          if (!transaction.description) {
            transaction.description = 'No description';
          }
          
          if (!transaction.amount && transaction.amount !== 0) {
            console.log(`⚠️ [WARNING] Transaction missing amount, defaulting to 0: ${transaction.description}`);
            transaction.amount = 0;
          }
          
          if (!transaction.date) {
            console.log(`⚠️ [WARNING] Transaction missing date, defaulting to today: ${transaction.description}`);
            transaction.date = new Date();
          }
        });
        
        // Save this batch of transactions
        const savedBatch = await Transaction.bulkCreate(batchTransactions, {
          returning: true
        });
        
        // Calculate batch statistics (use optimized function for large batches)
        let batchStatistics;
        if (savedBatch.length > 200) {
          console.log(`[POST /uploads/${uploadId}/batches] - Using optimized statistics for large batch (${savedBatch.length} transactions)`);
          batchStatistics = calculateBatchStatisticsOptimized(savedBatch);
        } else {
          batchStatistics = calculateBatchStatistics(savedBatch);
        }
        
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
    
    // Calculate some statistics (optimized for large transaction sets)
    let statistics;
    if (savedTransactions.length > 200) {
      console.log(`[POST /transactions/upload] - Using optimized statistics for large dataset (${savedTransactions.length} transactions)`);
      statistics = calculateBatchStatisticsOptimized(savedTransactions);
    } else {
      statistics = calculateBatchStatistics(savedTransactions);
    }
    
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
      
      // If we're explicitly setting a credit card account type, make sure transaction types are correct
      if (req.body.accountTypeEnum === 'credit_card' || updatedTransaction.accountType === 'credit_card') {
        updatedTransaction.accountType = 'credit_card';
        
        // For credit cards, determine if we need to adjust the transaction type
        const description = (updatedTransaction.description || '').toLowerCase();
        const isPayment = description.includes('payment') && 
                         (description.includes('received') || 
                          description.includes('thank you'));
        const isRefund = description.includes('refund') || 
                        description.includes('credit') || 
                        description.includes('return');
                        
        // For credit cards:
        // - Regular charges (positive amounts) should be expenses 
        // - Payments to the card and refunds should be income
        const originalType = updatedTransaction.type;
        
        if (isPayment || isRefund) {
          updatedTransaction.type = 'income';
        } else {
          updatedTransaction.type = 'expense';
        }
        
        console.log(`CREDIT CARD TRANSACTION: "${updatedTransaction.description}" | Original type: ${originalType} | New type: ${updatedTransaction.type} | Amount: ${updatedTransaction.amount} | Is Payment: ${isPayment} | Is Refund: ${isRefund}`);
      } else if (req.body.accountTypeEnum) {
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
    const { Transaction, Category } = getModels();
    const transaction = await Transaction.findByPk(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Get confidence threshold from query params (default to 0.7)
    const confidenceThreshold = parseFloat(req.query.threshold) || 0.7;
    
    // Force using OpenAI if requested (useful for testing or manual categorization)
    const forceOpenAI = req.query.useOpenAI === 'true' || req.query.forceOpenAI === 'true';
    
    console.log(`[Suggest Category] Transaction: ${transaction.id}, Description: "${transaction.description}", Amount: ${transaction.amount}`);
    console.log(`[Suggest Category] Using threshold: ${confidenceThreshold}, Force OpenAI: ${forceOpenAI}`);
    
    if (forceOpenAI) {
      categorySuggestionService.useOpenAI = true; // Temporarily force OpenAI
    }
    
    // Pass more transaction data to the suggestion service
    const suggestion = await categorySuggestionService.suggestCategory(
      transaction.description,
      transaction.amount,
      transaction.type || 'expense'
    );
    
    // Reset the flag if we temporarily forced it
    if (forceOpenAI && !process.env.OPENAI_API_KEY) {
      categorySuggestionService.useOpenAI = false;
    }
    
    // Add needsReview flag based on confidence threshold
    const needsReview = suggestion.confidence < confidenceThreshold;
    
    // If we have a categoryId, include the full category details
    let category = null;
    if (suggestion.categoryId) {
      category = await Category.findByPk(suggestion.categoryId);
    }
    
    // Log the suggestion result
    console.log(`[Suggest Category] Result: Source=${suggestion.suggestionSource}, Confidence=${suggestion.confidence}, CategoryId=${suggestion.categoryId}, NeedsReview=${needsReview}`);
    
    res.json({
      ...suggestion,
      category,
      needsReview,
      autoApply: !needsReview, // If confidence is high enough, recommend auto-applying
      suggestionConfidence: suggestion.confidence, // Include both forms for backward compatibility
      categoryConfidence: suggestion.confidence
    });
  } catch (error) {
    console.error('[Suggest Category] Error:', error);
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

// Get transactions that need review (based on confidence score)
router.get('/filter/needs-review', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    
    // Get confidence threshold from query params (default to 0.7)
    const confidenceThreshold = parseFloat(req.query.threshold) || 0.7;
    const limit = parseInt(req.query.limit) || 100;
    
    // Find transactions that need review
    const transactions = await Transaction.findAll({
      where: {
        [Op.or]: [
          // Either explicitly marked as needing review
          { needsReview: true },
          // Or has low confidence score
          { 
            categoryConfidence: {
              [Op.lt]: confidenceThreshold
            }
          },
          // Or has no confidence score but has a category (older transactions)
          {
            [Op.and]: [
              { categoryConfidence: null },
              { categoryId: { [Op.not]: null } }
            ]
          }
        ]
      },
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon', 'type'],
          required: false
        }
      ],
      order: [
        // Sort by confidence (lowest first), then date
        ['categoryConfidence', 'ASC'],
        ['date', 'DESC']
      ],
      limit
    });
    
    // Format the response with confidence information
    const formattedTransactions = transactions.map(t => {
      const tx = t.toJSON();
      tx.reviewReason = t.needsReview ? 'needs_review' : 
                        (!t.categoryConfidence ? 'no_confidence_score' : 'low_confidence');
      return tx;
    });
    
    res.json({
      transactions: formattedTransactions,
      count: formattedTransactions.length,
      confidenceThreshold
    });
  } catch (error) {
    console.error('Error getting transactions that need review:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions by upload ID
router.get('/by-upload/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const limit = parseInt(req.query.limit || '10');
    const { Transaction } = getModels();
    
    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }
    
    console.log(`[GET /by-upload/${uploadId}] - Fetching transactions for upload with limit ${limit}`);
    
    const transactions = await Transaction.findAll({
      where: { uploadId },
      limit,
      order: [['createdAt', 'DESC']]
    });
    
    console.log(`[GET /by-upload/${uploadId}] - Found ${transactions.length} transactions`);
    
    res.json(transactions);
  } catch (error) {
    console.error('Error getting transactions by upload ID:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all batches for a specific upload with enhanced timeout, error handling, and batch summaries
router.get('/uploads/:uploadId/batches', async (req, res) => {
  try {
    console.log(`[GET /uploads/${req.params.uploadId}/batches] - Fetching batches for upload`);
    
    const { Transaction, Category } = getModels();
    const { uploadId } = req.params;
    
    if (!uploadId) {
      console.log('⚠️ [ERROR] Upload ID is missing in request');
      return res.status(400).json({ 
        error: 'Upload ID is required',
        details: 'The upload ID is missing in the URL path. Please ensure the uploadId is provided.'
      });
    }
    
    // Validate uploadId format (should start with 'upload_' followed by numbers)
    if (!uploadId.match(/^upload_\d+$/)) {
      console.log(`⚠️ [ERROR] Invalid upload ID format: ${uploadId}`);
      return res.status(400).json({
        error: 'Invalid upload ID format',
        details: 'Upload ID should follow the format "upload_" followed by numbers.'
      });
    }
    
    console.log(`[GET /uploads/${uploadId}/batches] - Finding transactions with this uploadId`);
    
    // Set a timeout for database operations to prevent hanging
    const dbOperationPromise = Transaction.findAll({
      where: { uploadId: uploadId },
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
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database operation timed out')), 10000);
    });
    
    // Use Promise.race to implement the timeout
    let transactions;
    try {
      transactions = await Promise.race([dbOperationPromise, timeoutPromise]);
    } catch (timeoutError) {
      console.error(`⚠️ [ERROR] Database operation timed out: ${timeoutError.message}`);
      return res.status(408).json({
        error: 'Database operation timed out',
        message: 'The server took too long to fetch the transactions. Please try again.',
        timeout: true
      });
    }
    
    // Instead of fetching all transactions at once, we'll use pagination to retrieve them in batches
    // This helps prevent timeouts by processing data in smaller chunks
    const PAGE_SIZE = 100; 
    const QUERY_TIMEOUT = 15000; // 15 seconds timeout per page query
    
    // Function to fetch transactions in pages
    async function fetchTransactionPages() {
      let offset = 0;
      let allTransactions = [];
      let hasMore = true;
      
      while (hasMore) {
        console.log(`[GET /uploads/${uploadId}/batches] - Fetching page of transactions (offset: ${offset}, limit: ${PAGE_SIZE})`);
        
        // Create a promise that will reject after the timeout period for this page
        const pageTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            console.log(`⚠️ [WARNING] Page query timeout triggered after ${QUERY_TIMEOUT/1000} seconds`);
            reject(new Error(`Page query timed out after ${QUERY_TIMEOUT/1000} seconds.`));
          }, QUERY_TIMEOUT);
        });
        
        // Create the database query promise for this page
        const pageQueryPromise = Transaction.findAll({
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
          order: [['date', 'DESC']],
          limit: PAGE_SIZE,
          offset: offset,
          // Set ORM-level optimizations
          lock: false,  // Avoid DB locks that could contribute to timeout issues
          skipLocked: true // Skip rows that are locked
        });
        
        try {
          // Race the page query against the timeout
          const pageResults = await Promise.race([pageQueryPromise, pageTimeoutPromise]);
          
          // Add the results to our collection
          allTransactions = allTransactions.concat(pageResults);
          console.log(`[GET /uploads/${uploadId}/batches] - Retrieved ${pageResults.length} transactions (total so far: ${allTransactions.length})`);
          
          // Check if we've reached the end
          if (pageResults.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            // Move to the next page
            offset += PAGE_SIZE;
          }
        } catch (error) {
          console.error(`Error fetching transaction page:`, error);
          // Stop fetching on error
          hasMore = false;
          
          // If we already have some transactions, we'll continue with those
          // instead of failing completely
          if (allTransactions.length > 0) {
            console.log(`[GET /uploads/${uploadId}/batches] - Continuing with ${allTransactions.length} transactions retrieved before error`);
          } else {
            // If we have no transactions at all, rethrow the error
            throw error;
          }
        }
      }
      
      return allTransactions;
    }
    
    // Fetch all transactions using pagination
    transactions = await fetchTransactionPages();
    
    console.log(`[GET /uploads/${uploadId}/batches] - Found ${transactions.length} transactions`);
    
    // Return early if no transactions found to avoid further processing
    if (transactions.length === 0) {
      console.log(`⚠️ [WARNING] No transactions found for upload ID: ${uploadId}`);
      return res.json({
        batches: [],
        statistics: { 
          totalTransactions: 0,
          netAmount: 0,
          netDirection: 'neutral',
          sources: []
        }
      });
    }
    
    // Check account type directly from request body or from the first transaction
    console.log(`[GET /uploads/${uploadId}/batches] - Account type in request: ${req.body?.accountTypeEnum}`);
    
    // Special handling for credit card transactions - update transaction types if needed
    if (transactions.length > 0 && transactions[0].accountType === 'credit_card') {
      console.log(`[GET /uploads/${uploadId}/batches] - Processing credit card transactions...`);
      console.log(`[GET /uploads/${uploadId}/batches] - Transaction account type: ${transactions[0].accountType}`);
      
      // Correct the transaction types for credit card transactions
      for (const transaction of transactions) {
        const description = transaction.description.toLowerCase();
        const originalType = transaction.type;
        
        // Payment detection
        const isPayment = description.includes('payment') && 
                         (description.includes('received') || 
                          description.includes('thank you'));
                          
        // Refund detection
        const isRefund = description.includes('refund') || 
                        description.includes('credit') || 
                        description.includes('return');
        
        // For credit cards, regular purchases should be expenses, not income
        // But keep payments to the card as income
        let correctType;
        if (isPayment || isRefund) {
          correctType = 'income';
        } else {
          correctType = 'expense';
        }
        
        // Update transaction type if needed
        if (transaction.type !== correctType) {
          console.log(`[GET /uploads/${uploadId}/batches] - Correcting transaction type: "${transaction.description}" | ${originalType} -> ${correctType}`);
          transaction.type = correctType;
          await transaction.save();
        }
      }
    } else {
      console.log(`[GET /uploads/${uploadId}/batches] - Not processing as credit card transactions. Account type: ${transactions.length > 0 ? transactions[0].accountType : 'unknown'}`);
    }
    
    // Log the unique batch IDs to see if transactions are properly batched
    const uniqueBatchIds = [...new Set(transactions.map(t => t.batchId).filter(Boolean))];
    console.log(`[GET /uploads/${uploadId}/batches] - Unique batch IDs: ${JSON.stringify(uniqueBatchIds)}`);
    
    // Ensure that transactions have up-to-date data from database
    // Since we're already using paginated fetching, we don't need to refresh every transaction
    // We can simply use the transactions we already fetched
    console.log(`[GET /uploads/${uploadId}/batches] - Using already fetched transactions without additional refresh`);
    
    // Skip the individual transaction refresh to improve performance
    const refreshedTransactions = transactions;
    
    console.log(`[GET /uploads/${uploadId}/batches] - Refreshed ${refreshedTransactions.length} transactions from database`);
    
    // Log a few sample transactions to verify types
    console.log(`[GET /uploads/${uploadId}/batches] - Sample transaction types after refresh:`);
    refreshedTransactions.slice(0, 5).forEach(tx => {
      console.log(`  "${tx.description}" | Type: ${tx.type} | AccountType: ${tx.accountType}`);
    });
    
    // Group transactions by batchId
    const batchMap = {};
    let transactionsWithoutBatch = 0;
    
    refreshedTransactions.forEach(transaction => {
      const batchId = transaction.batchId;
      
      // Log transactions without batches and try to recover
      if (!batchId) {
        transactionsWithoutBatch++;
        console.log(`⚠️ [WARNING] Transaction without batchId: ${transaction.id} - ${transaction.description}`);
        
        // Try to recover using various strategies
        if (transaction.uploadId) {
          // Determine if this transaction fits with a merchant-based batch
          let foundMatchingBatch = false;
          
          // Extract merchant if available
          const merchant = transaction.merchant || 
                          (transaction.description ? transaction.description.split(' ')[0] : null);
          
          // Try to find existing batches for this merchant
          if (merchant) {
            // Look through existing batches to see if there's a merchant match
            Object.entries(batchMap).forEach(([existingBatchId, batchTransactions]) => {
              if (batchTransactions.length > 0) {
                const batchMerchant = batchTransactions[0].merchant || 
                                     (batchTransactions[0].description ? batchTransactions[0].description.split(' ')[0] : null);
                
                // If merchants match and transaction types match, use this batch
                if (batchMerchant && 
                    batchMerchant.toLowerCase() === merchant.toLowerCase() && 
                    batchTransactions[0].type === transaction.type) {
                  console.log(`🔄 [RECOVERY] Adding transaction to existing merchant batch: ${existingBatchId} for transaction ${transaction.id}`);
                  batchMap[existingBatchId].push(transaction);
                  foundMatchingBatch = true;
                  
                  // Also update the transaction's batchId in memory and in the database
                  transaction.batchId = existingBatchId;
                  
                  // Save the updated batchId to the database
                  (async () => {
                    try {
                      await Transaction.update(
                        { batchId: existingBatchId },
                        { where: { id: transaction.id } }
                      );
                      console.log(`✅ [RECOVERY] Updated batchId in database for transaction ${transaction.id}`);
                    } catch (err) {
                      console.error(`❌ [ERROR] Failed to update batchId in database for transaction ${transaction.id}:`, err);
                    }
                  })();
                  
                  return;
                }
              }
            });
          }
          
          // If we couldn't find a matching batch, create a new one based on type
          if (!foundMatchingBatch) {
            const transactionType = transaction.type || 'unknown';
            const recoveredBatchId = `${transaction.uploadId}_batch_recovered_${transactionType}_${Date.now().toString().slice(-4)}`;
            console.log(`🔄 [RECOVERY] Creating new recovered batch ID: ${recoveredBatchId} for transaction ${transaction.id}`);
            
            if (!batchMap[recoveredBatchId]) {
              batchMap[recoveredBatchId] = [];
            }
            batchMap[recoveredBatchId].push(transaction);
            
            // Update the transaction's batchId in memory and in the database
            transaction.batchId = recoveredBatchId;
            
            // Save the updated batchId to the database
            (async () => {
              try {
                await Transaction.update(
                  { batchId: recoveredBatchId },
                  { where: { id: transaction.id } }
                );
                console.log(`✅ [RECOVERY] Updated batchId in database for transaction ${transaction.id}`);
              } catch (err) {
                console.error(`❌ [ERROR] Failed to update batchId in database for transaction ${transaction.id}:`, err);
              }
            })();
          }
        } else {
          console.log(`❌ [ERROR] Cannot recover transaction ${transaction.id} - missing uploadId`);
        }
        return;
      }
      
      if (!batchMap[batchId]) {
        batchMap[batchId] = [];
      }
      batchMap[batchId].push(transaction);
    });
    
    // Log diagnostic information
    if (transactionsWithoutBatch > 0) {
      console.log(`⚠️ [WARNING] Found ${transactionsWithoutBatch} transactions without batch IDs`);
    }
    
    // Process any unbatched transactions (those with transactionsWithoutBatch > 0)
    if (transactionsWithoutBatch > 0) {
      console.log(`[GET /uploads/${uploadId}/batches] - Organizing ${transactionsWithoutBatch} unbatched transactions into logical batches`);
      
      // Get all transactions that still don't have a batch ID
      const unbatchedTransactions = refreshedTransactions.filter(tx => !tx.batchId);
      
      if (unbatchedTransactions.length > 0) {
        console.log(`[GET /uploads/${uploadId}/batches] - Found ${unbatchedTransactions.length} transactions without batch IDs after recovery attempt`);
        
        // Use the improved batch organization service for better grouping
        // We already imported batchOrganization at the top of the file
        
        // Use our sophisticated organizeIntoBatches function to create logical groupings
        const newBatches = organizeIntoBatches(unbatchedTransactions);
        console.log(`[GET /uploads/${uploadId}/batches] - Created ${newBatches.length} new batches from unbatched transactions`);
        
        // Process each batch - add to batchMap and update transaction batchId
        for (let i = 0; i < newBatches.length; i++) {
          const newBatch = newBatches[i];
          const batchId = `${uploadId}_auto_batch_${Date.now()}_${i}`;
          const batchTransactions = newBatch.transactions;
          const batchMetadata = newBatch.metadata;
          
          console.log(`[GET /uploads/${uploadId}/batches] - Processing new batch: ${batchId} with ${batchTransactions.length} transactions`);
          console.log(`[GET /uploads/${uploadId}/batches] - Batch summary: ${batchMetadata.summary}`);
          
          // Add to batch map
          batchMap[batchId] = batchTransactions;
          
          // Update transaction batchIds in memory and database
          for (const tx of batchTransactions) {
            tx.batchId = batchId;
            tx.metadata = batchMetadata; // Store batch metadata on transaction
            
            // Update database (don't wait for completion)
            (async () => {
              try {
                await Transaction.update(
                  { 
                    batchId: batchId,
                    // Store key batch metadata fields as separate columns
                    batchSummary: batchMetadata.summary,
                    batchSource: batchMetadata.source
                  },
                  { where: { id: tx.id } }
                );
              } catch (err) {
                console.error(`❌ [ERROR] Failed to update batchId in database for transaction ${tx.id}:`, err);
              }
            })();
          }
        }
      }
    }
    
    // Convert to array of batches with statistics
    console.log(`[GET /uploads/${uploadId}/batches] - Processing ${Object.keys(batchMap).length} batches`);
    
    // Convert map to array of batches for the response
    console.log(`[GET /uploads/${uploadId}/batches] - Creating batch objects for ${Object.keys(batchMap).length} batches`);
    const batches = [];
    
    // Process each batch
    // Use map with Promise.all for async processing
    const batchPromises = Object.keys(batchMap).map(async (batchId) => {
      const batchTransactions = batchMap[batchId];
      console.log(`[GET /uploads/${uploadId}/batches] - Processing batch ${batchId} with ${batchTransactions.length} transactions`);
      
      // Take a sample transaction for debugging
      const sampleTx = batchTransactions[0];
      if (sampleTx) {
        console.log(`[GET /uploads/${uploadId}/batches] - Sample transaction: ${sampleTx.id} - ${sampleTx.description}`);
      }
      
      try {
        // Calculate statistics
        let batchStats;
        
        try {
          // Use optimized statistics for large batches
          if (batchTransactions.length > 200) {
            console.log(`Using optimized statistics for large batch ${batchId} (${batchTransactions.length} transactions)`);
            batchStats = calculateBatchStatisticsOptimized(batchTransactions);
          } else {
            batchStats = calculateBatchStatistics(batchTransactions);
          }
        } catch (statsError) {
          console.error(`Error calculating batch statistics for ${batchId}:`, statsError);
          // Provide fallback statistics
          batchStats = {
            totalTransactions: batchTransactions.length,
            incomeTransactions: 0,
            expenseTransactions: 0,
            netAmount: 0,
            error: statsError.message
          };
        }
        
        // Get batch summary with enhanced OpenAI integration and timeout handling
        console.log(`[GET /uploads/${uploadId}/batches] - Generating summary for batch ${batchId}`);
        const summaryPromise = generateBatchSummaryWithOpenAI(batchTransactions, 15000); // 15-second timeout
        const timeoutPromise = new Promise(resolve => {
          setTimeout(() => {
            console.log(`[GET /uploads/${uploadId}/batches] - Batch summary timeout for ${batchId}, using fallback`);
            resolve(generateBatchSummary(batchTransactions));
          }, 15000);
        });
        
        // Race the OpenAI summary against our timeout with fallback
        const summaryInfo = await Promise.race([summaryPromise, timeoutPromise]) || await generateBatchSummary(batchTransactions);
        console.log(`[GET /uploads/${uploadId}/batches] - Generated summary for batch ${batchId}: ${summaryInfo.summary.substring(0, 50)}...`);
        
        // Get category suggestions for the batch
        let suggestedCategory = null;
        let suggestedCategoryId = null;
        let suggestedCategoryConfidence = 0;
        
        try {
          // Check if any transactions already have a category
          const categorizedTransactions = batchTransactions.filter(t => t.categoryId);
          if (categorizedTransactions.length > 0) {
            // Use the most common category
            const categoryCounts = {};
            categorizedTransactions.forEach(t => {
              categoryCounts[t.categoryId] = (categoryCounts[t.categoryId] || 0) + 1;
            });
            
            const mostCommonCategory = Object.entries(categoryCounts)
              .sort((a, b) => b[1] - a[1])[0];
            
            if (mostCommonCategory) {
              suggestedCategoryId = mostCommonCategory[0];
              suggestedCategoryConfidence = 0.9; // High confidence for existing categories
              
              // Get category details
              try {
                suggestedCategory = await Category.findByPk(suggestedCategoryId);
              } catch (err) {
                console.error(`Error finding category ${suggestedCategoryId}:`, err);
              }
            }
          } 
          // If no transactions have categories, use category suggestion service
          else if (batchTransactions.length > 0) {
            // Use the first transaction to get a suggestion
            const firstTransaction = batchTransactions[0];
            const suggestion = await categorySuggestionService.suggestCategory(
              firstTransaction.description,
              firstTransaction.amount,
              firstTransaction.type
            );
            
            if (suggestion && suggestion.categoryId) {
              suggestedCategoryId = suggestion.categoryId;
              suggestedCategoryConfidence = suggestion.confidence;
              
              // Get category details
              try {
                suggestedCategory = await Category.findByPk(suggestedCategoryId);
              } catch (err) {
                console.error(`Error finding category ${suggestedCategoryId}:`, err);
              }
            }
          }
        } catch (suggestionError) {
          console.error(`Error getting category suggestion for batch ${batchId}:`, suggestionError);
        }
        
        // Create a batch object with the calculated data and enhanced AI insights
        const batchObject = {
          batchId,
          title: summaryInfo.summary,
          transactions: batchTransactions,
          statistics: batchStats,
          status: batchTransactions[0]?.enrichmentStatus || 'pending',
          summary: summaryInfo.summary,
          // Include AI-generated insights if available
          insights: summaryInfo.insights || [],
          // Add summary source information if available
          summarySource: summaryInfo.source || 'auto',
          // Record if there was a timeout during summary generation
          summaryTimedOut: summaryInfo.timedOut || false,
          suggestedCategory: suggestedCategory ? {
            id: suggestedCategory.id,
            name: suggestedCategory.name,
            color: suggestedCategory.color,
            icon: suggestedCategory.icon,
            type: suggestedCategory.type
          } : null,
          suggestedCategoryId,
          suggestedCategoryConfidence
        };
        
        // Add to batches array
        batches.push(batchObject);
      } catch (statError) {
        console.error(`Error calculating statistics for batch ${batchId}:`, statError);
        // In case of error, still try to provide a helpful title
        let errorTitle = `Batch ${batchId.split('_').pop()}`;
        
        try {
          // Basic title based on first transaction if available
          if (batchTransactions && batchTransactions.length > 0) {
            const sampleTx = batchTransactions[0];
            
            if (sampleTx.description) {
              errorTitle = `${sampleTx.description.substring(0, 20)}${sampleTx.description.length > 20 ? '...' : ''}`;
              if (sampleTx.date) {
                const txDate = new Date(sampleTx.date);
                if (!isNaN(txDate.getTime())) {
                  errorTitle += ` (${txDate.toISOString().split('T')[0]})`;
                }
              }
            }
          }
        } catch (titleError) {
          console.error(`Error generating fallback title:`, titleError);
        }
        
        // Create an enhanced error batch object with better error information
        const errorBatchObject = {
          batchId,
          title: errorTitle,
          transactions: batchTransactions,
          statistics: {
            totalTransactions: batchTransactions.length,
            error: statError.message,
            errorType: statError.name || 'UnknownError',
            errorTimestamp: new Date().toISOString()
          },
          status: 'error',
          // Include fallback summary in case of error
          summary: `Batch with ${batchTransactions.length} transaction(s)`,
          insights: [`Error processing batch: ${statError.message}`],
          summarySource: 'error-fallback',
          summaryTimedOut: false
        };
        
        // Add to batches array
        batches.push(errorBatchObject);
      }
    });
    
    // Wait for all batch processing to complete
    await Promise.all(batchPromises);
    
    console.log(`[GET /uploads/${uploadId}/batches] - Created ${batches.length} batches`);
    
    // Calculate overall statistics
    let totalStats;
    try {
      totalStats = calculateTotalStatistics(batches.map(b => ({ transactions: b.transactions })));
      console.log(`[GET /uploads/${uploadId}/batches] - Calculated total statistics`);
    } catch (statError) {
      console.error(`Error calculating total statistics:`, statError);
      totalStats = { 
        error: statError.message,
        totalTransactions: transactions.length
      };
    }
    
    const response = {
      uploadId,
      batches,
      statistics: totalStats
    };
    
    console.log(`[GET /uploads/${uploadId}/batches] - Sending response with ${batches.length} batches`);
    res.json(response);
  } catch (error) {
    console.error('Error getting batches:', error);
    
    // Check the type of error for better handling
    let errorCategory = 'unknown';
    let statusCode = 500;
    let errorMessage = `Error fetching batches: ${error.message}`;
    let recoveryHint = null;
    
    // Check if this is a timeout error
    const isTimeout = error.message && (
      error.message.includes('timed out') || 
      error.message.includes('timeout')
    );
    
    if (isTimeout) {
      errorCategory = 'timeout';
      statusCode = 408; // Request Timeout
      errorMessage = `Database operation timed out: ${error.message}`;
      recoveryHint = "Try refreshing with fewer transactions at a time or contact support for help with large datasets.";
    } 
    // Check if this is a database connection error
    else if (error.name === 'SequelizeConnectionError' || 
             error.message.includes('connection') || 
             error.message.includes('connect')) {
      errorCategory = 'connection';
      statusCode = 503; // Service Unavailable
      errorMessage = `Database connection issue: ${error.message}`;
      recoveryHint = "Please try again in a few moments. The database may be temporarily unavailable.";
    }
    // Check if this is a query/syntax error
    else if (error.name === 'SequelizeDatabaseError' || error.name === 'Error') {
      errorCategory = 'query';
      statusCode = 400; // Bad Request
      errorMessage = `Database query error: ${error.message}`;
      recoveryHint = "There may be an issue with the transaction data. Try refreshing or contact support.";
    }
    
    // Log detailed error information for server logs
    console.error(`[ERROR] ${errorCategory.toUpperCase()} ERROR in /uploads/${req.params.uploadId}/batches:`, {
      message: error.message,
      name: error.name,
      stack: error.stack,
      category: errorCategory,
      statusCode
    });
    
    // Return detailed error response to the client
    res.status(statusCode).json({ 
      error: errorMessage,
      errorType: errorCategory,
      isTimeout: isTimeout,
      timeoutType: isTimeout ? 'database_operation' : undefined,
      recoveryHint: recoveryHint,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Get transaction batches that need enrichment (uncategorized or low confidence)
router.get('/batches/needs-enrichment', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    
    // Check if we should also return batches that just need review (low confidence)
    const includeReviewNeeded = req.query.includeReviewNeeded === 'true';
    const confidenceThreshold = parseFloat(req.query.confidenceThreshold) || 0.7;
    
    // Build query conditions
    let whereCondition = {
      enrichmentStatus: { [Op.ne]: 'completed' }
    };
    
    // If we're not including review-needed batches, only get uncategorized
    if (!includeReviewNeeded) {
      whereCondition.categoryId = null;
    } else {
      // Include uncategorized OR review-needed
      whereCondition = {
        [Op.and]: [
          { enrichmentStatus: { [Op.ne]: 'completed' } },
          {
            [Op.or]: [
              { categoryId: null },
              { needsReview: true },
              { categoryConfidence: { [Op.lt]: confidenceThreshold } }
            ]
          }
        ]
      };
    }
    
    console.log(`[GET /batches/needs-enrichment] - Getting batches that need enrichment. includeReviewNeeded: ${includeReviewNeeded}`);
    
    const transactions = await Transaction.findAll({
      where: whereCondition,
      include: [
        {
          model: Category,
          as: 'category',
          required: false
        }
      ],
      order: [['date', 'DESC']]
    });
    
    console.log(`[GET /batches/needs-enrichment] - Found ${transactions.length} transactions that need enrichment`);
    
    // Group transactions by batchId
    const batchMap = {};
    
    transactions.forEach(transaction => {
      const batchId = transaction.batchId;
      
      if (!batchId) {
        console.log(`[GET /batches/needs-enrichment] - Warning: Transaction ${transaction.id} has no batchId`);
        return;
      }
      
      if (!batchMap[batchId]) {
        batchMap[batchId] = [];
      }
      
      batchMap[batchId].push(transaction);
    });
    
    // Convert to array of batches with statistics
    const batches = Object.keys(batchMap).map(batchId => {
      try {
        const batchTransactions = batchMap[batchId];
        
        // Use optimized statistics for large batches
        let batchStats;
        if (batchTransactions.length > 200) {
          console.log(`[GET /batches/needs-enrichment] - Using optimized statistics for large batch ${batchId} (${batchTransactions.length} transactions)`);
          batchStats = calculateBatchStatisticsOptimized(batchTransactions);
        } else {
          batchStats = calculateBatchStatistics(batchTransactions);
        }
        
        // Determine the status based on the transactions
        let batchStatus = 'needs_enrichment';
        let needsReview = false;
        let hasLowConfidence = false;
        
        // Check if this batch just needs review
        if (batchTransactions.every(tx => tx.categoryId !== null)) {
          if (batchTransactions.some(tx => tx.needsReview === true)) {
            batchStatus = 'needs_review';
            needsReview = true;
          } else if (batchTransactions.some(tx => tx.categoryConfidence && tx.categoryConfidence < confidenceThreshold)) {
            batchStatus = 'low_confidence';
            hasLowConfidence = true;
          }
        }
        
        // Calculate average confidence score if applicable
        let avgConfidence = null;
        if (batchTransactions.some(tx => tx.categoryConfidence !== null && tx.categoryConfidence !== undefined)) {
          const scores = batchTransactions
            .filter(tx => tx.categoryConfidence !== null && tx.categoryConfidence !== undefined)
            .map(tx => tx.categoryConfidence);
          
          if (scores.length > 0) {
            avgConfidence = scores.reduce((sum, score) => sum + score, 0) / scores.length;
          }
        }
        
        // Generate batch title/summary if not already present
        let batchTitle = '';
        const sampleTx = batchTransactions[0];
        
        // Try to get the title from transaction metadata or generate from batch characteristics
        if (sampleTx.metadata && sampleTx.metadata.summary) {
          // Use metadata from our organizeIntoBatches function
          batchTitle = sampleTx.metadata.summary;
        } else if (sampleTx.batchSummary) {
          // Use stored batch summary from database
          batchTitle = sampleTx.batchSummary;
        } else {
          // Generate a basic summary based on the transactions
          const descriptions = batchTransactions.map(t => t.description || '');
          const commonWords = findCommonWords(descriptions);
          const dateRange = getDateRange(batchTransactions);
          
          if (commonWords.length > 0) {
            batchTitle = `Transactions related to ${commonWords.join(' ')}`;
            if (dateRange.from !== 'unknown') {
              batchTitle += ` (${dateRange.from} to ${dateRange.to})`;
            }
          } else if (batchTransactions.length === 1) {
            // Single transaction batch
            batchTitle = `${sampleTx.description || 'Unknown'} (${sampleTx.date || 'unknown date'})`;
          } else {
            // Multiple transactions without common words
            const type = sampleTx.type || 'unknown';
            if (dateRange.from !== 'unknown') {
              batchTitle = `${type.charAt(0).toUpperCase() + type.slice(1)} transactions (${dateRange.from} to ${dateRange.to})`;
            } else {
              batchTitle = `${type.charAt(0).toUpperCase() + type.slice(1)} transactions (${batchTransactions.length})`;
            }
          }
        }
        
        return {
          batchId,
          title: batchTitle,
          transactions: batchTransactions,
          statistics: batchStats,
          status: batchStatus,
          needsReview,
          hasLowConfidence,
          confidenceThreshold,
          avgConfidence
        };
      } catch (error) {
        console.error(`[GET /batches/needs-enrichment] - Error calculating batch stats for ${batchId}:`, error);
        // In case of error, still try to provide a helpful title
        let errorTitle = `Batch ${batchId.split('_').pop()}`;
        
        try {
          // Basic title based on first transaction if available
          const transactions = batchMap[batchId];
          if (transactions && transactions.length > 0) {
            const sampleTx = transactions[0];
            
            if (sampleTx.description) {
              errorTitle = `${sampleTx.description.substring(0, 20)}${sampleTx.description.length > 20 ? '...' : ''}`;
              if (sampleTx.date) {
                const txDate = new Date(sampleTx.date);
                if (!isNaN(txDate.getTime())) {
                  errorTitle += ` (${txDate.toISOString().split('T')[0]})`;
                }
              }
            }
          }
        } catch (titleError) {
          console.error(`Error generating fallback title:`, titleError);
        }
        
        return {
          batchId,
          title: errorTitle,
          transactions: batchMap[batchId],
          statistics: { 
            error: error.message,
            totalTransactions: batchMap[batchId].length
          },
          status: 'error'
        };
      }
    });
    
    console.log(`[GET /batches/needs-enrichment] - Returning ${batches.length} batches that need enrichment`);
    
    // Add confidence information to the response
    res.json({
      batches,
      includeReviewNeeded,
      confidenceThreshold,
      count: batches.length
    });
  } catch (error) {
    console.error('[GET /batches/needs-enrichment] - Error getting batches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Batch enrichment endpoint - update multiple transactions in a batch
router.put('/batches/:batchId/enrich', async (req, res) => {
  const { batchId } = req.params;
  try {
    console.log(`⚡ [PUT /batches/${batchId}/enrich] - Starting batch enrichment process`);
    
    const { Transaction, Category } = getModels();
    const enrichData = req.body;
    
    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }
    
    // Set a timeout for the entire operation
    const operationTimeout = 30000; // 30 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), operationTimeout);
    });
    
    // Verify the batch exists with a timeout
    let batchTransactions = [];
    try {
      const findBatchPromise = Transaction.findAll({
        where: { batchId: batchId },
        limit: 1000 // Add limit to prevent excessive loading
      });
      
      batchTransactions = await Promise.race([
        findBatchPromise,
        new Promise((_, reject) => setTimeout(() => 
          reject(new Error('Batch verification timed out')), 5000))
      ]);
      
      console.log(`🔍 [PUT /batches/${batchId}/enrich] - Found ${batchTransactions.length} transactions in batch`);
      
      if (batchTransactions.length === 0) {
        return res.status(404).json({ error: 'Batch not found' });
      }
    } catch (findError) {
      console.error(`⚠️ [PUT /batches/${batchId}/enrich] - Error finding batch:`, findError);
      
      if (findError.message === 'Batch verification timed out') {
        return res.status(408).json({
          error: 'Timed out while verifying batch existence',
          batchId: batchId,
          timeoutType: 'verification'
        });
      }
      
      return res.status(500).json({ 
        error: `Error finding batch: ${findError.message}`,
        batchId: batchId 
      });
    }
    
    // Check if we should generate AI category suggestions for this batch
    if (enrichData.generateSuggestions) {
      console.log(`🧠 [PUT /batches/${batchId}/enrich] - Generating AI category suggestions for batch`);
      
      // Get confidence threshold from request or use default
      const confidenceThreshold = parseFloat(enrichData.confidenceThreshold) || 0.7;
      
      try {
        // Generate suggestions with a timeout
        const suggestionPromise = categorySuggestionService.suggestCategoriesForBatch(
          batchTransactions, 
          confidenceThreshold
        );
        
        // Use a specific timeout for AI suggestion generation, which might take longer
        const suggestionResult = await Promise.race([
          suggestionPromise,
          new Promise((_, reject) => setTimeout(() => 
            reject(new Error('Category suggestion generation timed out')), 15000))
        ]);
        
        console.log(`✓ [PUT /batches/${batchId}/enrich] - Generated suggestions with avg confidence: ${suggestionResult.averageConfidence}`);
        
        // If we have a suggested category with high confidence, auto-apply it
        if (suggestionResult.batchCategoryId && !suggestionResult.needsReview) {
          console.log(`🔄 [PUT /batches/${batchId}/enrich] - Auto-applying category ${suggestionResult.batchCategoryId} with high confidence`);
          
          // Add the suggested category to the enrichment data
          enrichData.categoryId = suggestionResult.batchCategoryId;
          enrichData.autoApplied = true;
          enrichData.aiSuggested = true;
          enrichData.confidence = suggestionResult.averageConfidence;
          
          // Also add detailed suggestions to response
          enrichData.suggestions = suggestionResult;
          
          // Update individual transactions with a timeout
          try {
            const updatePromises = suggestionResult.suggestions.map(suggestion => {
              if (suggestion.transactionId) {
                return Transaction.update({
                  suggestedCategoryId: suggestion.categoryId,
                  categoryConfidence: suggestion.confidence,
                  suggestionApplied: suggestion.confidence >= confidenceThreshold,
                  needsReview: suggestion.confidence < confidenceThreshold
                }, {
                  where: { id: suggestion.transactionId }
                });
              }
              return Promise.resolve();
            });
            
            // Use Promise.all with a timeout
            await Promise.race([
              Promise.all(updatePromises),
              new Promise((_, reject) => setTimeout(() => 
                reject(new Error('Individual updates timed out')), 10000))
            ]);
            
            console.log(`✓ [PUT /batches/${batchId}/enrich] - Updated individual transaction suggestions`);
          } catch (updateError) {
            console.warn(`⚠️ [PUT /batches/${batchId}/enrich] - Individual update error:`, updateError.message);
            // Continue despite this error
          }
        } else {
          console.log(`🔍 [PUT /batches/${batchId}/enrich] - Suggestions require manual review (confidence: ${suggestionResult.averageConfidence})`);
          enrichData.aiSuggestions = suggestionResult.topCategories;
          enrichData.needsReview = true;
          
          // Update individual transactions with a timeout
          try {
            const updatePromises = suggestionResult.suggestions.map(suggestion => {
              if (suggestion.transactionId) {
                return Transaction.update({
                  suggestedCategoryId: suggestion.categoryId,
                  categoryConfidence: suggestion.confidence,
                  suggestionApplied: false,
                  needsReview: true
                }, {
                  where: { id: suggestion.transactionId }
                });
              }
              return Promise.resolve();
            });
            
            // Use Promise.all with a timeout
            await Promise.race([
              Promise.all(updatePromises),
              new Promise((_, reject) => setTimeout(() => 
                reject(new Error('Individual reviews updates timed out')), 10000))
            ]);
            
            console.log(`✓ [PUT /batches/${batchId}/enrich] - Updated individual transaction review flags`);
          } catch (updateError) {
            console.warn(`⚠️ [PUT /batches/${batchId}/enrich] - Individual update error:`, updateError.message);
            // Continue despite this error
          }
        }
      } catch (suggestionError) {
        console.error(`⚠️ [PUT /batches/${batchId}/enrich] - Error generating suggestions:`, suggestionError);
        
        // If it's a timeout error, return a specific response
        if (suggestionError.message === 'Category suggestion generation timed out') {
          return res.status(408).json({
            error: 'Timed out while generating category suggestions',
            batchId: batchId,
            timeoutType: 'suggestions',
            partial: true // Indicate partial processing
          });
        }
        
        // Otherwise, log and continue with the update
      }
    }
    
    // Prepare update data
    const updateData = {};
    
    // Only update fields that are provided in the request
    if (enrichData.categoryId) {
      updateData.categoryId = enrichData.categoryId;
      
      // If we have confidence information, store it
      if (typeof enrichData.confidence === 'number') {
        updateData.categoryConfidence = enrichData.confidence;
        updateData.needsReview = enrichData.confidence < 0.7; // Default threshold
      } else {
        // If manually selected, set high confidence
        updateData.categoryConfidence = 1.0;
        updateData.needsReview = false;
      }
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
    
    console.log(`🔄 [PUT /batches/${batchId}/enrich] - Updating transactions with data:`, JSON.stringify(updateData));
    
    // Update all transactions in the batch with a timeout
    let updateCount = 0;
    try {
      const updatePromise = Transaction.update(updateData, {
        where: { batchId: batchId }
      });
      
      const updateResult = await Promise.race([
        updatePromise,
        new Promise((_, reject) => setTimeout(() => 
          reject(new Error('Batch update timed out')), 10000))
      ]);
      
      updateCount = updateResult[0];
      console.log(`✓ [PUT /batches/${batchId}/enrich] - Updated ${updateCount} transactions`);
      
      if (updateCount === 0) {
        console.warn(`⚠️ [PUT /batches/${batchId}/enrich] - No transactions were updated, possible batch ID issue`);
        
        // Double-check if batch exists but update failed for some reason
        const checkBatch = await Transaction.findAll({
          attributes: ['id', 'batchId'],
          where: { batchId: batchId },
          limit: 1
        });
        
        if (checkBatch.length === 0) {
          console.error(`⚠️ [PUT /batches/${batchId}/enrich] - Batch ID ${batchId} not found after initial check`);
          return res.status(404).json({
            error: `Batch ID ${batchId} not found in the database`
          });
        }
      }
    } catch (updateError) {
      console.error(`⚠️ [PUT /batches/${batchId}/enrich] - Error updating batch:`, updateError);
      
      if (updateError.message === 'Batch update timed out') {
        return res.status(408).json({
          error: 'Timed out while updating batch transactions',
          batchId: batchId,
          timeoutType: 'batch_update',
          partial: true
        });
      }
      
      // For other errors, continue to try to return some data
    }
    
    // Get the updated transactions with full category data, with a timeout
    let updatedTransactions = [];
    try {
      const findUpdatedPromise = Transaction.findAll({
        where: { batchId: batchId },
        include: [
          { model: Category, as: 'category' },
          { model: Category, as: 'subcategory', required: false }
        ],
        order: [['date', 'DESC']]
      });
      
      updatedTransactions = await Promise.race([
        findUpdatedPromise,
        new Promise((_, reject) => setTimeout(() => 
          reject(new Error('Finding updated transactions timed out')), 8000))
      ]);
      
      console.log(`✓ [PUT /batches/${batchId}/enrich] - Retrieved ${updatedTransactions.length} updated transactions`);
    } catch (findError) {
      console.error(`⚠️ [PUT /batches/${batchId}/enrich] - Error retrieving updated transactions:`, findError);
      
      if (findError.message === 'Finding updated transactions timed out') {
        // If we can't get updated transactions, return a simplified response with just the update count
        return res.json({
          success: true,
          message: `Enriched ${updateCount} transactions (retrieval timed out)`,
          batchId,
          partial: true,
          timedOut: true,
          updateCount
        });
      }
      
      // For other errors, try to return a meaningful response with minimal data
      return res.json({
        success: true,
        message: `Batch enriched but detailed information unavailable`,
        batchId,
        error: findError.message,
        updateCount
      });
    }
    
    // Calculate statistics for the batch (optimized for large datasets)
    let statistics;
    if (updatedTransactions.length > 200) {
      console.log(`[PUT /batches/${batchId}/enrich] - Using optimized statistics for large batch (${updatedTransactions.length} transactions)`);
      statistics = calculateBatchStatisticsOptimized(updatedTransactions);
    } else {
      statistics = calculateBatchStatistics(updatedTransactions);
    }
    
    // Build the response with enrichment data
    const response = {
      success: true,
      message: `Enriched ${updatedTransactions.length} transactions`,
      batchId,
      transactions: updatedTransactions,
      statistics: statistics
    };
    
    // Include AI suggestion information if available
    if (enrichData.suggestions) {
      response.aiSuggestions = enrichData.suggestions;
      response.autoApplied = enrichData.autoApplied;
      response.confidence = enrichData.confidence;
    } else if (enrichData.aiSuggestions) {
      response.aiSuggestions = enrichData.aiSuggestions;
      response.needsReview = enrichData.needsReview;
    }
    
    console.log(`✓ [PUT /batches/${batchId}/enrich] - Successfully completed batch enrichment`);
    res.json(response);
  } catch (error) {
    console.error(`❌ [PUT /batches/${batchId}/enrich] - Error enriching batch:`, error);
    res.status(500).json({ 
      success: false,
      error: `Failed to enrich batch: ${error.message}`,
      batchId
    });
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

// Get files associated with an upload
router.get('/uploads/:uploadId/files', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { Transaction } = getModels();
    
    // Find unique files associated with this upload
    const transactions = await Transaction.findAll({
      where: {
        uploadId: uploadId
      },
      attributes: ['importSource'],
      group: ['importSource']
    });
    
    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: 'No files found for this upload' });
    }
    
    // Extract file names and generate file IDs
    const files = transactions.map(transaction => {
      const fileName = transaction.importSource;
      return {
        fileId: uuidv4(), // Generate a unique ID for each file
        fileName: fileName,
        accountSource: '',
        accountType: ''
      };
    });
    
    res.status(200).json(files);
  } catch (error) {
    console.error('Error getting upload files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update account info for a file in an upload
router.put('/uploads/:uploadId/account-info', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const accountInfo = req.body;
    const { Transaction } = getModels();
    
    console.log(`[PUT /uploads/${uploadId}/account-info] - Received account info:`, JSON.stringify(accountInfo));
    
    // Handle both array format and single object format for backward compatibility
    const accountInfoArray = Array.isArray(accountInfo) ? accountInfo : [accountInfo];
    
    if (accountInfoArray.length === 0) {
      return res.status(400).json({ error: 'Invalid account information format' });
    }
    
    // Process each file's account info
    const updateResults = await Promise.all(accountInfoArray.map(async (fileInfo) => {
      const { fileName, fileId, accountSource, accountType, accountName } = fileInfo;
      
      // For single object format compatibility
      if (!Array.isArray(accountInfo) && !fileName) {
        // This is likely the older format with direct accountName/accountType fields
        console.log(`[PUT /uploads/${uploadId}/account-info] - Using legacy format for account info`);
        
        const whereClause = { uploadId };
        
        console.log(`[PUT /uploads/${uploadId}/account-info] - Direct credit card handling for all upload transactions`);
        
        // For credit cards, we need to handle transaction types directly
        if (accountInfo.accountType === 'credit_card') {
          console.log(`[PUT /uploads/${uploadId}/account-info] - Credit card account detected, processing all transactions...`);
          
          // Fetch all transactions for this upload
          const transactions = await Transaction.findAll({ where: whereClause });
          console.log(`[PUT /uploads/${uploadId}/account-info] - Found ${transactions.length} transactions to process`);
          
          let updatedCount = 0;
          
          // Process each transaction individually
          for (const transaction of transactions) {
            // Update account info
            transaction.source = accountInfo.accountType || transaction.source;
            transaction.accountType = accountInfo.accountType;
            if (accountInfo.accountName) {
              transaction.account = accountInfo.accountName;
            }
            
            // For credit cards, determine correct transaction type
            const description = transaction.description.toLowerCase();
            const isPayment = description.includes('payment') && 
                            (description.includes('received') || 
                             description.includes('thank you'));
            
            const isRefund = description.includes('refund') || 
                            description.includes('credit') || 
                            description.includes('return');
            
            // Set the correct transaction type
            const originalType = transaction.type;
            
            if (isPayment || isRefund) {
              transaction.type = 'income';
            } else {
              transaction.type = 'expense';
            }
            
            console.log(`[PUT /uploads/${uploadId}/account-info] - Transaction "${transaction.description}": ${originalType} → ${transaction.type}`);
            
            // Save the changes
            await transaction.save();
            updatedCount++;
          }
          
          // Get sample transactions after update to verify changes
          const sampleTransactions = await Transaction.findAll({ 
            where: whereClause,
            limit: 3
          });
          
          console.log(`[PUT /uploads/${uploadId}/account-info] - Sample transactions after update:`);
          sampleTransactions.forEach(tx => {
            console.log(`  "${tx.description}" | Type: ${tx.type} | AccountType: ${tx.accountType}`);
          });
          
          return { 
            success: true, 
            fileName: 'all-files',
            updatedCount 
          };
        }
        
        // For non-credit card accounts, use simple update
        const [updatedCount] = await Transaction.update(
          { 
            source: accountInfo.accountType || null,
            accountType: accountInfo.accountType || null,
            account: accountInfo.accountName || null
          },
          { where: whereClause }
        );
        
        return { 
          success: true, 
          fileName: 'all-files',
          updatedCount 
        };
      }
      
      // New format with fileName required
      if (!fileName) {
        console.log(`[PUT /uploads/${uploadId}/account-info] - Missing fileName in request`);
        return { success: false, error: 'File name is required', fileName: 'unknown' };
      }
      
      console.log(`[PUT /uploads/${uploadId}/account-info] - Processing file: ${fileName}`);
      
      // Use file-specific ID if provided, otherwise use the upload ID
      const whereClause = {
        uploadId: fileId || uploadId
      };
      
      // If we have a filename but no fileId, filter by importSource too
      if (!fileId && fileName) {
        whereClause.importSource = fileName;
      }
      
      console.log(`[PUT /uploads/${uploadId}/account-info] - Where clause:`, JSON.stringify(whereClause));
      
      // Update all transactions from this file in this upload
      const updateData = { 
        source: accountSource || null,
        accountType: accountType || null 
      };
      
      // If accountName is provided, update that as well
      if (accountName) {
        updateData.account = accountName;
      }
      
      console.log(`[PUT /uploads/${uploadId}/account-info] - Update data:`, JSON.stringify(updateData));
      
      // Special handling for credit card accounts
      if (accountType === 'credit_card') {
        console.log(`[PUT /uploads/${uploadId}/account-info] - Special handling for credit card account`);
        
        // First retrieve all transactions
        const transactions = await Transaction.findAll({ where: whereClause });
        console.log(`[PUT /uploads/${uploadId}/account-info] - Found ${transactions.length} credit card transactions`);
        
        let updatedCount = 0;
        
        // Update each transaction individually to set the correct type
        await Promise.all(transactions.map(async (transaction) => {
          // First update the account information
          transaction.source = accountSource || transaction.source;
          transaction.accountType = accountType;
          if (accountName) {
            transaction.account = accountName;
          }
          
          // For credit cards, we need to invert the transaction type logic:
          // - Positive amounts are expenses (charges)
          // - Negative amounts or payments are income (payments to card)
          const descriptionLower = transaction.description.toLowerCase();
          const isPayment = descriptionLower.includes('payment') && 
                          (descriptionLower.includes('received') || 
                           descriptionLower.includes('thank you'));
          
          const isRefund = descriptionLower.includes('refund') || 
                          descriptionLower.includes('credit') || 
                          descriptionLower.includes('return');
          
          // Set the correct transaction type
          if (isPayment) {
            transaction.type = 'income';
          } else if (isRefund) {
            transaction.type = 'income';
          } else {
            // Regular credit card transactions are expenses
            transaction.type = 'expense';
          }
          
          await transaction.save();
          updatedCount++;
        }));
        
        console.log(`[PUT /uploads/${uploadId}/account-info] - Updated ${updatedCount} credit card transactions with correct types`);
        
        return { 
          success: true, 
          fileName,
          updatedCount 
        };
      } else {
        // For non-credit card accounts, proceed with standard update
        const [updatedCount] = await Transaction.update(updateData, { where: whereClause });
        
        console.log(`[PUT /uploads/${uploadId}/account-info] - Updated ${updatedCount} transactions`);
        
        return { 
          success: true, 
          fileName,
          updatedCount 
        };
      }
    }));
    
    console.log(`[PUT /uploads/${uploadId}/account-info] - Update results:`, JSON.stringify(updateResults));
    
    res.status(200).json({ 
      message: 'Account information updated',
      results: updateResults
    });
  } catch (error) {
    console.error('Error updating account info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete an entire upload (mark all batches as processed and save transactions)
router.post('/uploads/:uploadId/complete', async (req, res) => {
  try {
    console.log(`🔍 [SERVER] Complete upload endpoint called for uploadId: ${req.params.uploadId}`);
    console.log(`🔍 [SERVER] Request body:`, JSON.stringify(req.body));
    
    const { Transaction, Upload, Batch } = getModels();
    const { uploadId } = req.params;
    
    if (!uploadId) {
      console.error('⚠️ [SERVER] Upload ID is missing in request');
      return res.status(400).json({ 
        error: 'Upload ID is required',
        details: 'The upload ID is missing in the URL path. Please ensure the uploadId is provided.'
      });
    }
    
    // Find the upload record
    const upload = await Upload.findByPk(uploadId);
    
    if (!upload) {
      console.error(`⚠️ [SERVER] Upload not found: ${uploadId}`);
      return res.status(404).json({
        error: 'Upload not found',
        details: 'The requested upload ID does not exist in the database.'
      });
    }
    
    console.log(`🔍 [SERVER] Completing upload for ID: ${uploadId} with status ${upload.status}`);
    
    // If upload is already complete, just return success
    if (upload.status === 'completed') {
      console.log(`🔍 [SERVER] Upload ${uploadId} was already completed, returning success`);
      return res.json({
        message: 'Upload was already completed',
        uploadId,
        alreadyCompleted: true
      });
    }
    
    // Find all batches for this upload
    const batches = await Batch.findAll({
      where: {
        uploadId: uploadId.toString()
      }
    });
    
    console.log(`🔍 [SERVER] Found ${batches.length} batches for upload ${uploadId}`);
    
    // Mark all batches as completed
    if (batches.length > 0) {
      await Batch.update(
        { status: 'completed', processed: true },
        {
          where: {
            uploadId: uploadId.toString()
          }
        }
      );
      console.log(`✅ [SERVER] Marked ${batches.length} batches as completed for upload ${uploadId}`);
    }
    
    // Mark the upload as completed
    await upload.update({ status: 'completed' });
    console.log(`✅ [SERVER] Marked upload ${uploadId} as completed`);
    
    // Call the /confirm endpoint to save the transactions if not already saved
    if (!req.body.skipConfirm) {
      // Forward to the confirm endpoint
      console.log(`🔍 [SERVER] Forwarding to /uploads/${uploadId}/confirm endpoint to save transactions`);
      
      try {
        // Create a new request to the confirm endpoint
        const confirmResponse = await fetch(`http://localhost:5000/api/uploads/${uploadId}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });
        
        if (!confirmResponse.ok) {
          console.error(`⚠️ [SERVER] Error confirming upload: ${confirmResponse.status}`);
          const errorText = await confirmResponse.text();
          console.error(`⚠️ [SERVER] Error details: ${errorText}`);
        } else {
          console.log(`✅ [SERVER] Successfully confirmed upload ${uploadId}`);
        }
      } catch (confirmError) {
        console.error(`⚠️ [SERVER] Error calling confirm endpoint: ${confirmError.message}`);
        // Continue anyway since we want to complete the upload
      }
    }
    
    return res.json({
      message: 'Upload completed successfully',
      uploadId,
      batchCount: batches.length
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    return res.status(500).json({
      error: 'Failed to complete upload',
      details: error.message
    });
  }
});
  
// Create a new route for updating transaction status more gracefully
// This prevents client-side hanging during long database operations
router.post('/uploads/:uploadId/updateTransactions', async (req, res) => {
    try {
      const { Transaction } = getModels();
      const { uploadId } = req.params;
      
      if (!uploadId) {
        return res.status(400).json({ error: 'Upload ID is required' });
      }
      
      console.log(`🔍 [SERVER] Updating transaction status for uploadId: ${uploadId}`);
      
      // Create a promise that updates the transactions with a shorter timeout
      const updatePromise = Transaction.update(
        { enrichmentStatus: 'completed' },
        {
          where: {
            uploadId: uploadId
          }
        }
      );
      
      // Set a shorter timeout (5 seconds) to prevent long client waits
      const shorterTimeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database operation timed out')), 5000);
      });
      
      // Race the update against the timeout
      const [updatedCount] = await Promise.race([updatePromise, shorterTimeoutPromise]);
      
      console.log(`✅ [SERVER] Updated ${updatedCount} transactions with completed status`);
      
      // If no transactions were updated, log a warning but don't fail the request
      if (updatedCount === 0) {
        console.warn(`⚠️ [SERVER] No transactions were updated for uploadId: ${uploadId}. This might indicate an issue.`);
      }
      
      // Get the updated transactions (with a timeout)
      let transactions = [];
      try {
        const findPromise = Transaction.findAll({
          where: {
            uploadId: uploadId
          },
          limit: 1000 // Limit to prevent excessive data loading
        });
        
        // Race the find operation against a timeout
        transactions = await Promise.race([
          findPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Find operation timed out')), 5000))
        ]);
        
        console.log(`🔍 [SERVER] Found ${transactions.length} transactions for uploadId: ${uploadId}`);
      } catch (findError) {
        console.error(`⚠️ [SERVER] Error retrieving transactions:`, findError);
        // If it's a timeout, we should still return some response
        if (findError.message === 'Find operation timed out') {
          console.warn(`⚠️ [SERVER] Transaction retrieval timed out - returning simplified response`);
          return res.json({
            message: `Completed upload process (retrieval timed out)`,
            uploadId,
            status: 'completed',
            partial: true,
            timedOut: true
          });
        }
      }
      
      // Get unique batch IDs (safely)
      const batchIds = [...new Set((transactions || []).map(t => t.batchId).filter(Boolean))];
      console.log(`🔍 [SERVER] Found ${batchIds.length} unique batch IDs`);
      
      const response = {
        message: `Completed upload with ${transactions.length} transactions across ${batchIds.length} batches`,
        uploadId,
        batchIds,
        status: 'completed'
      };
      
      console.log(`🔍 [SERVER] Sending response for complete upload:`, JSON.stringify(response));
      res.json(response);
      
    } catch (error) {
      console.error('Error updating transactions:', error);
      res.status(500).json({ 
        error: error.message,
        uploadId: req.params.uploadId,
        status: 'error'
      });
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

// Update file transactions with account info
router.put('/uploads/:fileId/account-info', async (req, res) => {
  try {
    const { Transaction } = getModels();
    const { fileId } = req.params;
    const { account, accountType } = req.body;
    
    if (!account && !accountType) {
      return res.status(400).json({ error: 'Account information is required' });
    }
    
    // Find all transactions with this uploadId
    const transactions = await Transaction.findAll({
      where: { 
        uploadId: fileId 
      }
    });
    
    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ error: 'No transactions found for this file ID' });
    }
    
    // Update all transactions
    const updateData = {};
    if (account) updateData.account = account;
    if (accountType) updateData.accountType = accountType;
    
    await Transaction.update(updateData, {
      where: { uploadId: fileId }
    });
    
    res.json({
      message: `Updated account information for ${transactions.length} transactions`,
      updatedFields: updateData
    });
  } catch (error) {
    console.error('Error updating account info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Complete an upload
// PUT route for completing upload removed - using POST endpoint instead

// Regenerate a batch summary explicitly (useful for testing)
router.post('/uploads/:uploadId/batches/:batchId/regenerate-summary', async (req, res) => {
  try {
    const { uploadId, batchId } = req.params;
    console.log(`[POST /uploads/${uploadId}/batches/${batchId}/regenerate-summary] - Regenerating batch summary`);
    
    // Parse options from request
    const { forceOpenAI = false } = req.body;
    
    // Validate params
    if (!uploadId || !batchId) {
      return res.status(400).json({ 
        error: 'Missing parameters',
        details: 'Both uploadId and batchId are required'
      });
    }
    
    const { Transaction, Category, Batch } = getModels();
    
    // Find the batch record
    const batch = await Batch.findOne({
      where: { id: batchId, uploadId: uploadId }
    });
    
    if (!batch) {
      return res.status(404).json({
        error: 'Batch not found',
        details: `No batch found with ID ${batchId} in upload ${uploadId}`
      });
    }
    
    // Fetch transactions
    const transactions = await Transaction.findAll({
      where: { 
        uploadId: uploadId,
        batchId: batchId
      },
      include: [{
        model: Category,
        as: 'category'
      }],
      order: [['date', 'DESC']]
    });
    
    if (transactions.length === 0) {
      return res.status(404).json({
        error: 'Empty batch',
        details: `No transactions found for batch ${batchId}`
      });
    }
    
    let summary = null;
    
    // Set a timeout for summary generation
    const timeoutMs = forceOpenAI ? 20000 : 15000; // 20 seconds for forced OpenAI, 15s otherwise
    console.log(`[POST /uploads/${uploadId}/batches/${batchId}/regenerate-summary] Using ${timeoutMs}ms timeout`);
    
    let summaryResult = null;
    
    // If forceOpenAI is true, try to generate summary directly with OpenAI
    if (forceOpenAI) {
      try {
        console.log(`[POST ${uploadId}/batches/${batchId}/regenerate-summary] Forcing OpenAI summary generation`);
        
        // Set up a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('OpenAI summary generation timed out'));
          }, timeoutMs);
        });
        
        // Race the summary generation against the timeout
        summaryResult = await Promise.race([
          generateBatchSummaryWithOpenAI(transactions, timeoutMs),
          timeoutPromise
        ]);
        
        console.log(`[POST ${uploadId}/batches/${batchId}/regenerate-summary] OpenAI summary generation completed:`, 
          summaryResult ? summaryResult.summary?.substring(0, 30) + '...' : 'null');
      } catch (error) {
        console.error(`[POST ${uploadId}/batches/${batchId}/regenerate-summary] Error with OpenAI summary:`, error);
        // If we had a timeout, mark it as such
        if (error.message === 'OpenAI summary generation timed out') {
          summaryResult = {
            summary: `Batch of ${transactions.length} transactions`,
            insights: [`OpenAI summary generation timed out after ${timeoutMs/1000} seconds.`],
            timedOut: true,
            source: 'openai-timeout'
          };
        }
      }
    }
    
    // If we couldn't get an OpenAI summary or forceOpenAI is false, use the standard method
    if (!summaryResult) {
      console.log(`[POST ${uploadId}/batches/${batchId}/regenerate-summary] Using standard summary generation method`);
      summaryResult = await generateBatchSummary(transactions);
    }
    
    console.log(`[POST ${uploadId}/batches/${batchId}/regenerate-summary] Summary generation completed: "${summaryResult.summary}"`);
    
    // Update batch title in database
    const oldTitle = batch.title;
    await batch.update({ 
      title: summaryResult.summary,
      // Store additional metadata if available
      metadata: {
        ...(batch.metadata || {}),
        insights: summaryResult.insights || [],
        summarySource: summaryResult.source || 'unknown',
        summaryTimedOut: summaryResult.timedOut || false,
        summaryLastUpdated: new Date().toISOString()
      }
    });
    
    // Return updated batch info with enhanced metadata
    res.json({
      batchId,
      uploadId,
      oldTitle,
      newTitle: summaryResult.summary,
      insights: summaryResult.insights || [],
      source: summaryResult.source || (forceOpenAI ? 'openai' : 'standard'),
      timedOut: summaryResult.timedOut || false,
      error: summaryResult.error || false,
      errorType: summaryResult.errorType,
      transactionCount: transactions.length,
      regenerationMethod: forceOpenAI ? 'openai' : 'standard',
      regenerationTimestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error regenerating batch summary:`, error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message
    });
  }
});

// Test endpoint for OpenAI batch summary generation
router.post('/test/openai-batch-summary', async (req, res) => {
  console.log('[POST /test/openai-batch-summary] - Testing OpenAI batch summary generation');
  
  try {
    const { transactions, timeout = 15000, compareWithFallback = true } = req.body;
    
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request',
        details: 'Request must include a non-empty array of transactions'
      });
    }
    
    console.log(`[POST /test/openai-batch-summary] Testing with ${transactions.length} transactions (timeout: ${timeout}ms)`);
    
    // Track metrics for testing
    const startTime = Date.now();
    let openAISummary = null;
    let fallbackSummary = null;
    let errorOccurred = false;
    let errorDetails = null;
    
    try {
      // Use our dedicated function for OpenAI summary generation
      openAISummary = await generateBatchSummaryWithOpenAI(transactions, timeout);
      console.log('[POST /test/openai-batch-summary] OpenAI summary generation completed');
    } catch (openaiError) {
      console.error('[POST /test/openai-batch-summary] Error with OpenAI summary:', openaiError);
      errorOccurred = true;
      errorDetails = {
        message: openaiError.message,
        stack: openaiError.stack,
        name: openaiError.name
      };
    }
    
    // If requested, also generate a fallback summary for comparison
    if (compareWithFallback) {
      try {
        console.log('[POST /test/openai-batch-summary] Generating fallback summary for comparison');
        fallbackSummary = await generateBatchSummary(transactions);
      } catch (fallbackError) {
        console.error('[POST /test/openai-batch-summary] Error with fallback summary:', fallbackError);
      }
    }
    
    // Calculate elapsed time
    const duration = Date.now() - startTime;
    
    // Format the transaction information for the response
    const transactionInfo = transactions.slice(0, 15).map(t => ({
      description: t.description,
      merchant: t.merchant,
      amount: t.amount,
      date: t.date
    }));
    
    // Return the full test results
    res.json({
      success: !errorOccurred && openAISummary !== null,
      duration,
      timeout,
      openai: openAISummary || {
        error: true,
        errorDetails
      },
      fallback: fallbackSummary,
      transactionCount: transactions.length,
      transactionSample: transactionInfo,
      openaiConfigured: openAISummary?.source === 'openai',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[POST /test/openai-batch-summary] Error testing batch summary:', error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function to generate a batch summary with OpenAI
/**
 * Generate a natural language batch summary using OpenAI
 * @param {Array} transactions - Array of transaction objects
 * @param {number} timeoutMs - Timeout in milliseconds (defaults to 10 seconds)
 * @returns {Promise<Object|null>} Object with summary and source, or null on failure
 */
async function generateBatchSummaryWithOpenAI(transactions, timeoutMs = 15000) {
  if (!transactions || transactions.length === 0) {
    console.log('[generateBatchSummaryWithOpenAI] No transactions provided');
    return {
      summary: "No transactions",
      insights: ["This batch contains no transactions."],
      timedOut: false,
      source: 'fallback'
    };
  }
  
  try {
    const openaiService = require('../services/openai');
    const startTime = Date.now();
    
    // Check if OpenAI service is available
    if (!openaiService.isOpenAIConfigured()) {
      console.log('[generateBatchSummaryWithOpenAI] OpenAI service not configured');
      return generateBatchSummary(transactions);
    }
    
    // Check if we're currently rate limited
    if (openaiService.isRateLimited()) {
      console.log('[generateBatchSummaryWithOpenAI] OpenAI service is rate limited, using fallback');
      return {
        summary: `${transactions.length} Transactions`,
        insights: ["OpenAI API rate limit reached. Using fallback summary."],
        timedOut: false,
        source: 'rate-limited-fallback',
        error: true,
        errorType: 'rate_limit'
      };
    }
    
    console.log(`[generateBatchSummaryWithOpenAI] Generating summary for ${transactions.length} transactions with ${timeoutMs}ms timeout`);
    
    // Use the enhanced method from the openai service that has built-in timeout
    const batchInfo = await openaiService.generateBatchSummary(transactions, timeoutMs);
    const duration = Date.now() - startTime;
    
    // Log performance metrics
    console.log(`[generateBatchSummaryWithOpenAI] Summary generation ${batchInfo.timedOut ? 'timed out' : 'completed'} in ${duration}ms`);
    
    // Check if we had a timeout or error, if so return enhanced error information
    if (batchInfo.timedOut || batchInfo.error) {
      console.log(`[generateBatchSummaryWithOpenAI] ${batchInfo.timedOut ? 'Timed out' : 'Error'}: ${batchInfo.errorType || 'unknown'}`);
      
      // If timed out, use fallback method
      if (batchInfo.timedOut) {
        console.log('[generateBatchSummaryWithOpenAI] Using fallback due to timeout');
        const fallback = generateBatchSummary(transactions);
        fallback.timedOut = true;
        fallback.source = 'timeout-fallback';
        fallback.originalErrorType = batchInfo.errorType;
        return fallback;
      }
      
      // For other errors, return the error info with enhanced metadata
      return {
        ...batchInfo,
        source: 'openai-error',
        duration
      };
    }
    
    // Return the valid summary with enhanced metadata
    return {
      summary: batchInfo.summary,
      insights: batchInfo.insights || [],
      timedOut: false,
      source: 'openai',
      duration
    };
  } catch (error) {
    console.error('[generateBatchSummaryWithOpenAI] Unexpected error:', error);
    
    // Fall back to local generation
    const fallback = generateBatchSummary(transactions);
    fallback.error = true;
    fallback.errorType = 'unexpected';
    fallback.errorMessage = error.message;
    fallback.source = 'error-fallback';
    
    return fallback;
  }
}



// Get batch details including transactions for a specific batch within an upload
router.get('/uploads/:uploadId/batches/:batchId', async (req, res) => {
  try {
    const { uploadId, batchId } = req.params;
    console.log(`[GET /uploads/${uploadId}/batches/${batchId}] - Fetching batch details`);
    
    // Validate params
    if (!uploadId || !batchId) {
      return res.status(400).json({ 
        error: 'Missing parameters',
        details: 'Both uploadId and batchId are required'
      });
    }
    
    const { Transaction, Category, Batch } = getModels();
    
    // First, try to find the actual batch record
    const batch = await Batch.findOne({
      where: { id: batchId, uploadId: uploadId }
    });
    
    // Fetch transactions associated with this batch
    const transactions = await Transaction.findAll({
      where: { 
        uploadId: uploadId,
        batchId: batchId
      },
      include: [{
        model: Category,
        as: 'category'
      }],
      order: [['date', 'DESC']]
    });
    
    if (transactions.length === 0) {
      return res.status(404).json({
        error: 'Batch not found',
        details: `No transactions found for batch ${batchId} in upload ${uploadId}`
      });
    }
    
    // Generate batch summary
    const batchInfo = await generateBatchSummary(transactions);
    
    // Calculate batch statistics
    const statistics = transactions.length > 200 
      ? calculateBatchStatisticsOptimized(transactions)
      : calculateBatchStatistics(transactions);
    
    // Update batch title in database if it doesn't have one yet and we got a good summary
    if (batch && (!batch.title || batch.title === 'Untitled Batch') && batchInfo.summary) {
      try {
        await batch.update({ title: batchInfo.summary });
        console.log(`Updated batch title for ${batchId} to "${batchInfo.summary}"`);
      } catch (updateError) {
        console.error(`Error updating batch title:`, updateError);
      }
    }
    
    // Return batch details
    res.json({
      batchId,
      uploadId,
      title: batch?.title || batchInfo.summary,
      summary: batchInfo.summary,
      insights: batchInfo.insights || [],
      statistics,
      transactions: transactions.map(t => {
        const plainTransaction = t.get({ plain: true });
        return {
          ...plainTransaction,
          categoryName: plainTransaction.category?.name || null
        };
      }),
      status: transactions[0]?.enrichmentStatus || 'pending'
    });
  } catch (error) {
    console.error(`Error fetching batch details:`, error);
    res.status(500).json({ 
      error: 'Server error',
      details: error.message
    });
  }
});

/**
 * Helper function to generate batch summary without using OpenAI
 * Uses pattern recognition and statistical analysis to generate insights
 * 
 * @param {Array} transactions - The transactions to summarize
 * @returns {Object} Object with summary, insights, and metadata
 */
async function generateBatchSummary(transactions) {
  if (!transactions || transactions.length === 0) {
    return { 
      summary: "Empty batch", 
      insights: ["No transactions available for analysis."],
      source: 'local'
    };
  }
  
  try {
    console.log(`[generateBatchSummary] Generating fallback summary for ${transactions.length} transactions`);
    const insights = [];
    const stats = calculateBatchStatistics(transactions);
    
    // Check for common merchant
    const merchants = [...new Set(transactions.map(t => t.merchant).filter(Boolean))];
    const merchantTitle = merchants.length === 1 
      ? `Transactions from ${merchants[0]}`
      : null;
      
    if (merchants.length === 1) {
      insights.push(`All transactions are from ${merchants[0]}.`);
    } else if (merchants.length > 1 && merchants.length <= 3) {
      insights.push(`Transactions are from: ${merchants.join(', ')}.`);
    } else if (merchants.length > 3) {
      // Find most frequent merchants
      const merchantCounts = {};
      transactions.forEach(t => {
        if (t.merchant) {
          merchantCounts[t.merchant] = (merchantCounts[t.merchant] || 0) + 1;
        }
      });
      
      const topMerchants = Object.entries(merchantCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => `${entry[0]} (${entry[1]})`);
        
      if (topMerchants.length > 0) {
        insights.push(`Top merchants: ${topMerchants.join(', ')}.`);
      }
    }
    
    // Check if all transactions have similar descriptions
    const descriptions = transactions.map(t => t.description || '');
    const descriptionWords = descriptions.join(' ').split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !['THE', 'AND', 'FROM', 'WITH'].includes(word.toUpperCase())
      );
    
    const wordCounts = {};
    descriptionWords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    // Find most common words for title and insights
    const commonWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);
    
    const commonWordsTitle = commonWords.length > 0
      ? `Transactions related to ${commonWords.join(' ')}`
      : null;
      
    if (commonWords.length > 0) {
      insights.push(`Common keywords: ${commonWords.join(', ')}.`);
    }
    
    // Add financial insights
    if (stats.netAmount) {
      insights.push(`Net ${stats.netDirection === 'positive' ? 'income' : 'expense'}: $${Math.abs(stats.netAmount).toFixed(2)}.`);
    }
    
    if (stats.incomeTransactions > 0 && stats.expenseTransactions > 0) {
      insights.push(`Contains ${stats.incomeTransactions} income and ${stats.expenseTransactions} expense transactions.`);
    } else if (stats.incomeTransactions > 0) {
      insights.push(`Contains ${stats.incomeTransactions} income transactions.`);
    } else if (stats.expenseTransactions > 0) {
      insights.push(`Contains ${stats.expenseTransactions} expense transactions.`);
    }
    
    // Get date range insights
    const dates = transactions.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
    
    let dateRangeTitle = null;
    if (dates.length > 0) {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      const formatDate = (date) => {
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        });
      };
      
      dateRangeTitle = `Transactions from ${formatDate(minDate)} to ${formatDate(maxDate)}`;
      
      // Add date range insight
      const daysDiff = Math.round((maxDate - minDate) / (1000 * 60 * 60 * 24));
      if (daysDiff === 0) {
        insights.push(`All transactions occurred on ${formatDate(minDate)}.`);
      } else {
        insights.push(`Transactions span ${daysDiff} days from ${formatDate(minDate)} to ${formatDate(maxDate)}.`);
      }
    }
    
    // Get categorization insights
    const categories = [...new Set(transactions
      .map(t => t.category?.name || t.categoryName)
      .filter(Boolean))];
      
    if (categories.length === 1) {
      insights.push(`All transactions categorized as "${categories[0]}".`);
    } else if (categories.length > 1 && categories.length <= 3) {
      insights.push(`Categories include: ${categories.join(', ')}.`);
    } else if (categories.length > 3) {
      insights.push(`Transactions span ${categories.length} different categories.`);
    }
    
    // Determine best title to use based on available information
    let summary;
    if (merchantTitle) {
      summary = merchantTitle;
    } else if (commonWordsTitle) {
      summary = commonWordsTitle;
    } else if (dateRangeTitle) {
      summary = dateRangeTitle;
    } else {
      summary = `Batch of ${transactions.length} transactions`;
    }
    
    // Ensure summary is no longer than 8 words
    const summaryWords = summary.split(/\s+/);
    if (summaryWords.length > 8) {
      summary = summaryWords.slice(0, 8).join(' ') + '...';
    }
    
    return { 
      summary,
      insights: insights.length > 0 ? insights : [`Contains ${transactions.length} transactions.`],
      source: 'local'
    };
  } catch (error) {
    console.error('[generateBatchSummary] Error generating summary:', error);
    return { 
      summary: `Batch of ${transactions.length} transactions`,
      insights: [`Error analyzing transactions: ${error.message}`],
      error: true,
      errorType: error.name || 'UnknownError',
      source: 'error'
    };
  }
}


module.exports = router;