// API test script
const API_URL = 'http://localhost:5000/api';

// Helper function to make API requests
const fetchData = async (endpoint, method = 'GET', data = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return method === 'DELETE' && response.status === 204 
      ? { success: true } 
      : await response.json();
  } catch (error) {
    console.error(`API Error (${method} ${endpoint}):`, error);
    return { error: error.message };
  }
};

// Test batch categorize
const testBatchCategorize = async () => {
  console.log('Testing batch categorization...');
  
  // 1. Get transactions
  const transactions = await fetchData('/transactions');
  if (transactions.error) {
    console.error('Failed to fetch transactions:', transactions.error);
    return;
  }
  
  if (transactions.length === 0) {
    console.log('No transactions found to test with');
    return;
  }
  
  console.log(`Found ${transactions.length} transactions`);
  
  // 2. Get categories
  const categories = await fetchData('/categories');
  if (categories.error) {
    console.error('Failed to fetch categories:', categories.error);
    return;
  }
  
  if (categories.length === 0) {
    console.log('No categories found to test with');
    return;
  }
  
  console.log(`Found ${categories.length} categories`);
  
  // Select first 2 transactions for testing
  const transactionIds = transactions.slice(0, 2).map(t => t.id);
  
  // Select a category to apply
  const categoryId = categories[0].id;
  
  console.log(`Applying category ID ${categoryId} to transaction IDs: ${transactionIds.join(', ')}`);
  
  // 3. Apply batch categorization
  const result = await fetchData('/transactions/batch-categorize', 'POST', {
    transactionIds,
    categoryId
  });
  
  if (result.error) {
    console.error('Batch categorization failed:', result.error);
  } else {
    console.log('Batch categorization successful:', result);
  }
  
  // 4. Verify the result
  const updatedTransactions = await fetchData('/transactions');
  const updatedIds = transactionIds.map(id => id.toString());
  
  console.log('Verifying category updates:');
  updatedTransactions
    .filter(t => updatedIds.includes(t.id.toString()))
    .forEach(t => {
      console.log(`Transaction ID ${t.id}: Category ID is now ${t.categoryId}`);
    });
};

// Test delete transaction
const testDeleteTransaction = async () => {
  console.log('\nTesting transaction deletion...');
  
  // 1. Get transactions
  const transactions = await fetchData('/transactions');
  if (transactions.error || transactions.length === 0) {
    console.log('No transactions available for delete test');
    return;
  }
  
  // Get the last transaction for testing deletion
  const toDelete = transactions[transactions.length - 1];
  console.log(`Testing deletion of transaction ID ${toDelete.id}`);
  
  // 2. Delete the transaction
  const result = await fetchData(`/transactions/${toDelete.id}`, 'DELETE');
  
  if (result.error) {
    console.error('Transaction deletion failed:', result.error);
  } else {
    console.log('Transaction deletion successful');
  }
  
  // 3. Verify the deletion
  const updatedTransactions = await fetchData('/transactions');
  const exists = updatedTransactions.some(t => t.id === toDelete.id);
  
  if (exists) {
    console.error(`Failed: Transaction ID ${toDelete.id} still exists after deletion`);
  } else {
    console.log(`Success: Transaction ID ${toDelete.id} was properly deleted`);
  }
};

// Test CSV upload
const testCSVUpload = async () => {
  console.log('\nTesting CSV upload...');
  
  const fs = require('fs');
  const path = require('path');
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    // Read the CSV file
    const filePath = path.resolve('test-transactions.csv');
    
    if (!fs.existsSync(filePath)) {
      console.error('CSV file not found:', filePath);
      return;
    }
    
    console.log('Uploading file using curl:', filePath);
    
    // Use curl to upload the file
    const curlCommand = `curl -v -F "file=@${filePath}" ${API_URL}/transactions/upload`;
    console.log('Executing:', curlCommand);
    
    const { stdout, stderr } = await execPromise(curlCommand);
    
    console.log('curl stdout:', stdout);
    if (stderr) {
      console.log('curl stderr:', stderr);
    }
    
    try {
      const result = JSON.parse(stdout);
      console.log('CSV upload successful:', result);
      return result;
    } catch (parseError) {
      console.error('Failed to parse response:', parseError);
      console.log('Raw response:', stdout);
    }
    
  } catch (error) {
    console.error('CSV upload failed:', error);
  }
};

// Run tests sequentially
const runTests = async () => {
  console.log('Starting API tests...');
  
  // First upload test transactions
  await testCSVUpload();
  
  // Then test batch categorize on those transactions
  await testBatchCategorize();
  
  // Finally test deletion
  await testDeleteTransaction();
  
  console.log('\nAll tests completed!');
};

// Run the tests
runTests();