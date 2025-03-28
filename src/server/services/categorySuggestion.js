const natural = require('natural');
const db = require('../db/inMemoryDB');

/**
 * Service to suggest categories for transactions based on their descriptions
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
      const transactions = await db.getAllTransactions();
      const categories = await db.getAllCategories();
      
      // Skip training if there are not enough categorized transactions
      const categorizedTransactions = transactions.filter(t => t.categoryId);
      if (categorizedTransactions.length < 5) {
        console.log('Not enough categorized transactions to train classifier');
        this.trained = false;
        return false;
      }
      
      // Add each transaction description to the classifier
      for (const transaction of categorizedTransactions) {
        if (transaction.description && transaction.categoryId) {
          const category = categories.find(c => c.id === transaction.categoryId);
          if (category) {
            this.classifier.addDocument(this.preprocessText(transaction.description), category.id);
          }
        }
      }
      
      // Train the classifier
      this.classifier.train();
      this.trained = true;
      console.log('Classifier trained with categorized transactions');
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
   * @returns {Promise<Array>} Array of similar transaction IDs
   */
  async findSimilarTransactions(transaction, threshold = 0.7) {
    try {
      const transactions = await db.getAllTransactions();
      const result = [];
      
      // Skip if no description
      if (!transaction.description) {
        return result;
      }
      
      const baseDescription = this.preprocessText(transaction.description);
      
      // Using Dice coefficient for string similarity
      for (const t of transactions) {
        // Skip the same transaction or already categorized transactions
        if (t.id === transaction.id || t.categoryId) {
          continue;
        }
        
        const currentDescription = this.preprocessText(t.description);
        const similarity = natural.DiceCoefficient(baseDescription, currentDescription);
        
        if (similarity >= threshold) {
          result.push({
            id: t.id,
            similarity: similarity
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
}

// Export a singleton instance
const categorySuggestionService = new CategorySuggestionService();
module.exports = categorySuggestionService;
