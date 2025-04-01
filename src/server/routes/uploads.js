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
    const { Batch, Transaction } = sequelize.models;
    
    const { uploadId } = req.params;
    
    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID is required'
      });
    }
    
    // Find all batches for this upload
    const batches = await Batch.findAll({
      where: sequelize.literal(`CAST("batch"."upload_id" AS TEXT) = '${uploadId.toString()}'`),
      include: [
        {
          model: Transaction,
          as: 'transactions',
          attributes: ['id', 'description', 'amount', 'date', 'categoryId', 'type']
        }
      ],
      order: [
        ['createdAt', 'DESC']
      ]
    });
    
    return res.json({
      uploadId,
      batches
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
      where: sequelize.literal(`CAST("batch"."upload_id" AS TEXT) = '${uploadId.toString()}'`)
    });
    
    // Count transactions in this upload
    const transactionCount = await Transaction.count({
      where: sequelize.literal(`CAST("transaction"."upload_id" AS TEXT) = '${uploadId.toString()}'`)
    });
    
    // Get totals by transaction type
    const totals = await Transaction.findAll({
      where: sequelize.literal(`CAST("transaction"."upload_id" AS TEXT) = '${uploadId.toString()}'`),
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
      where: sequelize.literal(`CAST("transaction"."upload_id" AS TEXT) = '${uploadId.toString()}' AND "transaction"."category_id" IS NOT NULL`)
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
    
    // Find the specific batch
    const batch = await Batch.findOne({
      where: sequelize.literal(`CAST("batch"."id" AS TEXT) = '${batchId.toString()}' AND CAST("batch"."upload_id" AS TEXT) = '${uploadId.toString()}'`),
      include: [
        {
          model: Transaction,
          as: 'transactions',
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
    
    if (!batch) {
      return res.status(404).json({
        error: 'Batch not found'
      });
    }
    
    return res.json(batch);
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
      where: sequelize.literal(`CAST("batch"."id" AS TEXT) = '${batchId.toString()}' AND CAST("batch"."upload_id" AS TEXT) = '${uploadId.toString()}'`)
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
    // For now, we'll just update the status to indicate it's processed
    
    // Update the upload record to indicate processing completed
    await upload.update({
      status: 'processed',
      accountName: req.body.accountName || 'Default Account',
      accountType: req.body.accountType || 'bank'
    });
    
    return res.json({
      message: 'Upload queued for processing',
      uploadId,
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
      where: sequelize.literal(`"transaction"."upload_id"::text = '${uploadId.toString()}' AND "transaction"."batch_id" IS NULL`),
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
      where: sequelize.literal(`"transaction"."upload_id"::text = '${uploadId.toString()}' AND "transaction"."batch_id" IS NULL`)
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
        where: sequelize.literal(`"batch"."upload_id"::text = '${uploadId.toString()}' AND "batch"."status" = 'pending'`)
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
    
    // Get all uploads with batch and transaction counts
    const uploads = await Upload.findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM batches
              WHERE CAST(batches.upload_id AS TEXT) = CAST("upload".id AS TEXT)
            )`),
            'batchCount'
          ],
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM transactions
              WHERE CAST(transactions.upload_id AS TEXT) = CAST("upload".id AS TEXT)
            )`),
            'transactionCount'
          ]
        ]
      }
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

module.exports = router;