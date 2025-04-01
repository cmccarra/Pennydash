/**
 * Routes for category suggestions
 * Endpoints for getting suggestions for transactions
 */

const express = require('express');
const router = express.Router();
const { getModels } = require('../db/sequelize');
const categorySuggestionService = require('../services/categorySuggestion');

// Get a suggestion for a single transaction based on description and amount
router.get('/category', async (req, res) => {
  try {
    const { description, amount, type = 'expense' } = req.query;
    
    if (!description) {
      return res.status(400).json({ error: 'Transaction description is required' });
    }
    
    // Fetch all categories to use for suggestion matching
    const { Category } = getModels();
    const categories = await Category.findAll();
    
    console.log(`[GET /suggestions/category] Suggesting category for "${description}" (${amount || 'unknown amount'})`);
    
    // Add debug logging
    console.log('[GET /suggestions/category] Calling suggestCategory with params:', { 
      description, 
      amount: amount ? parseFloat(amount) : null, 
      type 
    });
    
    try {
      const suggestion = await categorySuggestionService.suggestCategory(
        description,
        amount ? parseFloat(amount) : null,
        type
      );
      
      console.log('[GET /suggestions/category] Received suggestion:', suggestion);
      
      // Find category name from ID if available
      if (suggestion.categoryId) {
        const category = categories.find(c => c.id === suggestion.categoryId);
        if (category) {
          suggestion.categoryName = category.name;
          suggestion.categoryColor = category.color;
          suggestion.categoryIcon = category.icon;
          suggestion.category = category;
        }
      }
      
      // Add needsReview flag based on confidence
      const confidenceThreshold = 0.7;
      suggestion.needsReview = suggestion.confidence < confidenceThreshold;
      suggestion.autoApply = !suggestion.needsReview;
      
      console.log('[GET /suggestions/category] Returning suggestion:', suggestion);
      res.json(suggestion);
    } catch (suggestionError) {
      console.error('[GET /suggestions/category] Error generating suggestion:', suggestionError);
      // Return a fallback response instead of failing
      res.json({
        categoryId: null,
        confidence: 0,
        suggestionSource: 'error',
        reasoning: suggestionError.message,
        needsReview: true,
        autoApply: false
      });
    }
  } catch (error) {
    console.error('[GET /suggestions/category] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get suggestions for a batch of transactions
router.post('/batch', async (req, res) => {
  try {
    const { transactionIds, confidenceThreshold = 0.7 } = req.body;
    
    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Transaction IDs array is required' });
    }

    console.log(`Processing suggestions for ${transactionIds.length} transactions`);
    
    console.log(`[POST /suggestions/batch] Processing ${transactionIds.length} transactions with threshold ${confidenceThreshold}`);
    
    // Fetch the transactions
    const { Transaction, Category } = getModels();
    const transactions = await Transaction.findAll({
      where: { id: transactionIds },
      include: [{
        model: Category,
        as: 'category',
        required: false
      }]
    });
    
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'No transactions found with the provided IDs' });
    }
    
    console.log(`[POST /suggestions/batch] Found ${transactions.length} transactions`);
    
    // Get suggestions for the batch
    // Get category suggestions with logging
    console.log('Fetching suggestions from categorySuggestionService');
    const suggestionResult = await categorySuggestionService.suggestCategoriesForBatch(
      transactions,
      confidenceThreshold
    );
    
    console.log('Suggestion result:', {
      suggestionsCount: suggestionResult.suggestions?.length,
      topCategories: suggestionResult.topCategories,
      averageConfidence: suggestionResult.averageConfidence
    });
    
    // Fetch categories for all suggested categoryIds
    const categoryIds = [...new Set(
      suggestionResult.suggestions
        .filter(s => s.categoryId)
        .map(s => s.categoryId)
    )];
    
    const categories = await Category.findAll({
      where: { id: categoryIds }
    });
    
    // Create a map for easy lookup
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.id] = {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        type: cat.type
      };
    });
    
    // Enrich suggestions with category details
    suggestionResult.suggestions = suggestionResult.suggestions.map(suggestion => {
      const enriched = { ...suggestion };
      
      if (suggestion.categoryId && categoryMap[suggestion.categoryId]) {
        enriched.category = categoryMap[suggestion.categoryId];
      }
      
      // Add transaction details
      const transaction = transactions.find(t => t.id === suggestion.transactionId);
      if (transaction) {
        enriched.transaction = {
          id: transaction.id,
          description: transaction.description,
          amount: transaction.amount,
          date: transaction.date,
          type: transaction.type
        };
      }
      
      return enriched;
    });
    
    // Find batch category name
    if (suggestionResult.batchCategoryId && categoryMap[suggestionResult.batchCategoryId]) {
      suggestionResult.batchCategoryName = categoryMap[suggestionResult.batchCategoryId].name;
      suggestionResult.batchCategoryColor = categoryMap[suggestionResult.batchCategoryId].color;
    }
    
    // Calculate confidence level distribution
    suggestionResult.confidenceLevels = {
      high: suggestionResult.suggestions.filter(s => s.confidence >= 0.9).length,
      medium: suggestionResult.suggestions.filter(s => s.confidence >= 0.7 && s.confidence < 0.9).length,
      low: suggestionResult.suggestions.filter(s => s.confidence >= 0.5 && s.confidence < 0.7).length,
      veryLow: suggestionResult.suggestions.filter(s => s.confidence < 0.5).length
    };
    
    // Find top suggested categories
    const categoryCounts = {};
    const categoryConfidences = {};
    
    suggestionResult.suggestions.forEach(s => {
      if (s.categoryId) {
        if (!categoryCounts[s.categoryId]) {
          categoryCounts[s.categoryId] = 0;
          categoryConfidences[s.categoryId] = [];
        }
        categoryCounts[s.categoryId]++;
        categoryConfidences[s.categoryId].push(s.confidence);
      }
    });
    
    const topCategories = Object.keys(categoryCounts).map(categoryId => {
      const count = categoryCounts[categoryId];
      const confidences = categoryConfidences[categoryId];
      const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
      
      return {
        categoryId,
        category: categoryMap[categoryId],
        count,
        avgConfidence
      };
    }).sort((a, b) => b.count - a.count || b.avgConfidence - a.avgConfidence);
    
    suggestionResult.topCategories = topCategories.slice(0, 5);
    
    console.log(`[POST /suggestions/batch] Completed with ${suggestionResult.suggestions.length} suggestions`);
    
    res.json(suggestionResult);
  } catch (error) {
    console.error('[POST /suggestions/batch] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Apply suggestions to transactions
router.post('/apply', async (req, res) => {
  try {
    const { transactionUpdates } = req.body;
    
    if (!transactionUpdates || !Array.isArray(transactionUpdates) || transactionUpdates.length === 0) {
      return res.status(400).json({ error: 'Transaction updates array is required' });
    }
    
    console.log(`[POST /suggestions/apply] Applying ${transactionUpdates.length} suggestions`);
    
    // Apply the updates
    const { Transaction, Category } = getModels();
    const updatedTransactions = [];
    
    for (const update of transactionUpdates) {
      const { transactionId, categoryId } = update;
      
      if (!transactionId || !categoryId) {
        console.warn(`[POST /suggestions/apply] Skipping invalid update: ${JSON.stringify(update)}`);
        continue;
      }
      
      // Find and update the transaction
      const transaction = await Transaction.findByPk(transactionId);
      
      if (!transaction) {
        console.warn(`[POST /suggestions/apply] Transaction not found: ${transactionId}`);
        continue;
      }
      
      // Update the transaction
      await transaction.update({
        categoryId,
        suggestionApplied: true,
        needsReview: false,
        reviewed: true
      });
      
      // Fetch the updated transaction with category
      const updatedTransaction = await Transaction.findByPk(transactionId, {
        include: [{
          model: Category,
          as: 'category',
          required: false
        }]
      });
      
      updatedTransactions.push(updatedTransaction);
    }
    
    console.log(`[POST /suggestions/apply] Successfully updated ${updatedTransactions.length} transactions`);
    
    res.json({
      message: `Updated ${updatedTransactions.length} transactions`,
      updatedCount: updatedTransactions.length,
      updatedTransactions
    });
  } catch (error) {
    console.error('[POST /suggestions/apply] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;