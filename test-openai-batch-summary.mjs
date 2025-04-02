/**
 * Test script for the OpenAI batch summary functionality
 * This script tests the direct OpenAI integration endpoint
 * to verify proper summaries are generated for different transaction types
 */

// Using dynamic import for node-fetch (ES module)
// Make this file an ES module
import fetch from 'node-fetch';
const BASE_URL = 'http://localhost:5000/api';

async function testOpenAIBatchSummary() {
  console.log('Testing OpenAI batch summary generation...');
  
  // Test cases
  const testCases = [
    {
      name: 'New York Trip',
      transactions: [
        { 
          date: '2025-03-01', 
          description: 'Flight to New York', 
          amount: 450.75, 
          type: 'expense', 
          merchant: 'United Airlines' 
        },
        { 
          date: '2025-03-01', 
          description: 'Travel Insurance', 
          amount: 85.50, 
          type: 'expense', 
          merchant: 'Allianz' 
        },
        { 
          date: '2025-03-02', 
          description: 'Hotel in New York', 
          amount: 324.50, 
          type: 'expense', 
          merchant: 'Hilton Hotels' 
        },
        { 
          date: '2025-03-02', 
          description: 'Taxi from JFK Airport', 
          amount: 65.99, 
          type: 'expense', 
          merchant: 'Yellow Cab' 
        },
        { 
          date: '2025-03-03', 
          description: 'Dinner at Per Se', 
          amount: 210.25, 
          type: 'expense', 
          merchant: 'Per Se Restaurant'
        }
      ]
    },
    {
      name: 'Amazon Purchases',
      transactions: [
        { 
          date: '2025-03-10', 
          description: 'Amazon - Kindle Books', 
          amount: 29.99, 
          type: 'expense', 
          merchant: 'Amazon' 
        },
        { 
          date: '2025-03-11', 
          description: 'Amazon - Kitchen Supplies', 
          amount: 54.75, 
          type: 'expense', 
          merchant: 'Amazon' 
        },
        { 
          date: '2025-03-12', 
          description: 'Amazon Prime Membership', 
          amount: 14.99, 
          type: 'expense', 
          merchant: 'Amazon' 
        }
      ]
    },
    {
      name: 'Mixed Transactions',
      transactions: [
        { 
          date: '2025-03-15', 
          description: 'Grocery Shopping', 
          amount: 87.65, 
          type: 'expense', 
          merchant: 'Whole Foods' 
        },
        { 
          date: '2025-03-16', 
          description: 'Gas Station', 
          amount: 45.20, 
          type: 'expense', 
          merchant: 'Shell' 
        },
        { 
          date: '2025-03-17', 
          description: 'Monthly Rent', 
          amount: 1500.00, 
          type: 'expense', 
          merchant: 'Property Management LLC' 
        },
        { 
          date: '2025-03-18', 
          description: 'Internet Bill', 
          amount: 79.99, 
          type: 'expense', 
          merchant: 'Comcast' 
        }
      ]
    },
    {
      name: 'London Business Trip',
      transactions: [
        {
          date: '2025-04-01',
          description: 'Flight to London',
          amount: 850.50,
          type: 'expense',
          merchant: 'British Airways'
        },
        {
          date: '2025-04-01',
          description: 'Business Travel Insurance',
          amount: 120.75,
          type: 'expense',
          merchant: 'AXA Insurance'
        },
        {
          date: '2025-04-02',
          description: 'London Hotel - Business Center',
          amount: 425.00,
          type: 'expense',
          merchant: 'Marriott Hotels'
        },
        {
          date: '2025-04-02',
          description: 'Taxi to Business Meeting',
          amount: 35.25,
          type: 'expense',
          merchant: 'London Black Cab'
        },
        {
          date: '2025-04-03',
          description: 'Client Dinner',
          amount: 187.50,
          type: 'expense',
          merchant: 'The Ivy Restaurant'
        }
      ]
    }
  ];
  
  // Run tests sequentially
  for (const testCase of testCases) {
    console.log(`\nTesting case: ${testCase.name}`);
    await testSummaryGeneration(testCase.name, testCase.transactions);
  }
  
  console.log('\nOpenAI batch summary tests completed');
}

/**
 * Test OpenAI summary generation for a specific set of transactions
 * @param {string} testName - Name of the test case
 * @param {Array} transactions - Transactions to test
 */
async function testSummaryGeneration(testName, transactions) {
  try {
    console.log(`Sending ${transactions.length} transactions for summary...`);
    
    const response = await fetch(`${BASE_URL}/transactions/test/openai-batch-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ transactions })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`SUCCESS - ${testName}:`);
      console.log(`Generated summary: "${result.summary}"`);
      
      // Color coding - green for success, red for errors
      const resultColor = response.ok ? '\x1b[32m' : '\x1b[31m';
      console.log(`${resultColor}Status: ${response.status} ${response.statusText}\x1b[0m`);
    } else {
      console.error(`ERROR - ${testName}:`);
      console.error(result);
    }
    
    return result;
  } catch (error) {
    console.error(`Error testing "${testName}" case:`, error.message);
  }
}

// Run tests
testOpenAIBatchSummary().catch(error => {
  console.error('Test failed:', error);
});