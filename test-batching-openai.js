
/**
 * Test script for OpenAI integration in batching flow
 */

const fetch = require('node-fetch');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// Configuration
const SERVER_URL = 'http://localhost:5000';
const TEST_FILE = 'test-transactions.csv';

async function testBatchingFlow() {
  console.log('Testing OpenAI integration in batching flow...');
  
  try {
    // Step 1: Upload a file
    console.log('\n1. Uploading test file...');
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_FILE));
    
    const uploadResponse = await fetch(`${SERVER_URL}/api/uploads`, {
      method: 'POST',
      body: form
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`Upload successful. Upload ID: ${uploadResult.uploadId}`);
    
    // Step 2: Update account information for the upload
    console.log('\n2. Updating account information...');
    const accountInfo = {
      files: [
        {
          fileName: TEST_FILE,
          fileId: uploadResult.uploadId,
          accountSource: 'Test Bank',
          accountSourceSelection: 'Test',
          accountType: 'checking'
        }
      ]
    };
    
    const accountResponse = await fetch(`${SERVER_URL}/api/transactions/uploads/${uploadResult.uploadId}/account-info`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(accountInfo)
    });
    
    if (!accountResponse.ok) {
      throw new Error(`Account info update failed with status ${accountResponse.status}`);
    }
    
    console.log('Account information updated successfully.');
    
    // Step 3: Get batches for the upload
    console.log('\n3. Fetching batches...');
    const batchesResponse = await fetch(`${SERVER_URL}/api/transactions/uploads/${uploadResult.uploadId}/batches`);
    
    if (!batchesResponse.ok) {
      throw new Error(`Fetching batches failed with status ${batchesResponse.status}`);
    }
    
    const batchesResult = await batchesResponse.json();
    console.log(`Found ${batchesResult.batches.length} batches.`);
    
    if (batchesResult.batches.length === 0) {
      throw new Error('No batches found. This could indicate a problem with the batching algorithm.');
    }
    
    // Step 4: Test OpenAI integration by enriching a batch
    console.log('\n4. Testing batch enrichment with OpenAI...');
    const firstBatch = batchesResult.batches[0];
    console.log(`Using batch ID: ${firstBatch.batchId}`);
    
    const enrichResponse = await fetch(`${SERVER_URL}/api/transactions/batches/${firstBatch.batchId}/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        useAI: true
      })
    });
    
    const enrichResult = await enrichResponse.json();
    
    if (!enrichResponse.ok) {
      console.error('Batch enrichment failed:', enrichResult);
      throw new Error(`Batch enrichment failed with status ${enrichResponse.status}`);
    }
    
    console.log('Batch enrichment response:', enrichResult);
    
    // Step 5: Verify the results
    console.log('\n5. Verifying batch enrichment results...');
    const verifyResponse = await fetch(`${SERVER_URL}/api/transactions/batches/${firstBatch.batchId}`);
    
    if (!verifyResponse.ok) {
      throw new Error(`Verification failed with status ${verifyResponse.status}`);
    }
    
    const verifyResult = await verifyResponse.json();
    
    // Check if transactions have been categorized
    const categorizedCount = verifyResult.transactions.filter(t => t.categoryId !== null).length;
    const totalCount = verifyResult.transactions.length;
    const categorizedPercentage = (categorizedCount / totalCount) * 100;
    
    console.log(`Categorized ${categorizedCount} out of ${totalCount} transactions (${categorizedPercentage.toFixed(2)}%).`);
    
    if (categorizedCount === 0) {
      console.warn('⚠️ Warning: No transactions were categorized. This could indicate an issue with the OpenAI integration.');
    } else {
      console.log('✅ Some transactions were successfully categorized.');
    }
    
    // Final result
    return {
      success: categorizedCount > 0,
      uploadId: uploadResult.uploadId,
      batchId: firstBatch.batchId,
      categorizedCount,
      totalCount,
      categorizedPercentage
    };
    
  } catch (error) {
    console.error('Test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testBatchingFlow()
  .then(result => {
    console.log('\n=====================');
    console.log('Test Results:');
    console.log('=====================');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ Test Passed: OpenAI integration appears to be working in the batching flow.');
    } else {
      console.log('\n❌ Test Failed: OpenAI integration is not working properly in the batching flow.');
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
    }
  })
  .catch(error => {
    console.error('Error running test:', error);
  });
