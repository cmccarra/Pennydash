const natural = require('natural');
const { getModels } = require('../db/sequelize');
const { Op } = require('sequelize');
const openaiService = require('./openai');

/**
 * Service to suggest categories for transactions based on their descriptions with confidence scoring
 */
class CategorySuggestionService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.classifier = new natural.BayesClassifier();
    this.trained = false;
    this.useOpenAI = openaiService.isAvailable();
    this.categoryCache = new Map(); // Cache for OpenAI suggestions

    // Log OpenAI availability at startup
    console.log(`[CategorySuggestion] OpenAI service availability: ${this.useOpenAI ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
    if (!this.useOpenAI) {
      console.log('[CategorySuggestion] Will use Bayes classifier as the primary categorization method');
    }
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
        console.log('Not enough categorized transactions to train classifier. Found:', categorizedTransactions.length);

        // Create some default categorizations if there are categories but not enough transactions
        const categories = await Category.findAll();

        if (categories.length > 0) {
          console.log('Using default categorizations with available categories');

          // Default training data - common terms for each category
          const defaultTraining = {
            'Food & Dining': ['restaurant', 'cafe', 'coffee', 'diner', 'food', 'grocery', 'meal', 'pizza', 'burger', 'sushi'],
            'Housing': ['rent', 'mortgage', 'property', 'home', 'apartment', 'condo', 'housing', 'maintenance'],
            'Transportation': ['gas', 'fuel', 'car', 'auto', 'vehicle', 'bus', 'train', 'transit', 'uber', 'lyft', 'taxi'],
            'Entertainment': ['movie', 'theatre', 'concert', 'entertainment', 'netflix', 'spotify', 'subscription', 'streaming'],
            'Shopping': ['amazon', 'walmart', 'target', 'shopping', 'store', 'retail', 'clothes', 'purchase'],
            'Utilities': ['electric', 'water', 'gas', 'power', 'utility', 'bill', 'phone', 'internet', 'cable', 'telecom'],
            'Travel': ['hotel', 'flight', 'airline', 'travel', 'vacation', 'trip', 'airbnb', 'booking'],
            'Income': ['salary', 'paycheck', 'deposit', 'income', 'payment', 'wage', 'direct deposit', 'employer'],
            'Health': ['doctor', 'medical', 'health', 'pharmacy', 'hospital', 'dental', 'insurance'],
            'Education': ['school', 'college', 'university', 'tuition', 'course', 'education', 'student', 'loan']
          };

          this.classifier = new natural.BayesClassifier();

          // For each category, add default training terms if there's a similar category
          for (const category of categories) {
            // Try to find a matching default category
            const matchingDefaultCategory = Object.keys(defaultTraining).find(
              defCat => category.name.toLowerCase().includes(defCat.toLowerCase()) || 
                        defCat.toLowerCase().includes(category.name.toLowerCase())
            );

            if (matchingDefaultCategory) {
              // Add training data for this category
              for (const term of defaultTraining[matchingDefaultCategory]) {
                this.classifier.addDocument(term, category.id);
              }
            }
          }

          // Train the classifier
          this.classifier.train();
          this.trained = true;
          console.log('Trained classifier with default data for available categories');
          return true;
        }

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
   * @param {number} amount - Transaction amount (optional)
   * @param {string} type - Transaction type (optional)
   * @returns {Promise<{categoryId: string, confidence: number, suggestionSource: string, reasoning: string}>} Suggested category and confidence
   */
  async suggestCategory(description, amount = null, type = 'expense') {
    try {
      const { Transaction, Category } = getModels();
      console.log('[CategorySuggestion] Starting suggestion for:', description);

      // Check if we're a new user (less than 10 categorized transactions)
      const categorizedCount = await Transaction.count({
        where: {
          categoryId: {
            [Op.not]: null
          }
        }
      });

      // For new users, try AI first
      if (categorizedCount < 10 && this.useOpenAI) {
        try {
          console.log('New user detected, trying OpenAI first');
          const categories = await Category.findAll();
          const openaiSuggestion = await openaiService.categorizeTransaction(
            description,
            amount,
            type,
            categories
          );

          if (openaiSuggestion && !openaiSuggestion.error) {
            return {
              categoryId: openaiSuggestion.categoryId,
              confidence: openaiSuggestion.confidence,
              suggestionSource: 'openai-new-user',
              reasoning: openaiSuggestion.reasoning
            };
          }
        } catch (error) {
          console.error('OpenAI suggestion failed:', error);
        }
      }

      // Look for exact matches in previous transactions
      const existingTransactions = await Transaction.findAll({
        where: {
          description: description,
          categoryId: {
            [Op.not]: null
          }
        },
        include: [{
          model: Category,
          as: 'category'
        }],
        order: [['updatedAt', 'DESC']],
        limit: 3
      });

      // If we find matching transactions, use their category
      if (existingTransactions.length > 0) {
        const transaction = existingTransactions[0];
        return {
          categoryId: transaction.categoryId,
          confidence: 0.9, // High confidence for exact matches
          suggestionSource: 'database-exact-match',
          reasoning: `Previously categorized identical transaction`
        };
      }

      // Look for similar descriptions (fuzzy match)
      console.log(`[CategorySuggestion] Looking for similar transactions to: "${description}"`);
      const allCategorizedTransactions = await Transaction.findAll({
        where: {
          categoryId: {
            [Op.not]: null
          }
        },
        include: [{
          model: Category,
          as: 'category'
        }],
        limit: 100 // Limit to avoid performance issues
      });

      console.log(`[CategorySuggestion] Found ${allCategorizedTransactions.length} categorized transactions to compare against`);

      // Find similar transactions using string similarity
      const similarTransactions = allCategorizedTransactions
        .map(t => ({
          transaction: t,
          similarity: natural.JaroWinklerDistance(
            this.preprocessText(description), 
            this.preprocessText(t.description)
          )
        }))
        .filter(item => item.similarity > 0.7) // Lowered similarity threshold
        .sort((a, b) => b.similarity - a.similarity);

      if (similarTransactions.length > 0) {
        const match = similarTransactions[0];
        return {
          categoryId: match.transaction.categoryId,
          confidence: match.similarity * 0.9, // Scale confidence based on similarity
          suggestionSource: 'database-similar-match',
          reasoning: `Similar to previously categorized transaction: "${match.transaction.description}"`
        };
      }

      // Make sure the classifier is trained
      if (!this.trained) {
        await this.trainClassifier();
      }

      // If OpenAI is enabled and we have an API key, try it first
      if (this.useOpenAI) {
        console.log(`[CategorySuggestion] Using OpenAI to suggest category for: "${description}" (${type}, $${amount || 'N/A'})`);

        try {
          // Add timeout for OpenAI calls to prevent hanging
          const openaiPromise = (async () => {
            const { Category } = getModels();
            const categories = await Category.findAll({
              order: [['type', 'ASC'], ['name', 'ASC']]
            });

            return await openaiService.categorizeTransaction(
              description,
              amount,
              type,
              categories
            );
          })();

          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('OpenAI categorization timed out')), 10000));

          const openaiSuggestion = await Promise.race([openaiPromise, timeoutPromise]);

          if (openaiSuggestion && !openaiSuggestion.error) {
            // Check if we already have a matched categoryId from the OpenAI service
            let categoryId = openaiSuggestion.categoryId;
            let matchConfidence = 1.0; // Default to high confidence if ID was directly provided

            // If no categoryId but we have a name suggestion, find matching category
            if (!categoryId && openaiSuggestion.categoryName) {
              const matchResult = openaiService.findMatchingCategory(
                openaiSuggestion.categoryName,
                await Category.findAll(),
                type
              );

              categoryId = matchResult.categoryId;
              matchConfidence = matchResult.matchConfidence;
            }

            // Calculate final confidence - use OpenAI confidence but adjust based on category match quality
            const finalConfidence = categoryId 
              ? (openaiSuggestion.confidence * 0.7) + (matchConfidence * 0.3)
              : openaiSuggestion.confidence * 0.5; // Lower confidence if no match found

            // Log the result
            console.log(`[CategorySuggestion] OpenAI suggestion: "${openaiSuggestion.categoryName}" -> ID: ${categoryId}, Confidence: ${finalConfidence.toFixed(2)}`);

            // Return formatted result
            return {
              categoryId,
              confidence: finalConfidence,
              openaiSuggestion: openaiSuggestion.categoryName,
              reasoning: openaiSuggestion.reasoning || "Predicted by AI based on transaction description and amount",
              fromCache: openaiSuggestion.fromCache || false,
              suggestionSource: openaiSuggestion.fromCache ? 'openai-cache' : 'openai'
            };
          }
        } catch (openaiError) {
          console.error('[CategorySuggestion] OpenAI error, falling back to classifier:', openaiError);
          console.log('[CategorySuggestion] Error details:', openaiError.message);
          // Fall back to classifier below
        }
      }

      // Fall back to Bayes classifier if OpenAI failed or is disabled

      // If still not trained, return null suggestion
      if (!this.trained) {
        return { categoryId: null, confidence: 0, suggestionSource: 'untrained' };
      }

      // Preprocess the description
      const processedText = this.preprocessText(description);

      // Get classifier results
      const classifications = this.classifier.getClassifications(processedText);

      if (classifications.length === 0) {
        return { categoryId: null, confidence: 0, suggestionSource: 'no-classifications' };
      }

      // Get the top classification
      const topClassification = classifications[0];

      return {
        categoryId: topClassification.label,
        confidence: topClassification.confidence || topClassification.value,
        suggestionSource: 'bayes-classifier',
        reasoning: `Matched based on text similarity to previously categorized transactions`
      };
    } catch (error) {
      console.error('Error suggesting category:', error);
      return { categoryId: null, confidence: 0, suggestionSource: 'error', reasoning: error.message };
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
    console.log(`⏱️ Starting category suggestion for batch of ${transactions.length} transactions with timeout protection`);

    // Set a processing timeout to prevent hanging (30 seconds should be more than enough)
    const processingTimeout = 30000;
    let timeoutId;

    // Create a promise that will reject after the timeout
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.warn(`⚠️ Category suggestion processing timed out after ${processingTimeout/1000} seconds`);
        reject(new Error('Category suggestion processing timed out after 30 seconds'));
      }, processingTimeout);
    });

    // Create the actual processing promise
    const processingPromise = this._processSuggestCategoriesForBatch(transactions, confidenceThreshold);

    try {
      // Race the processing against the timeout
      const result = await Promise.race([processingPromise, timeoutPromise]);
      clearTimeout(timeoutId); // Clear the timeout if processing completed successfully
      return result;
    } catch (error) {
      clearTimeout(timeoutId); // Make sure to clear the timeout in case of error
      console.error('Error in category suggestion with timeout:', error);

      // Return a degraded but useful response
      return {
        suggestions: transactions.map(tx => ({
          transactionId: tx.id,
          categoryId: null,
          confidence: 0,
          source: 'timeout',
          needsReview: true
        })),
        needsReview: true,
        confidence: 0,
        averageConfidence: 0,
        timedOut: true,
        message: `Category suggestion processing error: ${error.message}`
      };
    }
  }

  /**
   * Internal method to process batch category suggestions
   * Separated from public method to enable timeout wrapping
   * @private
   */
  async _processSuggestCategoriesForBatch(transactions, confidenceThreshold = 0.7) {
    try {
      // Make sure the classifier is trained
      if (!this.trained) {
        await this.trainClassifier();
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

      // Process transactions in batches of 5 to avoid rate limits with OpenAI
      const BATCH_SIZE = 5;
      const transactionBatches = [];

      // Split transactions into smaller batches
      for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        transactionBatches.push(transactions.slice(i, i + BATCH_SIZE));
      }

      console.log(`Split ${transactions.length} transactions into ${transactionBatches.length} smaller batches for processing`);

      // Process each mini-batch
      for (const [batchIndex, batchTransactions] of transactionBatches.entries()) {
        console.log(`Processing mini-batch ${batchIndex + 1}/${transactionBatches.length} (${batchTransactions.length} transactions)`);

        // Process each transaction in the current mini-batch
        const batchPromises = batchTransactions.map(async (transaction) => {
          try {
            // For already categorized transactions, add their existing category with high confidence
            if (transaction.categoryId) {
              return {
                transactionId: transaction.id,
                categoryId: transaction.categoryId,
                confidence: 1.0, // Maximum confidence for existing categories
                source: 'existing',
                category: categoryMap[transaction.categoryId]
              };
            }

            // If OpenAI is enabled and we have an API key, try it first
            if (this.useOpenAI) {
              try {
                // Call the individual suggestion method that will use OpenAI
                const suggestion = await this.suggestCategory(
                  transaction.description, 
                  transaction.amount,
                  transaction.type || 'expense'
                );

                // If we got a valid suggestion from OpenAI
                if (suggestion.categoryId && suggestion.suggestionSource.includes('openai')) {
                  return {
                    transactionId: transaction.id,
                    categoryId: suggestion.categoryId,
                    confidence: suggestion.confidence,
                    source: suggestion.suggestionSource,
                    reasoning: suggestion.reasoning,
                    alternatives: [], // We don't have alternatives from OpenAI yet
                    category: categoryMap[suggestion.categoryId],
                    needsReview: suggestion.confidence < confidenceThreshold
                  };
                }
              } catch (openaiError) {
                console.error(`OpenAI suggestion error for transaction ${transaction.id}:`, openaiError);
                // Fall back to classifier below
              }
            }

            // Fall back to Bayes classifier
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

              // Return suggestion with additional data
              return {
                transactionId: transaction.id,
                categoryId: topClassification.categoryId,
                confidence: topClassification.confidence,
                source: topClassification.source,
                alternatives: sortedClassifications.slice(1, 4), // Include next 3 alternatives
                category: categoryMap[topClassification.categoryId],
                needsReview: topClassification.confidence < confidenceThreshold,
                reasoning: 'Classified using statistical patterns from past transactions'
              };
            } else {
              // Return placeholder suggestion with zero confidence if no category could be suggested
              return {
                transactionId: transaction.id,
                categoryId: null,
                confidence: 0,
                source: 'none',
                alternatives: [],
                needsReview: true,
                reasoning: 'No matching categories found'
              };
            }
          } catch (error) {
            console.error(`Error processing transaction ${transaction.id}:`, error);
            return {
              transactionId: transaction.id,
              categoryId: null,
              confidence: 0,
              source: 'error',
              alternatives: [],
              needsReview: true,
              reasoning: `Error: ${error.message}`
            };
          }
        });

        // Wait for all transactions in this mini-batch to be processed
        const batchResults = await Promise.all(batchPromises);
        suggestions.push(...batchResults);

        // Slight delay between mini-batches to avoid overwhelming the API if we're using OpenAI
        if (this.useOpenAI && batchIndex < transactionBatches.length - 1) {
          console.log(`Short delay before processing next mini-batch...`);
          await new Promise(resolve => setTimeout(resolve, 500));
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

  /**
   * Helper method to finalize batch suggestions and calculate statistics
   * @private
   * @param {Array} suggestions - Array of suggestion objects
   * @param {number} confidenceThreshold - Confidence threshold for auto-categorization
   * @param {Object} categoryMap - Map of category details by ID
   * @returns {Object} Formatted batch results with statistics
   */
  _finalizeBatchSuggestions(suggestions, confidenceThreshold, categoryMap = {}) {
    console.log(`[CategorySuggestion] Finalizing batch of ${suggestions.length} suggestions`);

    // Initialize counters for statistics
    let totalConfidence = 0;
    let classifiedCount = 0;
    let autoClassifiedCount = 0;
    let needsReviewCount = 0;
    let highConfidenceCount = 0;
    let mediumConfidenceCount = 0;
    let lowConfidenceCount = 0;
    let bySourceCount = {};

    // Process each suggestion and gather statistics
    suggestions.forEach(suggestion => {
      // Calculate basic metrics
      if (suggestion.confidence > 0) {
        totalConfidence += suggestion.confidence;
        classifiedCount++;

        // Track confidence levels
        if (suggestion.confidence >= 0.9) {
          highConfidenceCount++;
        } else if (suggestion.confidence >= 0.7) {
          mediumConfidenceCount++;
        } else if (suggestion.confidence >= 0.5) {
          lowConfidenceCount++;
        }

        // Track auto-categorization stats based on threshold
        if (suggestion.confidence >= confidenceThreshold) {
          autoClassifiedCount++;
        } else {
          needsReviewCount++;
        }

        // Track categorization source
        const source = suggestion.source || 'unknown';
        bySourceCount[source] = (bySourceCount[source] || 0) + 1;
      }
    });

    // Calculate average confidence
    const avgConfidence = classifiedCount > 0 ? totalConfidence / classifiedCount : 0;
    console.log(`[CategorySuggestion] Average confidence for batch: ${avgConfidence.toFixed(2)}`);

    // Group and count suggestions by category for pattern analysis
    const categoryCounts = {};
    const categoryTotalConfidence = {};
    const categorySources = {};

    suggestions.forEach(suggestion => {
      if (suggestion.categoryId) {
        // Count all categories, regardless of confidence
        categoryCounts[suggestion.categoryId] = (categoryCounts[suggestion.categoryId] || 0) + 1;

        // Sum confidence for weighted decision
        categoryTotalConfidence[suggestion.categoryId] = 
          (categoryTotalConfidence[suggestion.categoryId] || 0) + suggestion.confidence;

        // Track sources by category for analysis
        if (!categorySources[suggestion.categoryId]) {
          categorySources[suggestion.categoryId] = {};
        }
        const source = suggestion.source || 'unknown';
        categorySources[suggestion.categoryId][source] = (categorySources[suggestion.categoryId][source] || 0) + 1;
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

    console.log(`[CategorySuggestion] Top category for batch: ${topCategory ? categoryMap[topCategory]?.name : 'none'} with score ${topCategoryScore}, needs review: ${batchNeedsReview}`);

    // Group suggestions by confidence level for better reporting
    const confidenceLevels = {
      high: suggestions.filter(s => s.confidence >= 0.9).length,
      medium: suggestions.filter(s => s.confidence >= 0.7 && s.confidence < 0.9).length,
      low: suggestions.filter(s => s.confidence >= 0.5 && s.confidence < 0.7).length,
      veryLow: suggestions.filter(s => s.confidence < 0.5).length
    };

    console.log(`[CategorySuggestion] Confidence breakdown: High: ${confidenceLevels.high}, Medium: ${confidenceLevels.medium}, Low: ${confidenceLevels.low}, Very Low: ${confidenceLevels.veryLow}`);

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
      lowConfidenceSuggestionCount: suggestions.filter(s => s.confidence < confidenceThreshold).length,
      confidenceLevels // Include the confidence level breakdown
    };
  }
}

// Export a singleton instance
const categorySuggestionService = new CategorySuggestionService();
module.exports = categorySuggestionService;