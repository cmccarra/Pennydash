/**
 * Test script for the batch summary generation functionality
 */

// Use CommonJS for Node.js built-in modules
const fs = require('fs');
const path = require('path');

// Use dynamic import for ESM modules
const fetchData = async (url, options = {}) => {
  const fetch = (await import('node-fetch')).default;
  return fetch(url, options);
};

// Configuration
const API_BASE_URL = 'http://localhost:5000/api';
const TEST_TRANSACTION_FILE = 'test-transactions.csv';

/**
 * Main test function
 */
async function runBatchSummaryTest() {
  try {
    console.log('Starting batch summary test...');
    
    // Step 1: Create a new upload
    console.log('Step 1: Creating a new upload');
    const uploadId = await createNewUpload();
    console.log(`Created upload with ID: ${uploadId}`);
    
    // Step 2: Process the upload and add some test transactions
    console.log('Step 2: Processing upload and adding test transactions');
    await processUpload(uploadId);
    const transactionIds = await addTestTransactions(uploadId);
    console.log(`Added ${transactionIds.length} test transactions`);
    
    // Step 3: Create a batch with the test transactions
    console.log('Step 3: Creating a batch with test transactions');
    const batch = await createBatch(uploadId, transactionIds);
    console.log(`Created batch with ID: ${batch.id}, Title: ${batch.title}`);
    
    // Step 4: Retrieve the batch to see if a summary was generated
    console.log('Step 4: Retrieving the batch to check summary');
    const retrievedBatch = await getBatchDetails(uploadId, batch.id);
    console.log('Batch details:');
    console.log(`- Title: ${retrievedBatch.title}`);
    console.log(`- Transaction Count: ${retrievedBatch.transactions.length}`);
    if (retrievedBatch.statistics) {
      console.log(`- Total Amount: ${retrievedBatch.statistics.totalAmount}`);
      console.log(`- Dominant Merchant: ${retrievedBatch.statistics.dominantMerchant}`);
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

/**
 * Create a new upload
 * @returns {Promise<string>} Upload ID
 */
async function createNewUpload() {
  // For simplicity, we'll skip the file upload and create a dummy upload directly
  // since our focus is on testing the batch summary functionality
  
  const response = await fetchData(`${API_BASE_URL}/uploads/dummy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Test Upload for Batch Summary',
      source: 'Test',
      type: 'csv'
    })
  });
  
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse upload response: ${error.message}`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to create dummy upload: ${data.error || response.statusText}`);
  }
  return data.uploadId;
}

/**
 * Process an upload
 * @param {string} uploadId - The upload ID
 * @returns {Promise<void>}
 */
async function processUpload(uploadId) {
  const response = await fetchData(`${API_BASE_URL}/uploads/${uploadId}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountName: 'Test Account',
      accountType: 'checking'
    })
  });
  
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse process upload response: ${error.message}`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to process upload: ${data.error || response.statusText}`);
  }
  
  return data;
}

/**
 * Add test transactions to an upload
 * @param {string} uploadId - The upload ID
 * @returns {Promise<Array<string>>} Transaction IDs
 */
async function addTestTransactions(uploadId) {
  // Sample test transactions
  const testTransactions = [
    {
      date: '2025-03-01',
      description: 'Coffee Shop - Morning Coffee',
      amount: 5.75,
      type: 'expense',
      merchant: 'Starbucks',
      uploadId
    },
    {
      date: '2025-03-02',
      description: 'Coffee Shop - Afternoon Coffee',
      amount: 4.50,
      type: 'expense',
      merchant: 'Starbucks',
      uploadId
    },
    {
      date: '2025-03-03',
      description: 'Coffee Shop - Morning Breakfast',
      amount: 12.99,
      type: 'expense',
      merchant: 'Starbucks',
      uploadId
    },
    {
      date: '2025-03-05',
      description: 'Grocery Shopping',
      amount: 78.45,
      type: 'expense',
      merchant: 'Whole Foods',
      uploadId
    },
    {
      date: '2025-03-10',
      description: 'Salary Deposit',
      amount: 3500.00,
      type: 'income',
      merchant: 'Employer Inc',
      uploadId
    }
  ];
  
  // Add transactions one by one and collect their IDs
  const transactionIds = [];
  for (const transactionData of testTransactions) {
    const response = await fetchData(`${API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transactionData)
    });
    
    let transaction;
    try {
      transaction = await response.json();
    } catch (error) {
      throw new Error(`Failed to parse transaction response: ${error.message}`);
    }
    
    if (!response.ok) {
      throw new Error(`Failed to add transaction: ${transaction.error || response.statusText}`);
    }
    transactionIds.push(transaction.id);
  }
  
  return transactionIds;
}

/**
 * Create a batch with transactions
 * @param {string} uploadId - The upload ID
 * @param {Array<string>} transactionIds - Transaction IDs to include in the batch
 * @returns {Promise<Object>} Created batch
 */
async function createBatch(uploadId, transactionIds) {
  const response = await fetchData(`${API_BASE_URL}/uploads/${uploadId}/batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Untitled Batch', // Let the server generate a title
      transactionIds,
      type: 'custom'
    })
  });
  
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse create batch response: ${error.message}`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to create batch: ${data.error || response.statusText}`);
  }
  return data.batch;
}

/**
 * Get batch details
 * @param {string} uploadId - The upload ID
 * @param {string} batchId - The batch ID
 * @returns {Promise<Object>} Batch details
 */
async function getBatchDetails(uploadId, batchId) {
  // For API endpoints that expect upload_timestamp format, convert UUID to string ID
  const stringUploadId = `upload_${Date.now()}`;
  
  // Try to get the batch directly first
  const response = await fetchData(`${API_BASE_URL}/transactions/batches/${batchId}`);
  
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse batch details response: ${error.message}`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to get batch details: ${data.error || response.statusText}`);
  }
  
  return data;
}

// Run the test
runBatchSummaryTest().catch(console.error);