const natural = require('natural');
const { getModels } = require('../db/sequelize');
const { Op } = require('sequelize');

/**
 * Service to suggest categories for transactions based on their descriptions with confidence scoring
 */
class CategorySuggestionService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.classifier = new natural.BayesClassifier();
    this.trained = false;
  }

  /**
   * Train the classifier with existing categorized transactions
   */
  async trainClassifier() {
    try {
      const { Transaction, Category } = getModels();
      
      // Find categorized transactions with their categories
      const categorizedTransactions = await Transaction.findAll({
        where: {
          categoryId: {
            [Op.not]: null
          }
        },
        include: [{
          model: Category,
          as: 'category'
        }],
        limit: 1000 // Limit to avoid memory issues with very large datasets
      });
      
      // Skip training if there are not enough categorized transactions
      if (categorizedTransactions.length < 5) {
        console.log('Not enough categorized transactions to train classifier');
        this.trained = false;
        return false;
      }
      
      // Reset classifier to start fresh
      this.classifier = new natural.BayesClassifier();
      
      // Add each transaction description to the classifier
      for (const transaction of categorizedTransactions) {
        if (transaction.description && transaction.categoryId && transaction.category) {
          this.classifier.addDocument(
            this.preprocessText(transaction.description), 
            transaction.categoryId
          );
          
          // If merchant is available, add it as well for better classification
          if (transaction.merchant) {
            this.classifier.addDocument(
              this.preprocessText(transaction.merchant),
              transaction.categoryId
            );
          }
        }
      }
      
      // Train the classifier
      this.classifier.train();
      this.trained = true;
      console.log(`Classifier trained with ${categorizedTransactions.length} categorized transactions`);
      return true;
    } catch (error) {
      console.error('Error training classifier:', error);
      this.trained = false;
      return false;
    }
  }

  /**
   * Preprocess text for better classification
   * @param {string} text - The input text to preprocess
   * @returns {string} Preprocessed text
   */
  preprocessText(text) {
    if (!text) return '';
    
    // Convert to lowercase
    let processed = text.toLowerCase();
    
    // Remove special characters, numbers, and extra spaces
    processed = processed.replace(/[^\w\s]/g, ' ');
    
    // Tokenize and join to remove extra spaces
    const tokens = this.tokenizer.tokenize(processed);
    return tokens.join(' ');
  }

  /**
   * Suggest a category for a transaction based on its description
   * @param {string} description - Transaction description
   * @returns {Promise<{categoryId: string, confidence: number}>} Suggested category and confidence
   */
  async suggestCategory(description) {
    try {
      // Make sure the classifier is trained
      if (!this.trained) {
        await this.trainClassifier();
      }
      
      // If still not trained, return null suggestion
      if (!this.trained) {
        return { categoryId: null, confidence: 0 };
      }
      
      // Preprocess the description
      const processedText = this.preprocessText(description);
      
      // Get classifier results
      const classifications = this.classifier.getClassifications(processedText);
      
      if (classifications.length === 0) {
        return { categoryId: null, confidence: 0 };
      }
      
      // Get the top classification
      const topClassification = classifications[0];
      
      return {
        categoryId: topClassification.label,
        confidence: topClassification.value
      };
    } catch (error) {
      console.error('Error suggesting category:', error);
      return { categoryId: null, confidence: 0 };
    }
  }

  /**
   * Find similar transactions based on description for batch categorization
   * @param {Object} transaction - The transaction to find similar ones for
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {Promise<Array>} Array of similar transaction IDs with confidence scores
   */
  async findSimilarTransactions(transaction, threshold = 0.7) {
    try {
      const { Transaction } = getModels();
      const result = [];
      
      // Skip if no description
      if (!transaction.description) {
        return result;
      }
      
      const baseDescription = this.preprocessText(transaction.description);
      const baseMerchant = transaction.merchant ? this.preprocessText(transaction.merchant) : null;
      
      // Get all uncategorized transactions (excluding the current one)
      const uncategorizedTransactions = await Transaction.findAll({
        where: {
          categoryId: null,
          id: {
            [Op.ne]: transaction.id
          }
        },
        limit: 500 // Limit to avoid processing too many transactions at once
      });
      
      console.log(`Found ${uncategorizedTransactions.length} uncategorized transactions to check for similarities`);
      
      // Using Dice coefficient for string similarity
      for (const t of uncategorizedTransactions) {
        // Calculate description similarity
        const currentDescription = this.preprocessText(t.description);
        let similarity = natural.DiceCoefficient(baseDescription, currentDescription);
        
        // Check merchant similarity too if available
        if (baseMerchant && t.merchant) {
          const currentMerchant = this.preprocessText(t.merchant);
          const merchantSimilarity = natural.DiceCoefficient(baseMerchant, currentMerchant);
          
          // Use the higher similarity value between description and merchant
          similarity = Math.max(similarity, merchantSimilarity);
        }
        
        if (similarity >= threshold) {
          result.push({
            id: t.id,
            similarity: similarity,
            confidence: similarity // Use similarity as confidence score
          });
        }
      }
      
      // Sort by similarity (highest first)
      return result.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error('Error finding similar transactions:', error);
      return [];
    }
  }
  
  /**
   * Suggest categories for a batch of transactions
   * @param {Array} transactions - Array of transactions to categorize
   * @param {number} confidenceThreshold - Minimum confidence score for automatic categorization (0-1)
   * @returns {Promise<Object>} Object with suggested categories and confidence scores
   */
  async suggestCategoriesForBatch(transactions, confidenceThreshold = 0.7) {
    try {
      // Make sure the classifier is trained
      if (!this.trained) {
        await this.trainClassifier();
      }
      
      // If still not trained, return empty suggestion
      if (!this.trained) {
        return {
          suggestions: [],
          needsReview: true,
          confidence: 0,
          averageConfidence: 0,
          message: "Classifier not trained - not enough categorized transactions"
        };
      }
      
      console.log(`Suggesting categories for batch of ${transactions.length} transactions with confidence threshold ${confidenceThreshold}`);
      
      // Get category details for later use
      const { Category } = getModels();
      const allCategories = await Category.findAll();
      const categoryMap = {};
      allCategories.forEach(cat => {
        categoryMap[cat.id] = {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          color: cat.color
        };
      });
      
      // Process each transaction in the batch
      const suggestions = [];
      
      for (const transaction of transactions) {
        // For already categorized transactions, add their existing category with high confidence
        if (transaction.categoryId) {
          suggestions.push({
            transactionId: transaction.id,
            categoryId: transaction.categoryId,
            confidence: 1.0, // Maximum confidence for existing categories
            source: 'existing',
            category: categoryMap[transaction.categoryId]
          });
          continue;
        }
        
        // Get all potential classifications for better scoring
        const allClassifications = [];
        
        // Try description first
        if (transaction.description) {
          const processedDescription = this.preprocessText(transaction.description);
          const descriptionClassifications = this.classifier.getClassifications(processedDescription);
          
          // Add all description classifications with their source
          descriptionClassifications.forEach(c => {
            allClassifications.push({
              categoryId: c.label,
              confidence: c.value,
              source: 'description'
            });
          });
        }
        
        // Also try merchant for additional signals
        if (transaction.merchant) {
          const processedMerchant = this.preprocessText(transaction.merchant);
          const merchantClassifications = this.classifier.getClassifications(processedMerchant);
          
          // Add all merchant classifications with their source
          merchantClassifications.forEach(c => {
            allClassifications.push({
              categoryId: c.label,
              confidence: c.value,
              source: 'merchant'
            });
          });
        }
        
        // Combine classifications by category, prioritizing highest confidence
        const combinedClassifications = {};
        
        allClassifications.forEach(c => {
          if (!combinedClassifications[c.categoryId] || 
              c.confidence > combinedClassifications[c.categoryId].confidence) {
            combinedClassifications[c.categoryId] = {
              categoryId: c.categoryId,
              confidence: c.confidence,
              source: c.source
            };
          }
        });
        
        // Convert to array and sort by confidence
        const sortedClassifications = Object.values(combinedClassifications)
          .sort((a, b) => b.confidence - a.confidence);
        
        if (sortedClassifications.length > 0) {
          // Get top classification
          const topClassification = sortedClassifications[0];
          
          // Add to suggestions with additional data
          suggestions.push({
            transactionId: transaction.id,
            categoryId: topClassification.categoryId,
            confidence: topClassification.confidence,
            source: topClassification.source,
            alternatives: sortedClassifications.slice(1, 4), // Include next 3 alternatives
            category: categoryMap[topClassification.categoryId],
            needsReview: topClassification.confidence < confidenceThreshold
          });
        } else {
          // Add placeholder suggestion with zero confidence if no category could be suggested
          suggestions.push({
            transactionId: transaction.id,
            categoryId: null,
            confidence: 0,
            source: 'none',
            alternatives: [],
            needsReview: true
          });
        }
      }
      
      // Calculate average confidence
      let totalConfidence = 0;
      let classifiedCount = 0;
      
      suggestions.forEach(suggestion => {
        if (suggestion.confidence > 0) {
          totalConfidence += suggestion.confidence;
          classifiedCount++;
        }
      });
      
      const avgConfidence = classifiedCount > 0 ? totalConfidence / classifiedCount : 0;
      console.log(`Average confidence for batch: ${avgConfidence}`);
      
      // Group and count suggestions by category
      const categoryCounts = {};
      const categoryTotalConfidence = {};
      
      suggestions.forEach(suggestion => {
        if (suggestion.categoryId) {
          // Count all categories, regardless of confidence
          categoryCounts[suggestion.categoryId] = (categoryCounts[suggestion.categoryId] || 0) + 1;
          
          // Sum confidence for weighted decision
          categoryTotalConfidence[suggestion.categoryId] = 
            (categoryTotalConfidence[suggestion.categoryId] || 0) + suggestion.confidence;
        }
      });
      
      // Calculate weighted scores (count × avg confidence)
      const categoryScores = {};
      Object.keys(categoryCounts).forEach(categoryId => {
        const count = categoryCounts[categoryId];
        const totalConfidence = categoryTotalConfidence[categoryId];
        const avgCategoryConfidence = totalConfidence / count;
        
        // Weight by both frequency and confidence
        categoryScores[categoryId] = count * avgCategoryConfidence;
      });
      
      // Find the top category by weighted score
      let topCategory = null;
      let topCategoryScore = 0;
      let topCategoryConfidence = 0;
      
      for (const [categoryId, score] of Object.entries(categoryScores)) {
        if (score > topCategoryScore) {
          topCategory = categoryId;
          topCategoryScore = score;
          topCategoryConfidence = categoryTotalConfidence[categoryId] / categoryCounts[categoryId];
        }
      }
      
      // Determine if the batch needs review based on confidence
      const batchNeedsReview = !topCategory || 
                              topCategoryConfidence < confidenceThreshold ||
                              suggestions.some(s => s.needsReview);
      
      // Format top categories with category details
      const formattedTopCategories = Object.entries(categoryCounts)
        .map(([categoryId, count]) => ({
          categoryId,
          count,
          avgConfidence: categoryTotalConfidence[categoryId] / count,
          category: categoryMap[categoryId], 
          score: categoryScores[categoryId]
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Return top 5 categories
      
      console.log(`Top category for batch: ${topCategory} with score ${topCategoryScore}, needs review: ${batchNeedsReview}`);
      
      return {
        suggestions,
        batchCategoryId: topCategory,
        batchCategoryName: topCategory ? categoryMap[topCategory]?.name : null,
        averageConfidence: avgConfidence,
        topCategoryConfidence: topCategoryConfidence,
        needsReview: batchNeedsReview,
        confidenceThreshold,
        topCategories: formattedTopCategories,
        highConfidenceSuggestionCount: suggestions.filter(s => s.confidence >= confidenceThreshold).length,
        lowConfidenceSuggestionCount: suggestions.filter(s => s.confidence < confidenceThreshold).length
      };
    } catch (error) {
      console.error('Error suggesting categories for batch:', error);
      return {
        suggestions: [],
        needsReview: true,
        confidence: 0,
        averageConfidence: 0,
        message: `Error during category suggestion: ${error.message}`
      };
    }
  }
}

// Export a singleton instance
const categorySuggestionService = new CategorySuggestionService();
module.exports = categorySuggestionService;
