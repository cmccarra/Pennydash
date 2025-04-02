/**
 * Test script for the batch summary regeneration functionality
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

/**
 * Main test function
 */
async function runRegenerateSummaryTest() {
  try {
    console.log('Starting batch summary regeneration test...');
    
    // Step 1: Create a new upload
    console.log('Step 1: Creating a new upload');
    const uploadId = await createNewUpload();
    console.log(`Created upload with ID: ${uploadId}`);
    
    // Step 2: Process the upload and add test transactions
    console.log('Step 2: Processing upload and adding test transactions');
    await processUpload(uploadId);
    const transactionIds = await addTestTransactions(uploadId);
    console.log(`Added ${transactionIds.length} test transactions`);
    
    // Step 3: Create a batch with the test transactions
    console.log('Step 3: Creating a batch with test transactions');
    const batch = await createBatch(uploadId, transactionIds);
    console.log(`Created batch with ID: ${batch.id}, Title: ${batch.title}`);
    
    // Step 4: Retrieve the original batch details
    console.log('Step 4: Retrieving the original batch details');
    const originalBatch = await getBatchDetails(uploadId, batch.id);
    console.log('Original batch details:');
    console.log(`- Title: ${originalBatch.title}`);
    
    // Step 5: Regenerate the batch summary
    console.log('Step 5: Regenerating the batch summary');
    const regeneratedSummary = await regenerateBatchSummary(uploadId, batch.id);
    console.log('Regenerated summary:');
    console.log(`- Old title: ${regeneratedSummary.oldTitle}`);
    console.log(`- New title: ${regeneratedSummary.newTitle}`);
    
    // Step 6: Retrieve the updated batch details
    console.log('Step 6: Retrieving the updated batch details');
    const updatedBatch = await getBatchDetails(uploadId, batch.id);
    console.log('Updated batch details:');
    console.log(`- Title: ${updatedBatch.title}`);
    
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
  
  const response = await fetchData(`${API_BASE_URL}/uploads/dummy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Test Upload for Batch Summary Regeneration',
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
  // Sample test transactions - all related to a New York trip
  const testTransactions = [
    {
      date: '2025-03-01',
      description: 'Flight to New York',
      amount: 450.75,
      type: 'expense',
      merchant: 'United Airlines',
      uploadId
    },
    {
      date: '2025-03-01',
      description: 'Travel Insurance',
      amount: 85.50,
      type: 'expense',
      merchant: 'Allianz',
      uploadId
    },
    {
      date: '2025-03-02',
      description: 'Hotel in New York',
      amount: 324.50,
      type: 'expense',
      merchant: 'Hilton Hotels',
      uploadId
    },
    {
      date: '2025-03-02',
      description: 'Taxi from JFK Airport',
      amount: 65.99,
      type: 'expense',
      merchant: 'Yellow Cab',
      uploadId
    },
    {
      date: '2025-03-03',
      description: 'New York City Pass',
      amount: 129.00,
      type: 'expense',
      merchant: 'NYC Tourism',
      uploadId
    },
    {
      date: '2025-03-03',
      description: 'Empire State Building Entry',
      amount: 45.73,
      type: 'expense',
      merchant: 'Empire State Building',
      uploadId
    },
    {
      date: '2025-03-04',
      description: 'MoMA Museum Ticket',
      amount: 25.00,
      type: 'expense',
      merchant: 'Museum of Modern Art',
      uploadId
    },
    {
      date: '2025-03-04',
      description: 'Lunch in Central Park',
      amount: 32.45,
      type: 'expense',
      merchant: 'Central Park Cafe',
      uploadId
    },
    {
      date: '2025-03-05',
      description: 'Broadway Show Tickets',
      amount: 178.45,
      type: 'expense',
      merchant: 'Ticketmaster',
      uploadId
    },
    {
      date: '2025-03-05',
      description: 'Dinner before show',
      amount: 120.00,
      type: 'expense',
      merchant: 'Le Bernardin',
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
  // Using the correct batch details endpoint that includes the uploadId
  const response = await fetchData(`${API_BASE_URL}/transactions/uploads/${uploadId}/batches/${batchId}`);
  
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

/**
 * Regenerate batch summary
 * @param {string} uploadId - The upload ID
 * @param {string} batchId - The batch ID
 * @returns {Promise<Object>} Regeneration result
 */
async function regenerateBatchSummary(uploadId, batchId) {
  const response = await fetchData(`${API_BASE_URL}/transactions/uploads/${uploadId}/batches/${batchId}/regenerate-summary`, {
    method: 'POST'
  });
  
  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse regenerate summary response: ${error.message}`);
  }
  
  if (!response.ok) {
    throw new Error(`Failed to regenerate batch summary: ${data.error || response.statusText}`);
  }
  
  return data;
}

// Run the test
runRegenerateSummaryTest().catch(console.error);