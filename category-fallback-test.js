/**
 * Simple test for the OpenAI fallback mechanisms without database dependencies
 */

// Set this to true to simulate an OpenAI API failure
process.env.SIMULATE_OPENAI_FAILURE = 'true';

// Mock the sequelize module's getModels function
const sequelizeModule = require('./src/server/db/sequelize');
sequelizeModule.getModels = function() {
  return {
    Transaction: { 
      findAll: async () => []
    },
    Category: {
      findAll: async () => []
    }
  };
};

// Import services
const openaiService = require('./src/server/services/openai');
const categorySuggestionService = require('./src/server/services/categorySuggestion');

// Flag to enable batch testing
const TEST_BATCH_MODE = true;

// Mock categories for testing
const mockCategories = [
  { id: 'cat1', name: 'Groceries', type: 'expense' },
  { id: 'cat2', name: 'Dining Out', type: 'expense' },
  { id: 'cat3', name: 'Utilities', type: 'expense' },
  { id: 'cat4', name: 'Entertainment', type: 'expense' },
  { id: 'cat5', name: 'Salary', type: 'income' }
];

// Test transactions
const testTransactions = [
  {
    description: "GROCERY OUTLET MARKET",
    amount: 43.27,
    type: "expense"
  },
  {
    description: "NETFLIX SUBSCRIPTION",
    amount: 12.99,
    type: "expense"
  },
  {
    description: "SALARY DEPOSIT",
    amount: 2508.42,
    type: "income"
  },
  {
    description: "POWER & ELECTRIC BILL",
    amount: 85.33,
    type: "expense"
  }
];

// Mock the trainClassifier method since we can't connect to the database
categorySuggestionService.trainClassifier = async function() {
  console.log('[MOCK] Training classifier with mock data');
  
  // Train with some basic examples
  this.classifier = new (require('natural')).BayesClassifier();
  
  // Add training documents that match our test transactions
  this.classifier.addDocument('grocery store food market outlet', 'cat1');
  this.classifier.addDocument('supermarket shopping groceries food', 'cat1');
  this.classifier.addDocument('restaurant cafe dinner lunch', 'cat2');
  this.classifier.addDocument('water power electric bill utility', 'cat3');
  this.classifier.addDocument('movie theatre netflix subscription entertainment', 'cat4');
  this.classifier.addDocument('paycheck deposit salary income payment', 'cat5');
  
  this.classifier.train();
  this.trained = true;
  
  console.log('[MOCK] Classifier trained successfully');
};

// Test functions for both individual and batch processing
async function testIndividualCategorization() {
  console.log('\nTesting fallback categorization through CategorySuggestionService (Individual Mode):');
  
  // Statistics for verification
  let bayesClassifierCount = 0;
  let openaiCount = 0;
  let otherCount = 0;
  
  // Store results for summary
  const results = [];
  
  for (const transaction of testTransactions) {
    console.log(`\nCategorizing: "${transaction.description}" ($${transaction.amount}, ${transaction.type})`);
    
    const suggestion = await categorySuggestionService.suggestCategory(
      transaction.description,
      transaction.amount,
      transaction.type
    );
    
    // Find category name if we have an ID
    let categoryName = "Unknown";
    if (suggestion.categoryId) {
      const category = mockCategories.find(c => c.id === suggestion.categoryId);
      if (category) categoryName = category.name;
    }
    
    console.log({
      categoryName,
      categoryId: suggestion.categoryId,
      confidence: suggestion.confidence,
      source: suggestion.suggestionSource
    });
    
    // Track source for verification
    if (suggestion.suggestionSource === 'bayes-classifier') {
      bayesClassifierCount++;
    } else if (suggestion.suggestionSource === 'openai' || suggestion.suggestionSource === 'openai-cache') {
      openaiCount++;
    } else {
      otherCount++;
    }
    
    // Store result for summary
    results.push({
      description: transaction.description,
      categoryName,
      confidence: suggestion.confidence,
      source: suggestion.suggestionSource
    });
  }
  
  // Verify fallback is working properly
  console.log('\nIndividual Fallback Test Results:');
  console.log(`- Transactions processed: ${testTransactions.length}`);
  console.log(`- OpenAI categorizations: ${openaiCount}`);
  console.log(`- Bayes classifier fallbacks: ${bayesClassifierCount}`);
  console.log(`- Other sources: ${otherCount}`);
  
  // Display result summary
  console.log('\nTransaction Categorization Summary:');
  results.forEach(r => {
    console.log(`- ${r.description}: ${r.categoryName} (${r.confidence.toFixed(2)}) [${r.source}]`);
  });
  
  return {
    bayesClassifierCount,
    openaiCount,
    otherCount,
    results
  };
}

// Test batch categorization
async function testBatchCategorization() {
  console.log('\nTesting batch categorization with fallback:');
  
  // Add IDs to test transactions for batch processing
  const batchTransactions = testTransactions.map((tx, index) => ({
    ...tx,
    id: `txn${index + 1}`
  }));
  
  // Use the batch suggestion service
  console.log(`\n1. Testing OpenAI direct batch categorization:`);
  try {
    const batchResults = await openaiService.categorizeBatch(batchTransactions, mockCategories);
    console.log('Batch results:', JSON.stringify(batchResults, null, 2));
  } catch (error) {
    console.log('OpenAI batch categorization failed:', error.message);
    console.log('This is expected if OpenAI API failure is simulated.');
  }
  
  // Test through the category suggestion service
  console.log(`\n2. Testing batch suggestions with fallback through CategorySuggestionService:`);
  
  // Mock the _processSuggestCategoriesForBatch method since we can't connect to the database
  const originalMethod = categorySuggestionService._processSuggestCategoriesForBatch;
  categorySuggestionService._processSuggestCategoriesForBatch = async function(transactions, confidenceThreshold = 0.7) {
    console.log(`[MOCK] Processing batch suggestions for ${transactions.length} transactions`);
    
    // Process each transaction in the batch
    const suggestions = [];
    
    for (const transaction of transactions) {
      console.log(`[MOCK] Suggesting category for: "${transaction.description}" (${transaction.type}, $${transaction.amount})`);
      
      // Call the individual suggestion method
      const suggestion = await this.suggestCategory(
        transaction.description, 
        transaction.amount,
        transaction.type || 'expense'
      );
      
      // Add to results
      suggestions.push({
        transactionId: transaction.id,
        categoryId: suggestion.categoryId,
        confidence: suggestion.confidence,
        source: suggestion.suggestionSource,
        needsReview: suggestion.confidence < confidenceThreshold
      });
    }
    
    // Calculate statistics
    const autoCount = suggestions.filter(s => !s.needsReview).length;
    const reviewCount = suggestions.filter(s => s.needsReview).length;
    const totalConfidence = suggestions.reduce((sum, s) => sum + s.confidence, 0);
    const avgConfidence = suggestions.length > 0 ? totalConfidence / suggestions.length : 0;
    
    return {
      suggestions,
      stats: {
        total: suggestions.length,
        automatic: autoCount,
        manualReview: reviewCount,
        averageConfidence: avgConfidence,
        percentAutomatic: suggestions.length > 0 ? (autoCount / suggestions.length) * 100 : 0
      },
      automaticSuggestions: autoCount,
      manualReviewNeeded: reviewCount
    };
  };
  
  try {
    // Call batch suggestion method
    const batchSuggestionResults = await categorySuggestionService.suggestCategoriesForBatch(
      batchTransactions,
      0.7 // confidence threshold
    );
    
    console.log('Batch suggestion results:');
    console.log(JSON.stringify(batchSuggestionResults, null, 2));
    
    // Analyze sources
    let batchBayesCount = 0;
    let batchOpenaiCount = 0;
    let batchOtherCount = 0;
    
    // Count suggestions by source
    batchSuggestionResults.suggestions.forEach(suggestion => {
      if (suggestion.source === 'bayes-classifier') {
        batchBayesCount++;
      } else if (suggestion.source === 'openai' || suggestion.source === 'openai-cache') {
        batchOpenaiCount++;
      } else {
        batchOtherCount++;
      }
    });
    
    // Display batch fallback verification
    console.log('\n3. Individual suggestion details:');
    batchSuggestionResults.suggestions.forEach(s => {
      // Find category name if we have an ID
      let categoryName = "Unknown";
      if (s.categoryId) {
        const category = mockCategories.find(c => c.id === s.categoryId);
        if (category) categoryName = category.name;
      }
      
      // Find transaction
      const tx = batchTransactions.find(t => t.id === s.transactionId);
      
      console.log(`- ${tx?.description}: ${categoryName} (${s.confidence.toFixed(2)}) [${s.source}]`);
    });
    
    // Restore original method
    categorySuggestionService._processSuggestCategoriesForBatch = originalMethod;
    
    return {
      bayesClassifierCount: batchBayesCount,
      openaiCount: batchOpenaiCount,
      otherCount: batchOtherCount,
      results: batchSuggestionResults.suggestions
    };
  } catch (error) {
    console.error('Batch categorization error:', error);
    
    // Restore original method
    categorySuggestionService._processSuggestCategoriesForBatch = originalMethod;
    
    return {
      bayesClassifierCount: 0,
      openaiCount: 0,
      otherCount: 0,
      results: [],
      error: error.message
    };
  }
}

// Main test function
async function testFallbackMechanism() {
  console.log('=========================================');
  console.log('Testing OpenAI Fallback Mechanisms');
  console.log('=========================================');
  
  try {
    // Train the classifier with mock data
    await categorySuggestionService.trainClassifier();
    
    // Check OpenAI metrics before starting
    console.log('\nInitial OpenAI Service Metrics:');
    console.log(openaiService.getMetrics());
    
    // Test direct OpenAI categorization
    console.log('\nTesting direct OpenAI categorization first:');
    try {
      const openaiResult = await openaiService.categorizeTransaction(
        testTransactions[0].description,
        testTransactions[0].amount, 
        testTransactions[0].type,
        mockCategories
      );
      console.log('OpenAI Result:', openaiResult);
    } catch (error) {
      console.log('OpenAI direct test failed:', error.message);
      console.log('This is expected if you have no OpenAI credits or API failure is simulated.');
    }
    
    // Check if we're currently rate limited
    const isRateLimited = openaiService.isRateLimited();
    console.log(`\nIs OpenAI currently rate limited? ${isRateLimited}`);
    
    // Test individual or batch mode based on flag
    let individualResults, batchResults;
    
    // Always run individual tests
    individualResults = await testIndividualCategorization();
    
    // Run batch tests if enabled
    if (TEST_BATCH_MODE) {
      batchResults = await testBatchCategorization();
    }
    
    // Display final metrics
    console.log('\nFinal OpenAI Service Metrics:');
    console.log(openaiService.getMetrics());
    
    // Verify that OpenAI fallback works as expected when simulating failures
    const simulatingFailure = process.env.SIMULATE_OPENAI_FAILURE === 'true';
    
    if (simulatingFailure) {
      console.log('\nVerifying fallback behavior with simulation enabled:');
      
      // Individual mode verification
      if (individualResults.openaiCount > 0) {
        console.log('\n⚠️ WARNING: OpenAI simulation failure not working correctly in individual mode!');
        console.log('The fallback to Bayes classifier is not working as expected.');
        console.log('With SIMULATE_OPENAI_FAILURE=true, all categorizations should use the Bayes classifier.');
      } else if (individualResults.bayesClassifierCount === testTransactions.length) {
        console.log('\n✅ SUCCESS: OpenAI individual fallback is working properly!');
        console.log('All individual transactions were categorized using the Bayes classifier, as expected with simulated failures.');
      }
      
      // Batch mode verification
      if (TEST_BATCH_MODE) {
        if (batchResults.openaiCount > 0) {
          console.log('\n⚠️ WARNING: OpenAI simulation failure not working correctly in batch mode!');
          console.log('The fallback to Bayes classifier is not working as expected for batch processing.');
        } else if (batchResults.bayesClassifierCount === testTransactions.length) {
          console.log('\n✅ SUCCESS: OpenAI batch fallback is working properly!');
          console.log('All batch transactions were categorized using the Bayes classifier, as expected with simulated failures.');
        }
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testFallbackMechanism().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});