/**
 * Test script to upload a credit card CSV file and verify transaction categorization
 * Using CommonJS format for compatibility
 */

// Require dependencies
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { default: fetchDefault, ...fetchRestExports } = require('node-fetch');
const fetch = fetchDefault || (fetchRestExports && fetchRestExports.default); // Get the default export

const SERVER_URL = 'http://localhost:5000';

async function uploadCreditCardCSV() {
  try {
    console.log('Starting credit card upload test...');
    
    // Path to the CSV file
    const csvFilePath = path.resolve('attached_assets/activity (1).csv');
    console.log(`Using CSV file at path: ${csvFilePath}`);
    
    if (!fs.existsSync(csvFilePath)) {
      console.error(`CSV file not found at path: ${csvFilePath}`);
      return;
    }
    
    // Create FormData object for the file upload
    const form = new FormData();
    form.append('file', fs.createReadStream(csvFilePath));
    
    // Set account type to credit card
    form.append('accountTypeEnum', 'credit_card');
    form.append('accountName', 'Test Credit Card');
    form.append('enrichMode', 'true');
    
    console.log('Uploading CSV as credit card...');
    
    // Upload the file
    const uploadResponse = await fetch(`${SERVER_URL}/api/transactions/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {} // For node-fetch
    });
    
    // Parse the upload response
    const uploadResult = await uploadResponse.json();
    console.log('Upload response status:', uploadResponse.status);
    
    if (!uploadResponse.ok) {
      console.error('Upload failed:', uploadResult.error || 'Unknown error');
      return;
    }
    
    console.log(`Upload successful! Upload ID: ${uploadResult.uploadId}`);
    console.log(`Batches: ${uploadResult.batches.length} with ${uploadResult.statistics.totalTransactions} total transactions`);
    
    // Get the batch details
    console.log('Fetching batch details...');
    const uploadId = uploadResult.uploadId;
    
    const batchesResponse = await fetch(`${SERVER_URL}/api/transactions/uploads/${uploadId}/batches`);
    const batchesResult = await batchesResponse.json();
    
    if (!batchesResponse.ok) {
      console.error('Failed to fetch batches:', batchesResult.error || 'Unknown error');
      return;
    }
    
    console.log(`Retrieved ${batchesResult.batches.length} batches`);
    
    // Analyze transactions
    let totalIncomeTransactions = 0;
    let totalExpenseTransactions = 0;
    
    // Expected transactions with specific types
    const expectedIncome = ['PAYMENT RECEIVED - THANK YOU', 'American Express Travel', 'BUDGET.CA'];
    const expectedExpense = ['MEMBERSHIP FEE INSTALLMENT', 'GOOGLE CLOUD EMEA LIMIT IRELAND', 'MARCHE DORION 2451'];
    
    for (const batch of batchesResult.batches) {
      console.log(`\nBatch: ${batch.batchId} - ${batch.transactions.length} transactions`);
      
      // Count types
      const incomeTransactions = batch.transactions.filter(t => t.type === 'income');
      const expenseTransactions = batch.transactions.filter(t => t.type === 'expense');
      
      totalIncomeTransactions += incomeTransactions.length;
      totalExpenseTransactions += expenseTransactions.length;
      
      console.log(`Income transactions: ${incomeTransactions.length}`);
      console.log(`Expense transactions: ${expenseTransactions.length}`);
      
      // Check if expected transactions have correct types
      for (const expected of expectedIncome) {
        const matchingTransactions = batch.transactions.filter(t => t.description.includes(expected));
        if (matchingTransactions.length > 0) {
          const tx = matchingTransactions[0];
          console.log(`Expected Income: ${tx.description} - Type: ${tx.type} - Match: ${tx.type === 'income' ? '✅' : '❌'}`);
        }
      }
      
      for (const expected of expectedExpense) {
        const matchingTransactions = batch.transactions.filter(t => t.description.includes(expected));
        if (matchingTransactions.length > 0) {
          const tx = matchingTransactions[0];
          console.log(`Expected Expense: ${tx.description} - Type: ${tx.type} - Match: ${tx.type === 'expense' ? '✅' : '❌'}`);
        }
      }
      
      // Show 3 sample transactions from each type
      console.log('\nSample Income Transactions:');
      incomeTransactions.slice(0, 3).forEach(t => {
        console.log(`  - ${t.description}: $${t.amount} (${t.date})`);
      });
      
      console.log('\nSample Expense Transactions:');
      expenseTransactions.slice(0, 3).forEach(t => {
        console.log(`  - ${t.description}: $${t.amount} (${t.date})`);
      });
    }
    
    console.log('\nSummary:');
    console.log(`Total Income Transactions: ${totalIncomeTransactions}`);
    console.log(`Total Expense Transactions: ${totalExpenseTransactions}`);
    console.log(`Total Transactions: ${totalIncomeTransactions + totalExpenseTransactions}`);
    
    // Mark upload as complete
    console.log('\nMarking upload as complete...');
    const completeResponse = await fetch(`${SERVER_URL}/api/transactions/uploads/${uploadId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const completeResult = await completeResponse.json();
    
    if (!completeResponse.ok) {
      console.error('Failed to complete upload:', completeResult.error || 'Unknown error');
      return;
    }
    
    console.log('Upload marked as complete!');
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
uploadCreditCardCSV();