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
    const { Transaction } = getModels();
    
    const transaction = await Transaction.findByPk(id);
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        error: 'Transaction not found' 
      });
    }
    
    // Update only the review status
    await transaction.update({ 
      reviewed: true,
      needsReview: false,
      // Save the confidence at the time of review
      reviewConfidence: transaction.categoryConfidence
    });
    
    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        reviewed: transaction.reviewed,
        needsReview: transaction.needsReview
      }
    });
  } catch (error) {
    console.error('Error marking transaction as reviewed:', error);
    res.status(500).json({ 
      success: false,
      error: `Failed to mark transaction as reviewed: ${error.message}` 
    });
  }
});

module.exports = router;