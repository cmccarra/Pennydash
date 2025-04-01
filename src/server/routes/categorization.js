/**
 * Express routes for transaction categorization
 * Handles single-transaction and batch categorization requests
 */
const express = require('express');
const router = express.Router();
const openaiService = require('../services/openai');
const { getDB } = require('../db/sequelize');
const Sequelize = require('sequelize');
const { Op } = Sequelize;

// We'll get the database models inside the route handlers
// after the database has been initialized

/**
 * @route POST /api/categorize/transaction
 * @desc Categorize a single transaction using AI
 * @access Public
 */
router.post('/transaction', async (req, res) => {
  try {
    // Get the database models
    const sequelize = getDB();
    const { Transaction, Category } = sequelize.models;
    
    const { description, amount, type = 'expense', transactionId } = req.body;

    // Validate required fields
    if (!description) {
      return res.status(400).json({ 
        error: 'Transaction description is required' 
      });
    }

    if (amount === undefined || amount === null) {
      return res.status(400).json({ 
        error: 'Transaction amount is required' 
      });
    }

    // Get existing categories for better suggestions
    const categories = await Category.findAll();

    // Call OpenAI service to categorize the transaction
    const result = await openaiService.categorizeTransaction(
      description,
      amount,
      type,
      categories
    );

    // Find matching category if possible
    if (result.categoryName) {
      const matchResult = openaiService.findMatchingCategory(
        result.categoryName,
        categories,
        type
      );

      result.matchingCategoryId = matchResult.categoryId;
      result.matchConfidence = matchResult.matchConfidence;
    }

    // If a transaction ID was provided, update the transaction record
    if (transactionId) {
      try {
        const transaction = await Transaction.findByPk(transactionId);
        
        if (transaction) {
          // Only update if the confidence meets a threshold
          if (result.confidence >= 0.7 && result.matchingCategoryId) {
            await transaction.update({
              categoryId: result.matchingCategoryId,
              aiCategoryConfidence: result.confidence,
              needsReview: result.confidence < 0.9, // Mark for review if confidence is not very high
              reviewed: false // Reset reviewed status since we're changing the category
            });
            
            result.transactionUpdated = true;
          }
        }
      } catch (updateError) {
        console.error('Error updating transaction with categorization:', updateError);
        result.updateError = updateError.message;
      }
    }

    // Return the categorization result
    return res.json(result);
  } catch (error) {
    console.error('Error categorizing transaction:', error);
    return res.status(500).json({
      error: 'Failed to categorize transaction',
      details: error.message
    });
  }
});

/**
 * @route POST /api/categorize/batch
 * @desc Categorize a batch of transactions using AI
 * @access Public
 */
router.post('/batch', async (req, res) => {
  try {
    // Get the database models
    const sequelize = getDB();
    const { Transaction, Category } = sequelize.models;
    
    const { transactions, updateRecords = false, confidenceThreshold = 0.7 } = req.body;

    // Validate input
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        error: 'A non-empty array of transactions is required'
      });
    }

    // Limit batch size to prevent timeouts
    const MAX_BATCH_SIZE = 20;
    if (transactions.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        error: `Batch size exceeds maximum limit of ${MAX_BATCH_SIZE} transactions`
      });
    }

    // Get existing categories for better suggestions
    const categories = await Category.findAll();

    // Call OpenAI service to categorize the batch
    const results = await openaiService.categorizeBatch(transactions, categories);

    // Process results if we need to update the database records
    if (updateRecords) {
      let updatedCount = 0;
      let skippedCount = 0;
      
      // Create a map of transaction IDs for quick lookup
      const transactionMap = new Map();
      
      // Collect all transaction IDs to fetch in a single query
      const transactionIds = transactions
        .filter(tx => tx.id) // Only include transactions with IDs
        .map(tx => tx.id);
      
      // Fetch all transactions in a single query for better performance
      if (transactionIds.length > 0) {
        const dbTransactions = await Transaction.findAll({
          where: {
            id: {
              [Op.in]: transactionIds
            }
          }
        });
        
        // Create a map for quick lookup
        dbTransactions.forEach(tx => {
          transactionMap.set(tx.id, tx);
        });
      }
      
      // Process each result and update the corresponding transaction
      for (const result of results) {
        if (!result.transactionId) continue;
        
        const transaction = transactionMap.get(result.transactionId);
        if (!transaction) {
          skippedCount++;
          continue;
        }
        
        // Only update if confidence meets threshold and we have a matching category
        if (
          result.confidence >= confidenceThreshold && 
          result.matchingCategoryId
        ) {
          await transaction.update({
            categoryId: result.matchingCategoryId,
            aiCategoryConfidence: result.confidence,
            needsReview: result.confidence < 0.9, // Mark for review if confidence is not very high
            reviewed: false // Reset reviewed status since we're changing the category
          });
          
          result.transactionUpdated = true;
          updatedCount++;
        } else {
          skippedCount++;
        }
      }
      
      // Add summary to results
      results.summary = {
        totalProcessed: results.length,
        updatedCount,
        skippedCount
      };
    }

    // Return the categorization results
    return res.json({ results });
  } catch (error) {
    console.error('Error categorizing batch:', error);
    return res.status(500).json({
      error: 'Failed to categorize batch',
      details: error.message
    });
  }
});

/**
 * @route POST /api/categorize/sample
 * @desc Test categorization with a sample transaction without saving
 * @access Public
 */
router.post('/sample', async (req, res) => {
  try {
    // Get the database models
    const sequelize = getDB();
    const { Category } = sequelize.models;
    
    const { description, amount, type = 'expense' } = req.body;

    // Validate required fields
    if (!description) {
      return res.status(400).json({ 
        error: 'Transaction description is required' 
      });
    }

    if (amount === undefined || amount === null) {
      return res.status(400).json({ 
        error: 'Transaction amount is required' 
      });
    }

    // Get existing categories for better suggestions
    const categories = await Category.findAll();

    // Call OpenAI service to categorize the transaction
    const result = await openaiService.categorizeTransaction(
      description,
      amount,
      type,
      categories
    );

    // Find matching category if possible
    if (result.categoryName) {
      const matchResult = openaiService.findMatchingCategory(
        result.categoryName,
        categories,
        type
      );

      result.matchingCategoryId = matchResult.categoryId;
      result.matchConfidence = matchResult.matchConfidence;
      
      // Find and include the category name if available
      if (matchResult.categoryId) {
        const category = categories.find(c => c.id === matchResult.categoryId);
        if (category) {
          result.matchingCategoryName = category.name;
        }
      }
    }

    // Return the categorization result
    return res.json(result);
  } catch (error) {
    console.error('Error with sample categorization:', error);
    return res.status(500).json({
      error: 'Failed to categorize sample transaction',
      details: error.message
    });
  }
});

module.exports = router;