/**
 * Test script for the category suggestion service with fallback functionality
 * ES Modules version
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Import services
const openaiService = require('./src/server/services/openai');
const categorySuggestionService = require('./src/server/services/categorySuggestion');

// Test transactions
const testTransactions = [
  {
    description: "WALMART GROCERIES",
    amount: 72.54,
    type: "expense"
  },
  {
    description: "AMAZON PRIME MEMBERSHIP",
    amount: 14.99,
    type: "expense"
  },
  {
    description: "SALARY PAYMENT",
    amount: 3205.67,
    type: "income"
  },
  {
    description: "SHELL GAS STATION",
    amount: 45.88,
    type: "expense"
  },
  {
    description: "CHILIS RESTAURANT",
    amount: 37.42,
    type: "expense"
  }
];

// Mock categories for testing
const mockCategories = [
  { id: 'cat1', name: 'Groceries', type: 'expense' },
  { id: 'cat2', name: 'Dining Out', type: 'expense' },
  { id: 'cat3', name: 'Utilities', type: 'expense' },
  { id: 'cat4', name: 'Entertainment', type: 'expense' },
  { id: 'cat5', name: 'Transportation', type: 'expense' },
  { id: 'cat6', name: 'Salary', type: 'income' },
  { id: 'cat7', name: 'Subscriptions', type: 'expense' }
];

// Check if OpenAI simulation is enabled
const isSimulating = process.env.SIMULATE_OPENAI_FAILURE === 'true';
console.log(`Simulation mode: ${isSimulating ? 'ENABLED' : 'DISABLED'}`);

// Mock the trainClassifier method since we can't connect to the database
categorySuggestionService.trainClassifier = async function() {
  console.log('[MOCK] Training classifier with test data');
  
  // Train with some basic examples
  this.classifier = new (require('natural')).BayesClassifier();
  
  this.classifier.addDocument('walmart grocery supermarket food', 'cat1');
  this.classifier.addDocument('target publix shopping food market', 'cat1');
  this.classifier.addDocument('restaurant dining food chilis mcdonalds wendys', 'cat2');
  this.classifier.addDocument('power water gas utility bill', 'cat3');
  this.classifier.addDocument('netflix hulu spotify subscription streaming', 'cat4');
  this.classifier.addDocument('amazon prime membership subscription', 'cat7');
  this.classifier.addDocument('gas fuel shell chevron', 'cat5');
  this.classifier.addDocument('salary paycheck deposit income', 'cat6');
  
  this.classifier.train();
  this.trained = true;
  
  console.log('[MOCK] Classifier trained successfully');
};

// Test individual categorization
async function testIndividualCategorization() {
  console.log('\n=== Testing Individual Transaction Categorization ===\n');
  
  // Train the classifier first
  await categorySuggestionService.trainClassifier();
  
  // Track statistics
  let openaiCount = 0;
  let bayesCount = 0;
  let otherCount = 0;
  
  for (const transaction of testTransactions) {
    console.log(`\nCategorizing: "${transaction.description}" ($${transaction.amount}, ${transaction.type})`);
    
    try {
      // Get suggestion
      const suggestion = await categorySuggestionService.suggestCategory(
        transaction.description,
        transaction.amount,
        transaction.type
      );
      
      // Find category name
      let categoryName = "Unknown";
      if (suggestion.categoryId) {
        const category = mockCategories.find(c => c.id === suggestion.categoryId);
        if (category) categoryName = category.name;
      }
      
      // Track source
      if (suggestion.suggestionSource === 'openai' || suggestion.suggestionSource === 'openai-cache') {
        openaiCount++;
      } else if (suggestion.suggestionSource === 'bayes-classifier') {
        bayesCount++;
      } else {
        otherCount++;
      }
      
      // Display result
      console.log({
        categoryName,
        categoryId: suggestion.categoryId,
        confidence: suggestion.confidence,
        source: suggestion.suggestionSource,
        reasoning: suggestion.reasoning || 'N/A'
      });
    } catch (error) {
      console.error(`Error categorizing transaction: ${error.message}`);
    }
  }
  
  // Display stats
  console.log('\n=== Categorization Statistics ===');
  console.log(`Total transactions: ${testTransactions.length}`);
  console.log(`OpenAI categorizations: ${openaiCount}`);
  console.log(`Bayes classifier categorizations: ${bayesCount}`);
  console.log(`Other sources: ${otherCount}`);
  
  return {
    total: testTransactions.length,
    openai: openaiCount,
    bayes: bayesCount,
    other: otherCount
  };
}

// Run all tests
async function runTests() {
  try {
    console.log('================================================');
    console.log('Category Suggestion Service Test');
    console.log('================================================');
    
    // Check if OpenAI API is available
    try {
      console.log('\nChecking OpenAI API status...');
      await openaiService.categorizeTransaction('Test transaction', 10.00, 'expense', mockCategories);
      console.log('OpenAI API is available and working');
    } catch (error) {
      console.log(`OpenAI API check failed: ${error.message}`);
      console.log('(This is expected if simulating API failures)');
    }
    
    // Test individual categorization
    await testIndividualCategorization();
    
    // Get final OpenAI metrics
    console.log('\n=== OpenAI Service Metrics ===');
    console.log(openaiService.getMetrics());
    
  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

// Run the tests
runTests().catch(console.error);