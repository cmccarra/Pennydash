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
    description: "SALARY DEPOSIT",
    amount: 2508.42,
    type: "income"
  }
];

// Mock the trainClassifier method since we can't connect to the database
categorySuggestionService.trainClassifier = async function() {
  console.log('[MOCK] Training classifier with mock data');
  
  // Train with some basic examples
  this.classifier = new (require('natural')).BayesClassifier();
  
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
    
    // Test fallback categorization through CategorySuggestionService
    console.log('\nTesting fallback categorization through CategorySuggestionService:');
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
    }
    
    // Display final metrics
    console.log('\nFinal OpenAI Service Metrics:');
    console.log(openaiService.getMetrics());
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testFallbackMechanism().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});