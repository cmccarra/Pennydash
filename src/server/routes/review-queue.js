/**
 * Route handler for the transaction review queue
 * This handles transactions that need manual review based on confidence scores
 */

const express = require('express');
const router = express.Router();
const { getModels } = require('../db/sequelize');
const { Op } = require('sequelize');

// Get transactions that need review based on AI confidence scores
router.get('/', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const { limit = 50, page = 1, confidenceThreshold = 0.7 } = req.query;
    
    // Parse limit and page as integers
    const pageSize = parseInt(limit, 10);
    const pageNumber = parseInt(page, 10);
    const offset = (pageNumber - 1) * pageSize;
    
    // Convert confidence threshold to float
    const threshold = parseFloat(confidenceThreshold);
    
    // Find transactions that need review based on confidence scores
    const transactions = await Transaction.findAll({
      where: {
        [Op.or]: [
          // Transactions explicitly flagged for review
          { needsReview: true },
          // Transactions with suggestion applied but low confidence
          { suggestionApplied: true, categoryConfidence: { [Op.lt]: threshold } },
          // Transactions with AI suggested category but not yet applied
          { 
            suggestedCategoryId: { [Op.ne]: null },
            categoryId: null,
            suggestionApplied: false
          }
        ]
      },
      include: [
        { model: Category, as: 'category', required: false }
      ],
      limit: pageSize,
      offset: offset,
      order: [
        // Sort by confidence (ascending, so lowest confidence first)
        ['categoryConfidence', 'ASC'],
        // Then by date (most recent first)
        ['date', 'DESC']
      ]
    });
    
    // Count total matching transactions
    const totalCount = await Transaction.count({
      where: {
        [Op.or]: [
          { needsReview: true },
          { suggestionApplied: true, categoryConfidence: { [Op.lt]: threshold } },
          { 
            suggestedCategoryId: { [Op.ne]: null },
            categoryId: null,
            suggestionApplied: false
          }
        ]
      }
    });
    
    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // Return the transactions with pagination metadata
    console.log(`[GET /review-queue] Found ${transactions.length} transactions that need review out of ${totalCount} total`);
    
    // Ensure we include the suggestedCategoryId as a fallback
    const enhancedTransactions = transactions.map(tx => {
      // If the tx is a Sequelize model instance, convert to plain object
      const plainTx = tx instanceof Object && typeof tx.get === 'function' ? tx.get({ plain: true }) : tx;
      
      return {
        ...plainTx,
        // If there's no categoryId but there is a suggestedCategoryId, use that as initial value
        categoryId: plainTx.categoryId || plainTx.suggestedCategoryId,
        // Ensure confidence is available 
        confidence: plainTx.categoryConfidence || 0
      };
    });
    
    res.json({
      success: true,
      transactions: enhancedTransactions,
      pagination: {
        total: totalCount,
        page: pageNumber,
        pageSize,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching review queue:', error);
    res.status(500).json({ 
      success: false,
      error: `Failed to fetch review queue: ${error.message}` 
    });
  }
});

module.exports = router;