/**
 * Express router for transactions test endpoints
 * Used for testing the batch summary functionality
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { getDB } = require('../db/sequelize');

/**
 * @route POST /transactions
 * @desc Create a new transaction for testing
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    // Get the database models after initialization
    const sequelize = getDB();
    const { Transaction } = sequelize.models;
    
    // Create a new transaction from request body
    const transaction = await Transaction.create({
      date: req.body.date || new Date().toISOString().split('T')[0],
      description: req.body.description || 'Test transaction',
      amount: req.body.amount || 0,
      type: req.body.type || 'expense',
      uploadId: req.body.uploadId,
      merchant: req.body.merchant || null,
      account: req.body.account || 'Test Account',
      accountType: req.body.accountType || 'checking',
      categoryId: req.body.categoryId || null,
      needsReview: req.body.needsReview !== undefined ? req.body.needsReview : true,
      metadata: req.body.metadata || {}
    });
    
    return res.status(201).json({
      message: 'Transaction created successfully',
      transaction
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return res.status(500).json({
      error: 'Failed to create transaction',
      details: error.message
    });
  }
});

module.exports = router;