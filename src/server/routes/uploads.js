/**
 * Express router for handling upload and batch operations
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/sequelize');
const Sequelize = require('sequelize');
const { Op } = Sequelize;

// Get OpenAI service for batch summaries (if available)
const openaiService = require('../services/openai');

/**
 * Generate a summary for a batch based on its transactions
 * @param {Array} transactions - Array of transactions in the batch
 * @returns {Object} Summary object with title and insights
 */
async function generateBatchSummary(transactions) {
  try {
    if (!transactions || transactions.length === 0) {
      return { summary: 'Empty Batch', insights: [] };
    }

    // Format transactions for OpenAI processing
    const transactionData = transactions.map(tx => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      merchant: tx.merchant || 'Unknown',
      category: tx.category ? tx.category.name : 'Uncategorized'
    }));

    // Use OpenAI to generate a summary if available
    if (openaiService && openaiService.generateBatchSummary) {
      try {
        const summary = await openaiService.generateBatchSummary(transactionData);
        return summary;
      } catch (error) {
        console.error('Error generating batch summary with OpenAI:', error);
        // Continue with fallback
      }
    }

    // Fallback: Generate a basic summary based on transaction metadata
    // Get date range
    const dates = transactions.map(tx => new Date(tx.date)).sort((a, b) => a - b);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    // Format dates
    const formatDate = (date) => {
      const options = { month: 'short', day: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    };

    // Count merchants
    const merchantCounts = {};
    transactions.forEach(tx => {
      const merchant = tx.merchant || 'Unknown';
      merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
    });

    // Get dominant merchant if one accounts for >50% of transactions
    let dominantMerchant = null;
    Object.entries(merchantCounts).forEach(([merchant, count]) => {
      if (count / transactions.length > 0.5) {
        dominantMerchant = merchant;
      }
    });

    // Generate a title
    let title = '';
    if (dominantMerchant && dominantMerchant !== 'Unknown') {
      title = `${dominantMerchant}`;
    } else {
      title = `${transactions.length} Transactions`;
    }

    return {
      summary: title,
      insights: [
        `${transactions.length} transactions from ${formatDate(startDate)} to ${formatDate(endDate)}`,
        `Includes merchants: ${Object.keys(merchantCounts).slice(0, 3).join(', ')}${Object.keys(merchantCounts).length > 3 ? '...' : ''}`
      ]
    };
  } catch (error) {
    console.error('Error generating batch summary:', error);
    return { summary: 'Transaction Batch', insights: [] };
  }
}

// Set up file storage with multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename
    const uniqueId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    cb(null, `${uniqueId}${fileExtension}`);
  }
});

// File filter to validate uploads
const fileFilter = (req, file, cb) => {
  // Accept CSV, XML, PDF, OFX/QFX, and Excel files
  const allowedTypes = [
    'text/csv', 
    'application/vnd.ms-excel', 
    'application/xml', 
    'text/xml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/x-ofx',
    'application/x-qfx'
  ];

  // Check MIME type
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV, Excel, XML, PDF, OFX, and QFX files are allowed.'), false);
  }
};

// Configure multer upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * @route GET /uploads/:uploadId/batches
 * @desc Get all batches for a specific upload
 * @access Public
 */
router.get('/:uploadId/batches', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Batch, Transaction, Upload } = sequelize.models;

    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    console.log(`Getting batches for upload ID: ${uploadId}`);

    // Check if the uploadId is a UUID or string format
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId);

    let batches = [];

    if (isUUID) {
      // For UUID format IDs, use standard query
      console.log(`Looking up batches using UUID format: ${uploadId}`);
      batches = await Batch.findAll({
        where: { 
          uploadId: uploadId
        },
        include: [
          {
            model: Transaction,
            as: 'transactions',
            // Use database-specific query for the join condition to handle type conversion
            on: sequelize.literal(`"transactions"."batch_id"::uuid = "batch"."id"::uuid`),
            attributes: ['id', 'description', 'amount', 'date', 'categoryId', 'type', 'merchant']
          }
        ],
        order: [
          ['createdAt', 'DESC']
        ]
      });
    } else {
      // For string format IDs like "upload_1234567890", we need a different approach
      console.log(`Looking up using string format ID: ${uploadId}`);

      // First check if any real batches exist
      try {
        batches = await Batch.findAll({
          where: { 
            uploadId: uploadId
          },
          include: [
            {
              model: Transaction,
              as: 'transactions',
              attributes: ['id', 'description', 'amount', 'date', 'categoryId', 'type', 'merchant']
            }
          ],
          order: [
            ['createdAt', 'DESC']
          ]
        });
      } catch (error) {
        console.log(`Error finding batches with string ID, continuing with alternative lookup: ${error.message}`);
      }

      // If no batches found, check transactions with batchId starting with uploadId_batch_
      if (batches.length === 0) {
        console.log('No standard batches found, looking for string format batch IDs in transactions');

        // Find all transactions for this upload
        const transactions = await Transaction.findAll({
          where: {
            uploadId: uploadId
          },
          attributes: ['id', 'batchId', 'description', 'amount', 'date', 'categoryId', 'type', 'merchant']
        });

        // Group transactions by batchId
        const batchesMap = {};
        transactions.forEach(tx => {
          if (tx.batchId && tx.batchId.startsWith(uploadId)) {
            if (!batchesMap[tx.batchId]) {
              batchesMap[tx.batchId] = {
                transactions: []
              };
            }
            batchesMap[tx.batchId].transactions.push(tx);
          }
        });

        // Create virtual batch objects
        batches = Object.entries(batchesMap).map(([batchId, data]) => {
          const txs = data.transactions;

          // Calculate batch statistics
          let totalAmount = 0;
          let startDate = null;
          let endDate = null;
          let merchantCounts = {};

          txs.forEach(transaction => {
            totalAmount += parseFloat(transaction.amount);

            const txDate = new Date(transaction.date);
            if (!startDate || txDate < startDate) startDate = txDate;
            if (!endDate || txDate > endDate) endDate = txDate;

            const merchant = transaction.merchant || 'Unknown';
            merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
          });

          // Find dominant merchant (if any)
          let dominantMerchant = null;
          let maxCount = 0;
          Object.entries(merchantCounts).forEach(([merchant, count]) => {
            if (count > maxCount) {
              maxCount = count;
              dominantMerchant = merchant;
            }
          });

          // Create a virtual batch
          return {
            id: batchId,
            uploadId: uploadId,
            title: 'Virtual Batch',
            type: 'custom',
            startDate: startDate ? startDate.toISOString().split('T')[0] : null,
            endDate: endDate ? endDate.toISOString().split('T')[0] : null,
            transactionCount: txs.length,
            totalAmount,
            dominantMerchant,
            transactions: txs,
            isVirtual: true,
            toJSON: function() {
              return {
                id: this.id,
                uploadId: this.uploadId,
                title: this.title,
                type: this.type,
                startDate: this.startDate,
                endDate: this.endDate,
                transactionCount: this.transactionCount,
                totalAmount: this.totalAmount,
                dominantMerchant: this.dominantMerchant,
                isVirtual: true
              };
            }
          };
        });
      }
    }

    // Generate summaries for each batch
    const batchesWithSummaries = await Promise.all(
      batches.map(async (batch) => {
        // Generate a summary if one isn't already set
        if (!batch.title || batch.title === 'Untitled Batch') {
          const summary = await generateBatchSummary(batch.transactions);
          // Update the batch title in the database if we generated a good summary
          if (summary && summary.summary) {
            try {
              await batch.update({ title: summary.summary });
              batch.title = summary.summary;
            } catch (updateError) {
              console.error(`Error updating batch title: ${updateError.message}`);
              // Continue even if update fails
            }
          }
        }

        // Calculate statistics for the batch
        const totalAmount = batch.transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        const merchantCounts = {};
        batch.transactions.forEach(tx => {
          const merchant = tx.merchant || 'Unknown';
          merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
        });

        // Find the most common merchant
        let dominantMerchant = null;
        let maxCount = 0;
        Object.entries(merchantCounts).forEach(([merchant, count]) => {
          if (count > maxCount) {
            maxCount = count;
            dominantMerchant = merchant;
          }
        });

        return {
          ...batch.toJSON(),
          statistics: {
            totalAmount,
            dominantMerchant,
            transactionCount: batch.transactions.length
          }
        };
      })
    );

    return res.json({
      uploadId,
      batches: batchesWithSummaries
    });
  } catch (error) {
    console.error('Error getting upload batches:', error);
    return res.status(500).json({
      error: 'Failed to get batches for this upload',
      details: error.message
    });
  }
});

/**
 * @route GET /uploads/:uploadId/stats
 * @desc Get statistics for a specific upload
 * @access Public
 */
router.get('/:uploadId/stats', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Batch, Transaction, Upload } = sequelize.models;

    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    // Get the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Count batches in this upload
    const batchCount = await Batch.count({
      where: {
        uploadId: uploadId.toString()
      }
    });

    // Count transactions in this upload
    const transactionCount = await Transaction.count({
      where: {
        uploadId: uploadId.toString()
      }
    });

    // Get totals by transaction type
    const totals = await Transaction.findAll({
      where: {
        uploadId: uploadId.toString()
      },
      attributes: [
        'type',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total']
      ],
      group: ['type']
    });

    // Format totals
    const totalsByType = {};
    totals.forEach(item => {
      totalsByType[item.type] = parseFloat(item.getDataValue('total'));
    });

    // Get categorization stats
    const categorizedCount = await Transaction.count({
      where: {
        uploadId: uploadId.toString(),
        categoryId: {
          [Op.not]: null
        }
      }
    });

    return res.json({
      uploadId,
      uploadDate: upload.createdAt,
      name: upload.name || 'Unnamed Upload',
      source: upload.source || 'Unknown Source',
      batches: batchCount,
      transactions: transactionCount,
      categorizedTransactions: categorizedCount,
      categorizationRate: transactionCount > 0 ? (categorizedCount / transactionCount) : 0,
      totals: totalsByType
    });
  } catch (error) {
    console.error('Error getting upload stats:', error);
    return res.status(500).json({
      error: 'Failed to get statistics for this upload',
      details: error.message
    });
  }
});

/**
 * @route GET /uploads/:uploadId/batches/:batchId
 * @desc Get a specific batch with its transactions
 * @access Public
 */
router.get('/:uploadId/batches/:batchId', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Batch, Transaction, Category } = sequelize.models;

    const { uploadId, batchId } = req.params;

    if (!uploadId || !batchId) {
      return res.status(400).json({
        error: 'Upload ID and Batch ID are required'
      });
    }

    // Check if we're dealing with new UUIDs or old string format IDs
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId);

    // Declare batch outside the if blocks to make it accessible throughout the function
    let batch;

    // For UUID batches, use the model's association
    // For string format IDs (upload_XXX_batch_Y), use raw query to avoid type conversion issues
    if (isUUID) {
      // Use standard Sequelize query for UUID formatted IDs
      batch = await Batch.findOne({
        where: {
          id: batchId,
          uploadId: uploadId
        },
        include: [
          {
            model: Transaction,
            as: 'transactions',
            required: false,
            include: [
              {
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'type', 'color']
              }
            ]
          }
        ]
      });
    } else {
      console.log(`Looking for batch with uploadId=${uploadId}, batchId=${batchId} (string format)`);

      try {
        // For string IDs like "upload_1743221430232_batch_2", we need a completely different approach
        // Skip the batch lookup in the batches table - go straight to finding transactions
        console.log('Checking for transactions with this batchId');

        // Check if any transactions exist with this batchId
        const transactions = await Transaction.findAll({
          where: {
            uploadId: uploadId,
            batchId: batchId
          },
          include: [
            {
              model: Category,
              as: 'category',
              attributes: ['id', 'name', 'type', 'color']
            }
          ]
        });

        console.log(`Found ${transactions.length} transactions with batchId=${batchId}`);

        if (transactions.length > 0) {
          // Create a "virtual" batch from the transactions
          // Calculate batch statistics
          let totalAmount = 0;
          let startDate = null;
          let endDate = null;
          let merchantCounts = {};

          transactions.forEach(transaction => {
            totalAmount += parseFloat(transaction.amount);

            const txDate = new Date(transaction.date);
            if (!startDate || txDate < startDate) startDate = txDate;
            if (!endDate || txDate > endDate) endDate = txDate;

            const merchant = transaction.merchant || 'Unknown';
            merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
          });

          // Find dominant merchant (if any)
          let dominantMerchant = null;
          let maxCount = 0;
          Object.entries(merchantCounts).forEach(([merchant, count]) => {
            if (count > maxCount) {
              maxCount = count;
              dominantMerchant = merchant;
            }
          });

          // Create a virtual batch object with a toJSON method to mimic a Sequelize model
          batch = {
            id: batchId,
            uploadId: uploadId,
            title: 'Virtual Batch',
            type: 'custom',
            startDate: startDate ? startDate.toISOString().split('T')[0] : null,
            endDate: endDate ? endDate.toISOString().split('T')[0] : null,
            transactionCount: transactions.length,
            totalAmount,
            dominantMerchant,
            transactions,
            isVirtual: true, // Flag to indicate this is not a real batch record
            toJSON: function() {
              return {
                id: this.id,
                uploadId: this.uploadId,
                title: this.title,
                type: this.type,
                startDate: this.startDate,
                endDate: this.endDate,
                transactionCount: this.transactionCount,
                totalAmount: this.totalAmount,
                dominantMerchant: this.dominantMerchant,
                transactions: this.transactions,
                isVirtual: this.isVirtual
              };
            },
            update: async function(fields) {
              // No-op update method since this is a virtual object
              console.log('Cannot update virtual batch, but would update these fields:', fields);
              // We can still update the in-memory object for the current request
              if (fields.title) {
                this.title = fields.title;
              }
              return this;
            }
          };
        } else {
          console.log('No transactions found with this batch ID');

          // Try a more flexible search to understand what's in the database
          const sampleTransactions = await Transaction.findAll({
            where: {
              uploadId: uploadId
            },
            attributes: ['id', 'batchId'],
            limit: 5
          });

          console.log('Sample transactions from this upload:', 
            sampleTransactions.map(t => ({ id: t.id, batchId: t.batchId })));
        }
      } catch (error) {
        console.error('Error during batch or transaction lookup:', error);
      }
    }

    if (!batch) {
      return res.status(404).json({
        error: 'Batch not found'
      });
    }

    // Generate a summary if one isn't already set
    if (!batch.title || batch.title === 'Untitled Batch' || batch.title === 'Virtual Batch') {
      console.log(`Generating summary for batch with title: "${batch.title}"`);

      const summary = await generateBatchSummary(batch.transactions);
      console.log('OpenAI generated summary:', summary);

      // Update the batch title in the database if we generated a good summary
      if (summary && summary.summary) {
        try {
          console.log(`Updating batch title to: "${summary.summary}"`);

          if (batch.isVirtual) {
            console.log(`Updating virtual batch title in response only to: "${summary.summary}"`);
            // For virtual batches, just update the title in the response
            batch.title = summary.summary;
          } else {
            // For real batches, update in the database
            await batch.update({ title: summary.summary });
            batch.title = summary.summary;
          }
        } catch (updateError) {
          console.error(`Error updating batch title: ${updateError.message}`);
          // Continue even if update fails
        }
      } else {
        console.log('No valid summary was generated by OpenAI');
      }
    } else {
      console.log(`Using existing batch title: "${batch.title}"`);
    }

    // Calculate batch statistics
    const totalAmount = batch.transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const merchantCounts = {};
    batch.transactions.forEach(tx => {
      const merchant = tx.merchant || 'Unknown';
      merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
    });

    // Find the most common merchant
    let dominantMerchant = null;
    let maxCount = 0;
    Object.entries(merchantCounts).forEach(([merchant, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantMerchant = merchant;
      }
    });

    // Add statistics to the batch response
    const batchWithStats = {
      ...batch.toJSON(),
      statistics: {
        totalAmount,
        dominantMerchant,
        transactionCount: batch.transactions.length
      }
    };

    return res.json(batchWithStats);
  } catch (error) {
    console.error('Error getting batch details:', error);
    return res.status(500).json({
      error: 'Failed to get batch details',
      details: error.message
    });
  }
});

/**
 * @route PATCH /uploads/:uploadId/batches/:batchId
 * @desc Update a batch (title, status, etc.)
 * @access Public
 */
router.patch('/:uploadId/batches/:batchId', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Batch } = sequelize.models;

    const { uploadId, batchId } = req.params;
    const updateData = req.body;

    if (!uploadId || !batchId) {
      return res.status(400).json({
        error: 'Upload ID and Batch ID are required'
      });
    }

    // Find the batch
    const batch = await Batch.findOne({
      where: {
        id: batchId.toString(),
        uploadId: uploadId.toString()
      }
    });

    if (!batch) {
      return res.status(404).json({
        error: 'Batch not found'
      });
    }

    // Update allowable fields
    const allowedFields = ['title', 'status', 'notes', 'processed'];
    const updateFields = {};

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateFields[field] = updateData[field];
      }
    });

    // Perform the update
    await batch.update(updateFields);

    return res.json({
      message: 'Batch updated successfully',
      batch
    });
  } catch (error) {
    console.error('Error updating batch:', error);
    return res.status(500).json({
      error: 'Failed to update batch',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads
 * @desc Upload a new financial transaction file
 * @access Public
 */
router.post('/', upload.single('file'), async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload } = sequelize.models;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'No file was uploaded'
      });
    }

    // Get file details
    const { originalname, filename, mimetype, size, path: filePath } = req.file;

    // Determine file type from mimetype
    let fileType = 'unknown';
    if (mimetype.includes('csv') || mimetype.includes('excel')) {
      fileType = 'csv';
    } else if (mimetype.includes('xml')) {
      fileType = 'xml';
    } else if (mimetype.includes('pdf')) {
      fileType = 'pdf';
    } else if (mimetype.includes('ofx') || mimetype.includes('qfx')) {
      fileType = 'ofx';
    } else if (mimetype.includes('spreadsheetml')) {
      fileType = 'xlsx';
    }

    // Create upload record in database
    const upload = await Upload.create({
      filename,
      originalFilename: originalname,
      fileType,
      fileSize: size,
      status: 'pending',
      importSource: 'User Upload'
    });

    // Return the upload record
    return res.status(201).json({
      message: 'File uploaded successfully',
      uploadId: upload.id,
      upload
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({
      error: 'Failed to upload file',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads/dummy
 * @desc Create a dummy upload for testing
 * @access Public
 */
router.post('/dummy', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload } = sequelize.models;

    const { name, source, type } = req.body;

    // Create upload record in database
    const upload = await Upload.create({
      filename: 'dummy-file.csv',
      originalFilename: name || 'Dummy Upload',
      fileType: type || 'csv',
      fileSize: 1024,
      status: 'pending',
      importSource: source || 'Test'
    });

    // Return the upload record
    return res.status(201).json({
      message: 'Dummy upload created successfully',
      uploadId: upload.id,
      upload
    });
  } catch (error) {
    console.error('Error creating dummy upload:', error);
    return res.status(500).json({
      error: 'Failed to create dummy upload',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads/:uploadId/process
 * @desc Process an uploaded file, extracting transactions
 * @access Public
 */
router.post('/:uploadId/process', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload, Transaction, Batch } = sequelize.models;

    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    // Find the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Update upload status to processing
    await upload.update({ status: 'processing' });

    // Process the file based on its type
    // This would typically be handled by a dedicated file parser service
    // In real implementation, parse the file and extract transactions
    const processedTransactions = [ /* ... processing logic to get transactions ... */ ];
    
    // Generate sample data for preview if real transactions not available
    const sampleData = {
      transactionCount: 8,
      dateRange: {
        start: '2024-03-01',
        end: '2024-03-31'
      }
    };

    // Store processed transactions temporarily with the upload record
    // But DO NOT save to transaction database yet
    await upload.update({
      status: 'processed',
      accountName: req.body.accountName || 'Default Account',
      accountType: req.body.accountType || 'bank',
      metadata: {
        ...upload.metadata,
        processedTransactions: processedTransactions,
        previewStats: sampleData
      }
    });

    // Return preview info without saving transactions yet
    return res.json({
      message: 'Upload processed. Transactions ready for review.',
      uploadId,
      transactionCount: sampleData.transactionCount,
      dateRange: sampleData.dateRange,
      status: 'processed'
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    return res.status(500).json({
      error: 'Failed to process upload',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads/:uploadId/batches
 * @desc Create a new batch for an upload
 * @access Public
 */
router.post('/:uploadId/batches', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload, Batch, Transaction } = sequelize.models;

    const { uploadId } = req.params;
    const { title, transactionIds, type, metadata } = req.body;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({
        error: 'At least one transaction ID is required'
      });
    }

    // Find the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Get transactions to be included in this batch
    const transactions = await Transaction.findAll({
      where: {
        id: {
          [Op.in]: transactionIds
        },
        uploadId: uploadId.toString()
      }
    });

    if (transactions.length === 0) {
      return res.status(404).json({
        error: 'No valid transactions found for this upload'
      });
    }

    // Calculate batch statistics
    let totalAmount = 0;
    let startDate = null;
    let endDate = null;
    let merchantCounts = {};

    transactions.forEach(transaction => {
      // Sum amounts
      totalAmount += parseFloat(transaction.amount);

      // Track date range
      const txDate = new Date(transaction.date);
      if (!startDate || txDate < startDate) startDate = txDate;
      if (!endDate || txDate > endDate) endDate = txDate;

      // Count merchants
      const merchant = transaction.merchant || 'Unknown';
      merchantCounts[merchant] = (merchantCounts[merchant] || 0) + 1;
    });

    // Find dominant merchant (if any)
    let dominantMerchant = null;
    let maxCount = 0;
    Object.entries(merchantCounts).forEach(([merchant, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantMerchant = merchant;
      }
    });

    // Create the batch
    const batch = await Batch.create({
      title: title || 'Untitled Batch',
      type: type || 'custom',
      uploadId: uploadId.toString(),
      startDate: startDate ? startDate.toISOString().split('T')[0] : null,
      endDate: endDate ? endDate.toISOString().split('T')[0] : null,
      transactionCount: transactions.length,
      totalAmount,
      dominantMerchant,
      metadata: metadata || {}
    });

    // Update transactions to associate with this batch
    await Transaction.update(
      { batchId: batch.id },
      {
        where: {
          id: {
            [Op.in]: transactionIds
          }
        }
      }
    );

    return res.status(201).json({
      message: 'Batch created successfully',
      batch
    });
  } catch (error) {
    console.error('Error creating batch:', error);
    return res.status(500).json({
      error: 'Failed to create batch',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads/:uploadId/auto-batches
 * @desc Automatically organize transactions into batches
 * @access Public
 */
router.post('/:uploadId/auto-batches', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload, Batch, Transaction } = sequelize.models;

    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    // Find the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Get all transactions for this upload that don't already have a batch
    const transactions = await Transaction.findAll({
      where: {
        uploadId: uploadId.toString(),
        batchId: null
      },
      order: [['date', 'ASC']]
    });

    if (transactions.length === 0) {
      return res.status(200).json({
        message: 'No transactions available for batching',
        batches: []
      });
    }

    // Simple logic for organizing batches (by merchant and close dates)
    const batches = [];
    const transactionsByMerchant = {};

    // Group transactions by merchant
    transactions.forEach(transaction => {
      const merchant = transaction.merchant || 'Unknown';
      if (!transactionsByMerchant[merchant]) {
        transactionsByMerchant[merchant] = [];
      }

/**
 * @route POST /uploads/:uploadId/confirm
 * @desc Confirm an upload after enrichment completion, actually saving transactions to database
 * @access Public
 */
router.post('/:uploadId/confirm', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload, Transaction, Batch } = sequelize.models;

    const { uploadId } = req.params;
    
    console.log(`🔍 [SERVER] Confirming upload completion for ID: ${uploadId}`);

    if (!uploadId) {
      console.error('⚠️ [SERVER] Missing uploadId in confirm request');
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    // Find the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      console.error(`⚠️ [SERVER] Upload not found for ID: ${uploadId}`);
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Check if this upload was already processed
    if (upload.status === 'completed') {
      console.log(`🔍 [SERVER] Upload ${uploadId} was already completed, returning success`);
      return res.json({
        message: 'Upload was already processed',
        uploadId,
        alreadyCompleted: true
      });
    }
    
    // Get the temporarily stored transactions from metadata
    const tempTransactions = upload.metadata?.processedTransactions || [];
    
    if (tempTransactions.length === 0) {
      console.error(`⚠️ [SERVER] No transactions found for upload ${uploadId}`);
      return res.status(400).json({
        error: 'No transactions found for this upload'
      });
    }

    console.log(`🔍 [SERVER] Saving ${tempTransactions.length} transactions for upload ${uploadId}`);
    
    // Now actually save the transactions to the database
    const createdTransactions = [];
    for (const transaction of tempTransactions) {
      try {
        const newTransaction = await Transaction.create({
          ...transaction,
          uploadId: uploadId
        });
        createdTransactions.push(newTransaction);
      } catch (error) {
        console.error('Error creating transaction:', error);
        // Continue with other transactions
      }
    }

    console.log(`✅ [SERVER] Created ${createdTransactions.length} transactions for upload ${uploadId}`);

    // Create a batch for all transactions
    const batch = await Batch.create({
      title: 'Upload Batch',
      uploadId: uploadId,
      transactionCount: createdTransactions.length,
      status: 'pending'
    });

    // Associate transactions with the batch
    await Transaction.update(
      { batchId: batch.id },
      {
        where: {
          uploadId: uploadId
        }
      }
    );

    // Update upload status
    await upload.update({ 
      status: 'completed',
      transactionCount: createdTransactions.length
    });

    console.log(`✅ [SERVER] Upload ${uploadId} completed successfully with batch ${batch.id}`);

    return res.json({
      message: `Upload confirmed. ${createdTransactions.length} transactions saved.`,
      uploadId,
      transactionCount: createdTransactions.length,
      batchId: batch.id
    });
  } catch (error) {
    console.error('Error confirming upload:', error);
    return res.status(500).json({
      error: 'Failed to confirm upload',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads/:uploadId/cancel
 * @desc Cancel an upload, removing the upload record
 * @access Public
 */
router.post('/:uploadId/cancel', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload } = sequelize.models;

    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    // Find the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Delete the upload
    await upload.destroy();

    return res.json({
      message: 'Upload canceled successfully',
      uploadId
    });
  } catch (error) {
    console.error('Error canceling upload:', error);
    return res.status(500).json({
      error: 'Failed to cancel upload',
      details: error.message
    });
  }
});

      transactionsByMerchant[merchant].push(transaction);
    });

    // Create batches for merchants with multiple transactions
    for (const [merchant, merchantTransactions] of Object.entries(transactionsByMerchant)) {
      if (merchantTransactions.length >= 2) {
        // Calculate batch statistics
        let totalAmount = 0;
        let startDate = null;
        let endDate = null;

        merchantTransactions.forEach(transaction => {
          totalAmount += parseFloat(transaction.amount);

          const txDate = new Date(transaction.date);
          if (!startDate || txDate < startDate) startDate = txDate;
          if (!endDate || txDate > endDate) endDate = txDate;
        });

        // Create a batch for this merchant
        const batch = await Batch.create({
          title: `${merchant} Transactions`,
          type: 'merchant',
          uploadId: uploadId.toString(),
          startDate: startDate ? startDate.toISOString().split('T')[0] : null,
          endDate: endDate ? endDate.toISOString().split('T')[0] : null,
          transactionCount: merchantTransactions.length,
          totalAmount,
          dominantMerchant: merchant,
          metadata: {}
        });

        // Update transactions to associate with this batch
        await Transaction.update(
          { batchId: batch.id },
          {
            where: {
              id: {
                [Op.in]: merchantTransactions.map(t => t.id)
              }
            }
          }
        );

        batches.push(batch);
      }
    }

    // Handle remaining transactions (create a "Miscellaneous" batch)
    const remainingTransactions = await Transaction.findAll({
      where: {
        uploadId: uploadId.toString(),
        batchId: null
      }
    });

    if (remainingTransactions.length > 0) {
      let totalAmount = 0;
      let startDate = null;
      let endDate = null;

      remainingTransactions.forEach(transaction => {
        totalAmount += parseFloat(transaction.amount);

        const txDate = new Date(transaction.date);
        if (!startDate || txDate < startDate) startDate = txDate;
        if (!endDate || txDate > endDate) endDate = txDate;
      });

      const batch = await Batch.create({
        title: 'Miscellaneous Transactions',
        type: 'miscellaneous',
        uploadId: uploadId.toString(),
        startDate: startDate ? startDate.toISOString().split('T')[0] : null,
        endDate: endDate ? endDate.toISOString().split('T')[0] : null,
        transactionCount: remainingTransactions.length,
        totalAmount,
        dominantMerchant: null,
        metadata: {}
      });

      await Transaction.update(
        { batchId: batch.id },
        {
          where: {
            id: {
              [Op.in]: remainingTransactions.map(t => t.id)
            }
          }
        }
      );

      batches.push(batch);
    }

    return res.status(201).json({
      message: 'Batches created successfully',
      batchCount: batches.length,
      batches
    });
  } catch (error) {
    console.error('Error creating automatic batches:', error);
    return res.status(500).json({
      error: 'Failed to create automatic batches',
      details: error.message
    });
  }
});

/**
 * @route POST /uploads/:uploadId/complete
 * @desc Mark an upload as complete, finalizing all batches
 * @access Public
 */
router.post('/:uploadId/complete', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload, Batch } = sequelize.models;

    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }

    // Find the upload record
    const upload = await Upload.findByPk(uploadId);

    if (!upload) {
      return res.status(404).json({
        error: 'Upload not found'
      });
    }

    // Update all pending batches to completed
    await Batch.update(
      { status: 'completed' },
      {
        where: {
          uploadId: uploadId.toString(),
          status: 'pending'
        }
      }
    );

    // Mark the upload as completed
    await upload.update({ status: 'completed' });

    return res.json({
      message: 'Upload completed successfully',
      uploadId
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    return res.status(500).json({
      error: 'Failed to complete upload',
      details: error.message
    });
  }
});

/**
 * @route GET /uploads
 * @desc Get a list of all uploads
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Upload, Batch, Transaction } = sequelize.models;

    // Query parameters for pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get all uploads (without the complex counts for now)
    const uploads = await Upload.findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    // Get batch and transaction counts separately to avoid complex SQL
    const uploadIds = uploads.rows.map(upload => upload.id);

    // Get batch counts
    const batchCounts = await Batch.findAll({
      attributes: [
        'uploadId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        uploadId: {
          [Op.in]: uploadIds.map(id => id.toString())
        }
      },
      group: ['uploadId'],
      raw: true
    });

    // Get transaction counts
    const transactionCounts = await Transaction.findAll({
      attributes: [
        'uploadId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        uploadId: {
          [Op.in]: uploadIds.map(id => id.toString())
        }
      },
      group: ['uploadId'],
      raw: true
    });

    // Create a map of counts
    const batchCountMap = {};
    batchCounts.forEach(item => {
      batchCountMap[item.uploadId] = parseInt(item.count);
    });

    const transactionCountMap = {};
    transactionCounts.forEach(item => {
      transactionCountMap[item.uploadId] = parseInt(item.count);
    });

    // Add counts to upload objects
    uploads.rows.forEach(upload => {
      upload.dataValues.batchCount = batchCountMap[upload.id] || 0;
      upload.dataValues.transactionCount = transactionCountMap[upload.id] || 0;
    });

    return res.json({
      uploads: uploads.rows,
      total: uploads.count,
      page,
      limit,
      totalPages: Math.ceil(uploads.count / limit)
    });
  } catch (error) {
    console.error('Error getting uploads:', error);
    return res.status(500).json({
      error: 'Failed to get uploads',
      details: error.message
    });
  }
});

// This comment marks where a duplicate/incomplete implementation of the generateBatchSummary function was found.
// The entire duplicate code fragment has been completely removed to prevent errors and confusion.

module.exports = router;