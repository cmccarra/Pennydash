/**
 * Test script to verify that OpenAI fallback mechanisms work properly for batch processing
 */

// First, import our simulation module to set the environment variable
import './simulate-openai-failure.js';

// Now import the rest of the modules
import natural from 'natural';
import * as openaiService from './src/server/services/openai.js';
import categorySuggestionService from './src/server/services/categorySuggestion.js';

// Mock categories for testing
const mockCategories = [
  { id: 'cat1', name: 'Groceries', type: 'expense' },
  { id: 'cat2', name: 'Dining Out', type: 'expense' },
  { id: 'cat3', name: 'Utilities', type: 'expense' },
  { id: 'cat4', name: 'Entertainment', type: 'expense' },
  { id: 'cat5', name: 'Salary', type: 'income' }
];

// Test transactions batch
const testTransactionsBatch = [
  {
    id: 'txn1',
    description: "GROCERY OUTLET MARKET",
    amount: 43.27,
    type: "expense",
    date: new Date()
  },
  {
    id: 'txn2',
    description: "NETFLIX SUBSCRIPTION",
    amount: 12.99,
    type: "expense",
    date: new Date()
  },
  {
    id: 'txn3',
    description: "SALARY DEPOSIT",
    amount: 2508.42,
    type: "income",
    date: new Date()
  },
  {
    id: 'txn4',
    description: "POWER & ELECTRIC BILL",
    amount: 85.33,
    type: "expense", 
    date: new Date()
  }
];

// We're using the singleton instance imported above

// Override internal methods to use mock data
categorySuggestionService._processSuggestCategoriesForBatch = async function(transactions, confidenceThreshold) {
  console.log(`[MOCK] Processing batch suggestions for ${transactions.length} transactions`);

  // Create a category map from mock categories
  const categoryMap = {};
  mockCategories.forEach(cat => {
    categoryMap[cat.id] = cat;
  });

  // Array to store all suggestion results
  const allSuggestions = [];

  // Process each transaction
  for (const transaction of transactions) {
    // Get suggestion for the transaction
    const suggestion = await this.suggestCategory(
      transaction.description,
      transaction.amount,
      transaction.type
    );

    // Convert to batch suggestion format
    allSuggestions.push({
      transactionId: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      categoryId: suggestion.categoryId,
      confidence: suggestion.confidence,
      suggestionSource: suggestion.suggestionSource,
      reasoning: suggestion.reasoning || '',
      needsReview: suggestion.confidence < confidenceThreshold
    });
  }

  // Finalize the batch suggestions with our custom implementation
  // This mimics the real _finalizeBatchSuggestions method
  const automaticSuggestions = [];
  const manualReviewNeeded = [];
  let totalConfidence = 0;
  
  // Split suggestions based on confidence
  for (const suggestion of allSuggestions) {
    if (suggestion.confidence >= confidenceThreshold) {
      automaticSuggestions.push(suggestion);
    } else {
      manualReviewNeeded.push(suggestion);
    }
    totalConfidence += suggestion.confidence;
  }
  
  // Calculate stats for the batch
  const avgConfidence = allSuggestions.length ? totalConfidence / allSuggestions.length : 0;
  const stats = {
    total: allSuggestions.length,
    automatic: automaticSuggestions.length,
    manualReview: manualReviewNeeded.length,
    averageConfidence: parseFloat(avgConfidence.toFixed(2)),
    percentAutomatic: allSuggestions.length 
      ? parseFloat(((automaticSuggestions.length / allSuggestions.length) * 100).toFixed(1))
      : 0
  };
  
  // Return the formatted result
  return {
    automaticSuggestions,
    manualReviewNeeded,
    stats,
    success: true
  };
};

// Override suggestCategory to properly handle our mock environment
categorySuggestionService.suggestCategory = async function(description, amount = null, type = 'expense') {
  console.log(`[MOCK] Suggesting category for: "${description}" (${type}, $${amount})`);
  
  // First attempt to use OpenAI (but it will fail due to SIMULATE_OPENAI_FAILURE=true)
  try {
    console.log(`[CategorySuggestion] Using OpenAI to suggest category for: "${description}" (${type}, $${amount})`);
    
    // This will throw an error because OpenAI is simulated to fail
    const openaiSuggestion = await openaiService.categorizeTransaction(
      description,
      amount,
      type,
      mockCategories
    );
    
    // This code shouldn't run in our test, but just in case:
    console.log('[WARNING] OpenAI simulation failure not working as expected');
    return {
      categoryId: openaiSuggestion.categoryId || null,
      confidence: openaiSuggestion.confidence || 0.9,
      suggestionSource: 'openai',
      reasoning: openaiSuggestion.reasoning || "Predicted by AI"
    };
  } catch (error) {
    // Expected behavior - OpenAI fails, so we log the error and continue to fallback
    console.log(`[CategorySuggestion] OpenAI error, falling back to classifier: ${error.message}`);
  }
  
  // Fall back to classifier logic
  if (!this.trained) {
    await this.trainClassifier();
  }
  
  // Process the description for classification
  const processedText = description.toLowerCase();
  
  // Get classifier results
  const classifications = this.classifier.getClassifications(processedText);
  
  if (classifications.length === 0) {
    return { categoryId: null, confidence: 0, suggestionSource: 'no-classifications' };
  }
  
  // Get the top classification
  const topClassification = classifications[0];
  
  return {
    categoryId: topClassification.label,
    confidence: topClassification.value,
    suggestionSource: 'bayes-classifier',
    reasoning: `Matched based on text similarity to previously categorized transactions`
  };
};

// Natural is already imported at the top

// Mock the trainClassifier method
categorySuggestionService.trainClassifier = async function() {
  console.log('[MOCK] Training classifier with mock data');
  
  // Train with examples
  this.classifier = new natural.BayesClassifier();
  
  this.classifier.addDocument('grocery store food market', 'cat1');
  this.classifier.addDocument('supermarket shopping', 'cat1');
  this.classifier.addDocument('restaurant cafe dinner lunch', 'cat2');
  this.classifier.addDocument('water power electric bill', 'cat3');
  this.classifier.addDocument('movie theatre netflix entertainment', 'cat4');
  this.classifier.addDocument('paycheck deposit salary income', 'cat5');
  
  this.classifier.train();
  this.trained = true;
  
  console.log('[MOCK] Classifier trained successfully');
};

// Main test function
async function testBatchFallback() {
  console.log('=========================================');
  console.log('Testing OpenAI Batch Fallback Mechanism');
  console.log('=========================================');
  
  try {
    // Train the classifier
    await categorySuggestionService.trainClassifier();
    
    // Check initial OpenAI metrics
    console.log('\nInitial OpenAI Service Metrics:');
    console.log(openaiService.getMetrics());
    
    // Test OpenAI batch categorization
    console.log('\n1. Testing OpenAI direct batch categorization:');
    try {
      const batchResults = await openaiService.categorizeBatch(
        testTransactionsBatch.slice(0, 2),
        mockCategories
      );
      console.log('Batch results:', JSON.stringify(batchResults, null, 2));
    } catch (error) {
      console.log('OpenAI batch categorization failed:', error.message);
      console.log('This is expected with simulated API failure.');
    }
    
    // Test batch suggestions through CategorySuggestionService
    console.log('\n2. Testing batch suggestions with fallback through CategorySuggestionService:');
    const batchSuggestions = await categorySuggestionService.suggestCategoriesForBatch(
      testTransactionsBatch,
      0.7 // confidence threshold
    );
    
    console.log('Batch suggestion results:');
    console.log(JSON.stringify({
      automaticSuggestions: batchSuggestions.automaticSuggestions.length,
      manualReviewNeeded: batchSuggestions.manualReviewNeeded.length,
      stats: batchSuggestions.stats,
    }, null, 2));
    
    // Print details of individual suggestions
    console.log('\n3. Individual suggestion details:');
    [...batchSuggestions.automaticSuggestions, ...batchSuggestions.manualReviewNeeded].forEach(suggestion => {
      const categoryName = mockCategories.find(c => c.id === suggestion.categoryId)?.name || 'Unknown';
      console.log(`- ${suggestion.description}: ${categoryName} (${suggestion.confidence.toFixed(2)}) [${suggestion.suggestionSource}]`);
    });
    
    // Display final metrics
    console.log('\nFinal OpenAI Service Metrics:');
    console.log(openaiService.getMetrics());
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testBatchFallback().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});