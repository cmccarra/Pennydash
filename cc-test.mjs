/**
 * Simple test for credit card transaction handling using native fetch
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = 'http://localhost:5000';

async function testCreditCardProcessing() {
  try {
    console.log('Testing credit card transaction processing...');
    
    // Path to the CSV file
    const csvFilePath = path.join(__dirname, 'attached_assets/activity (1).csv');
    console.log(`CSV file path: ${csvFilePath}`);
    
    // Check if file exists
    if (!fs.existsSync(csvFilePath)) {
      console.error(`File not found: ${csvFilePath}`);
      return;
    }
    
    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(csvFilePath));
    form.append('accountTypeEnum', 'credit_card');
    form.append('accountName', 'TEST CREDIT CARD');
    form.append('enrichMode', 'true');
    
    // Upload the file
    console.log('Uploading CSV file...');
    const uploadResponse = await fetch(`${SERVER_URL}/api/transactions/upload`, {
      method: 'POST',
      body: form
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      console.error(`Error details: ${errorText}`);
      return;
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`Upload successful! Upload ID: ${uploadResult.uploadId}`);
    
    // Update account type to force credit card processing
    console.log('Updating account type to credit_card...');
    const accountUpdateResponse = await fetch(`${SERVER_URL}/api/transactions/uploads/${uploadResult.uploadId}/account-info`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountType: 'credit_card',
        accountName: 'TEST CREDIT CARD'
      })
    });
    
    if (!accountUpdateResponse.ok) {
      const errorText = await accountUpdateResponse.text();
      console.error(`Account update failed: ${accountUpdateResponse.status} ${accountUpdateResponse.statusText}`);
      console.error(`Error details: ${errorText}`);
      return;
    }
    
    const accountUpdateResult = await accountUpdateResponse.json();
    console.log('Account update successful:', accountUpdateResult);
    
    // Add a delay to allow database updates to complete
    console.log('Waiting for database updates to settle...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify account type changes - get a sample transaction
    console.log('Verifying account type changes...');
    const sampleTransactionResponse = await fetch(`${SERVER_URL}/api/transactions/by-upload/${uploadResult.uploadId}?limit=5`);
    
    if (sampleTransactionResponse.ok) {
      const sampleTransactions = await sampleTransactionResponse.json();
      console.log('Sample transactions from database:');
      sampleTransactions.forEach((tx, i) => {
        console.log(`Transaction ${i + 1}: ${tx.description} | Type: ${tx.type} | AccountType: ${tx.accountType}`);
      });
    } else {
      console.log('Could not fetch sample transactions');
    }
    
    // Get batches
    const batchesResponse = await fetch(`${SERVER_URL}/api/transactions/uploads/${uploadResult.uploadId}/batches`);
    
    if (!batchesResponse.ok) {
      console.error(`Failed to fetch batches: ${batchesResponse.status} ${batchesResponse.statusText}`);
      return;
    }
    
    const batchesResult = await batchesResponse.json();
    console.log(`Found ${batchesResult.batches.length} batches`);
    
    // Check transaction types
    let incomeCount = 0;
    let expenseCount = 0;
    
    for (const batch of batchesResult.batches) {
      for (const tx of batch.transactions) {
        if (tx.type === 'income') {
          incomeCount++;
        } else if (tx.type === 'expense') {
          expenseCount++;
        }
      }
    }
    
    console.log(`Income transactions: ${incomeCount}`);
    console.log(`Expense transactions: ${expenseCount}`);
    
    // Check specific transaction types
    for (const batch of batchesResult.batches) {
      for (const tx of batch.transactions) {
        // Payment should be income
        if (tx.description.includes('PAYMENT RECEIVED')) {
          console.log(`Payment transaction: ${tx.description}, Type: ${tx.type} - ${tx.type === 'income' ? 'CORRECT ✅' : 'WRONG ❌'}`);
        }
        
        // Regular merchant should be expense
        if (tx.description.includes('MARCHE DORION')) {
          console.log(`Merchant transaction: ${tx.description}, Type: ${tx.type} - ${tx.type === 'expense' ? 'CORRECT ✅' : 'WRONG ❌'}`);
        }
      }
    }
    
    console.log('Test completed!');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testCreditCardProcessing();