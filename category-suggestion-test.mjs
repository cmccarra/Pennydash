/**
 * Test script for the enhanced category suggestion service
 */

import fetch from 'node-fetch';
import fs from 'fs';

// Utility function for making API requests
async function api(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`http://localhost:5000/api/${endpoint}`, options);
  const responseData = await response.json();
  
  if (!response.ok) {
    console.error(`API Error (${response.status}):`, responseData);
    throw new Error(`API Error: ${response.statusText}`);
  }
  
  return responseData;
}

// Utility function to load transactions from CSV
async function loadTestTransactions() {
  try {
    // First, try to get transactions from the API
    const transactions = await api('transactions');
    
    if (transactions.length > 0) {
      console.log(`Using ${transactions.length} existing transactions from the database`);
      return transactions;
    } else {
      // If no transactions exist, upload test transactions
      console.log('No transactions found, uploading test transactions...');
      return await uploadTestTransactions();
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
    throw error;
  }
}

// Upload test transactions if needed
async function uploadTestTransactions() {
  try {
    // Check if we have a CSV file to upload
    if (fs.existsSync('./test-transactions.csv')) {
      console.log('Uploading test-transactions.csv...');
      
      // Read the CSV file
      const csvData = fs.readFileSync('./test-transactions.csv', 'utf8');
      
      // Upload the transactions
      const uploadResult = await api('transactions/upload/csv', 'POST', { csvData });
      console.log(`Uploaded ${uploadResult.transactions.length} test transactions`);
      
      return uploadResult.transactions;
    } else if (fs.existsSync('./attached_assets/activity (1).csv')) {
      console.log('Uploading activity.csv from attached assets...');
      
      // Read the CSV file
      const csvData = fs.readFileSync('./attached_assets/activity (1).csv', 'utf8');
      
      // Upload the transactions
      const uploadResult = await api('transactions/upload/csv', 'POST', { csvData });
      console.log(`Uploaded ${uploadResult.transactions.length} test transactions from activity.csv`);
      
      return uploadResult.transactions;
    } else {
      console.log('No test transaction files found. Creating synthetic transactions...');
      
      // Create some test transactions
      const testTransactions = [
        { description: 'AMAZON.COM PAYMENT', amount: 56.78, date: '2025-03-01' },
        { description: 'COSTCO WHOLESALE', amount: 127.93, date: '2025-03-02' },
        { description: 'NETFLIX SUBSCRIPTION', amount: 19.99, date: '2025-03-03' },
        { description: 'STARBUCKS COFFEE', amount: 5.48, date: '2025-03-04' },
        { description: 'UBER RIDE', amount: 24.55, date: '2025-03-05' },
        { description: 'TARGET', amount: 87.62, date: '2025-03-06' },
        { description: 'SHELL OIL', amount: 45.23, date: '2025-03-07' },
        { description: 'TRADER JOE\'S', amount: 78.34, date: '2025-03-08' },
        { description: 'ATM WITHDRAWAL', amount: 100.00, date: '2025-03-09' },
        { description: 'SPOTIFY PREMIUM', amount: 9.99, date: '2025-03-10' }
      ];
      
      // Upload the transactions one by one
      const uploadedTransactions = [];
      for (const tx of testTransactions) {
        const result = await api('transactions', 'POST', tx);
        uploadedTransactions.push(result);
      }
      
      console.log(`Created ${uploadedTransactions.length} synthetic transactions`);
      return uploadedTransactions;
    }
  } catch (error) {
    console.error('Error uploading test transactions:', error);
    throw error;
  }
}

// Test getting a suggested category for a single transaction
async function testSingleSuggestion() {
  console.log('\n=== Testing Single Transaction Categorization ===');
  try {
    const sampleTransactions = [
      { description: 'AMAZON.COM PAYMENT', amount: 56.78 },
      { description: 'COSTCO WHOLESALE', amount: 127.93 },
      { description: 'NETFLIX SUBSCRIPTION', amount: 19.99 },
      { description: 'STARBUCKS COFFEE', amount: 5.48 },
      { description: 'UBER RIDE', amount: 24.55 }
    ];
    
    for (const tx of sampleTransactions) {
      console.log(`\nGetting suggestion for: "${tx.description}" ($${tx.amount})`);
      
      const result = await api(`suggestions/category?description=${encodeURIComponent(tx.description)}&amount=${tx.amount}`, 'GET');
      
      console.log(`Suggested category: ${result.categoryName || 'None'}`);
      console.log(`Confidence: ${result.confidence ? (result.confidence * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`Source: ${result.suggestionSource || 'N/A'}`);
      
      if (result.reasoning) {
        console.log(`Reasoning: ${result.reasoning}`);
      }
    }
  } catch (error) {
    console.error('Error testing single suggestion:', error);
  }
}

// Test getting suggestions for a batch of transactions
async function testBatchSuggestions() {
  console.log('\n=== Testing Batch Transaction Categorization ===');
  try {
    // Load or create test transactions
    const transactions = await loadTestTransactions();
    
    // Get uncategorized transactions
    const uncategorizedTransactions = transactions.filter(tx => !tx.categoryId);
    
    if (uncategorizedTransactions.length === 0) {
      console.log('No uncategorized transactions found. Using all transactions for testing...');
      // Use a slice of all transactions for testing if none are uncategorized
      const batchSize = Math.min(10, transactions.length);
      const testBatch = transactions.slice(0, batchSize);
      
      console.log(`\nTesting batch suggestion with ${testBatch.length} transactions`);
      
      // Get suggestions for the batch
      const result = await api('suggestions/batch', 'POST', {
        transactionIds: testBatch.map(tx => tx.id),
        confidenceThreshold: 0.7
      });
      
      displayBatchResults(result);
    } else {
      // Use uncategorized transactions for testing
      const batchSize = Math.min(10, uncategorizedTransactions.length);
      const testBatch = uncategorizedTransactions.slice(0, batchSize);
      
      console.log(`\nTesting batch suggestion with ${testBatch.length} uncategorized transactions`);
      
      // Get suggestions for the batch
      const result = await api('suggestions/batch', 'POST', {
        transactionIds: testBatch.map(tx => tx.id),
        confidenceThreshold: 0.7
      });
      
      displayBatchResults(result);
    }
  } catch (error) {
    console.error('Error testing batch suggestions:', error);
  }
}

// Helper function to display batch results
function displayBatchResults(result) {
  console.log('\nBatch Suggestion Results:');
  console.log('-------------------------');
  console.log(`Batch category: ${result.batchCategoryName || 'None'}`);
  console.log(`Average confidence: ${result.averageConfidence ? (result.averageConfidence * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`Needs review: ${result.needsReview ? 'Yes' : 'No'}`);
  
  if (result.confidenceLevels) {
    console.log('\nConfidence breakdown:');
    console.log(`- High (≥90%): ${result.confidenceLevels.high}`);
    console.log(`- Medium (70-89%): ${result.confidenceLevels.medium}`);
    console.log(`- Low (50-69%): ${result.confidenceLevels.low}`);
    console.log(`- Very low (<50%): ${result.confidenceLevels.veryLow}`);
  }
  
  if (result.topCategories && result.topCategories.length > 0) {
    console.log('\nTop categories:');
    result.topCategories.forEach(cat => {
      console.log(`- ${cat.category?.name || 'Unknown'}: ${cat.count} transactions (avg. confidence: ${(cat.avgConfidence * 100).toFixed(1)}%)`);
    });
  }
  
  if (result.suggestions && result.suggestions.length > 0) {
    console.log('\nIndividual suggestions:');
    result.suggestions.slice(0, 5).forEach(suggestion => {
      const confidenceStr = suggestion.confidence ? (suggestion.confidence * 100).toFixed(1) + '%' : 'N/A';
      const categoryName = suggestion.category?.name || 'Unknown';
      const source = suggestion.source || 'unknown';
      
      console.log(`- "${suggestion.transaction?.description || 'Unknown'}" → ${categoryName} (${confidenceStr}, source: ${source})`);
    });
    
    if (result.suggestions.length > 5) {
      console.log(`... and ${result.suggestions.length - 5} more suggestions`);
    }
  }
}

// Test applying suggestions to transactions
async function testApplySuggestions() {
  console.log('\n=== Testing Apply Suggestions ===');
  try {
    // Load or create test transactions
    const transactions = await loadTestTransactions();
    
    // Get uncategorized transactions
    const uncategorizedTransactions = transactions.filter(tx => !tx.categoryId);
    
    if (uncategorizedTransactions.length === 0) {
      console.log('No uncategorized transactions found for testing apply suggestions.');
      return;
    }
    
    // Use a small batch of uncategorized transactions
    const batchSize = Math.min(5, uncategorizedTransactions.length);
    const testBatch = uncategorizedTransactions.slice(0, batchSize);
    
    console.log(`\nGetting suggestions for ${testBatch.length} transactions`);
    
    // Get suggestions for the batch
    const suggestionResult = await api('suggestions/batch', 'POST', {
      transactionIds: testBatch.map(tx => tx.id),
      confidenceThreshold: 0.7
    });
    
    // Filter suggestions with sufficient confidence
    const highConfidenceSuggestions = suggestionResult.suggestions.filter(s => s.confidence >= 0.7);
    
    if (highConfidenceSuggestions.length === 0) {
      console.log('No high confidence suggestions found for testing apply suggestions.');
      return;
    }
    
    console.log(`\nApplying ${highConfidenceSuggestions.length} high confidence suggestions`);
    
    // Prepare data for the apply API
    const applyData = {
      transactionUpdates: highConfidenceSuggestions.map(s => ({
        transactionId: s.transactionId,
        categoryId: s.categoryId
      }))
    };
    
    // Apply the suggestions
    const applyResult = await api('suggestions/apply', 'POST', applyData);
    
    console.log(`\nApplied suggestions to ${applyResult.updatedCount} transactions`);
    console.log('Updated transactions:', applyResult.updatedTransactions.slice(0, 3));
    
    if (applyResult.updatedTransactions.length > 3) {
      console.log(`... and ${applyResult.updatedTransactions.length - 3} more`);
    }
  } catch (error) {
    console.error('Error testing apply suggestions:', error);
  }
}

// Main test function
async function runTests() {
  console.log('Starting category suggestion service tests...');
  
  try {
    // Test getting suggestions for individual transactions
    await testSingleSuggestion();
    
    // Test getting suggestions for a batch of transactions
    await testBatchSuggestions();
    
    // Test applying suggestions to transactions
    await testApplySuggestions();
    
    console.log('\nCategory suggestion service tests completed successfully!');
  } catch (error) {
    console.error('Error running tests:', error);
  }
}

// Run the tests
runTests();