/**
 * Route for marking transactions as reviewed
 */

const express = require('express');
const router = express.Router();
const { getModels } = require('../db/sequelize');

// Mark a transaction as reviewed without changing its category
router.put('/:id/reviewed', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`[PUT /transactions/${id}/reviewed] Marking transaction as reviewed`);
    
    const { Transaction } = getModels();
    
    // Set a timeout for the transaction lookup to prevent hanging
    const findTimeout = 5000; // 5 seconds
    let transaction;
    
    try {
      const findPromise = Transaction.findByPk(id);
      
      transaction = await Promise.race([
        findPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction lookup timed out')), findTimeout))
      ]);
      
      if (!transaction) {
        console.error(`[PUT /transactions/${id}/reviewed] Transaction not found`);
        return res.status(404).json({ 
          success: false,
          error: 'Transaction not found',
          transactionId: id
        });
      }
    } catch (findError) {
      console.error(`[PUT /transactions/${id}/reviewed] Error finding transaction:`, findError.message);
      
      // If it's a timeout error, return a specific error
      if (findError.message === 'Transaction lookup timed out') {
        return res.status(408).json({
          success: false,
          error: 'Transaction lookup timed out',
          transactionId: id,
          timeout: true
        });
      }
      
      // For other errors, return a generic error
      return res.status(500).json({
        success: false,
        error: `Error finding transaction: ${findError.message}`,
        transactionId: id
      });
    }
    
    console.log(`[PUT /transactions/${id}/reviewed] Transaction found, updating review status`);
    
    // Update only the review status with a timeout
    try {
      const updatePromise = transaction.update({ 
        reviewed: true,
        needsReview: false,
        // Save the confidence at the time of review (if available)
        reviewConfidence: transaction.categoryConfidence || 1.0, // Default to high confidence for manual review
        // Record the review date
        reviewedAt: new Date()
      });
      
      await Promise.race([
        updatePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction update timed out')), 5000))
      ]);
      
      console.log(`[PUT /transactions/${id}/reviewed] Transaction updated successfully`);
    } catch (updateError) {
      console.error(`[PUT /transactions/${id}/reviewed] Error updating transaction:`, updateError.message);
      
      // If it's a timeout error, return a specific error
      if (updateError.message === 'Transaction update timed out') {
        return res.status(408).json({
          success: false,
          error: 'Transaction update timed out',
          transactionId: id,
          timeout: true
        });
      }
      
      // For other errors, return a generic error
      return res.status(500).json({
        success: false,
        error: `Error updating transaction: ${updateError.message}`,
        transactionId: id
      });
    }
    
    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        reviewed: true,
        needsReview: false,
        message: 'Transaction marked as reviewed'
      }
    });
  } catch (error) {
    console.error(`[PUT /transactions/${req.params.id}/reviewed] Unexpected error:`, error);
    res.status(500).json({ 
      success: false,
      error: `Failed to mark transaction as reviewed: ${error.message}`,
      transactionId: req.params.id
    });
  }
});

module.exports = router;