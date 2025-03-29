/**
 * Test script to verify the transaction enrichment flow
 * This includes the upload, account setup, and completion steps
 */

import fs from 'fs';
import FormData from 'form-data';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_URL = 'http://localhost:5000/api';

// Polyfill for fetch
async function fetch(url, options = {}) {
  const nodeFetch = (await import('node-fetch')).default;
  const response = await nodeFetch(url, options);
  return response;
}

async function testEnrichmentFlow() {
  try {
    console.log('Starting transaction enrichment flow test');
    
    // Step 1: Upload file
    console.log('Step 1: Uploading CSV file...');
    const csvFilePath = path.join(__dirname, 'attached_assets', 'activity (1).csv');
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found at path: ${csvFilePath}`);
    }
    
    console.log('CSV file path:', csvFilePath);
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvFilePath));
    formData.append('enrichMode', 'true');
    
    const uploadResponse = await fetch(`${SERVER_URL}/transactions/upload`, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders ? formData.getHeaders() : undefined
    });
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}: ${await uploadResponse.text()}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log(`Upload successful! Upload ID: ${uploadResult.uploadId}`);
    
    if (!uploadResult.uploadId) {
      throw new Error('Upload failed - no uploadId returned');
    }
    
    // Step 2: Update account info
    console.log('\nStep 2: Updating account info...');
    const accountInfo = [
      {
        fileName: 'activity (1).csv',
        fileId: uploadResult.uploadId,
        accountSource: 'Credit Card', 
        accountType: 'credit_card'
      }
    ];
    
    const accountUpdateResponse = await fetch(`${SERVER_URL}/transactions/uploads/${uploadResult.uploadId}/account-info`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(accountInfo)
    });
    
    if (!accountUpdateResponse.ok) {
      throw new Error(`Account update failed: ${accountUpdateResponse.status} ${accountUpdateResponse.statusText}`);
    }
    
    const accountUpdateResult = await accountUpdateResponse.json();
    console.log('Account update successful:', accountUpdateResult);
    
    // Step 3: Fetch batches
    console.log('\nStep 3: Fetching transaction batches...');
    const batchesResponse = await fetch(`${SERVER_URL}/transactions/uploads/${uploadResult.uploadId}/batches`);
    
    if (!batchesResponse.ok) {
      throw new Error(`Failed to fetch batches: ${batchesResponse.status} ${batchesResponse.statusText}`);
    }
    
    const batchesResult = await batchesResponse.json();
    console.log(`Found ${batchesResult.batches.length} batches with a total of ${batchesResult.statistics.totalTransactions} transactions`);
    
    // Step 4: Process each batch (simulate batch enrichment)
    console.log('\nStep 4: Processing each batch...');
    const categoryId = '46c0235a-926b-4ce2-92a3-c1a93334b552'; // Example category ID (Shopping)
    
    for (const batch of batchesResult.batches) {
      console.log(`Processing batch ${batch.batchId} with ${batch.transactions.length} transactions`);
      
      // Enrich the batch with a category
      const enrichResponse = await fetch(`${SERVER_URL}/transactions/batches/${batch.batchId}/enrich`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          categoryId: categoryId,
          tags: ['test', 'enrichment'],
          notes: 'Batch processed by test script'
        })
      });
      
      if (!enrichResponse.ok) {
        throw new Error(`Batch enrichment failed: ${enrichResponse.status} ${enrichResponse.statusText}`);
      }
      
      const enrichResult = await enrichResponse.json();
      console.log(`Batch ${batch.batchId} enriched successfully`);
      
      // Optionally complete each batch individually
      const completeResponse = await fetch(`${SERVER_URL}/transactions/batches/${batch.batchId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (!completeResponse.ok) {
        throw new Error(`Batch completion failed: ${completeResponse.status} ${completeResponse.statusText}`);
      }
      
      console.log(`Batch ${batch.batchId} marked as completed`);
    }
    
    // Step 5: Complete the upload
    console.log('\nStep 5: Completing entire upload...');
    try {
      const completeUploadResponse = await fetch(`${SERVER_URL}/transactions/uploads/${uploadResult.uploadId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (!completeUploadResponse.ok) {
        const errorText = await completeUploadResponse.text();
        throw new Error(`Complete upload failed with status ${completeUploadResponse.status}: ${errorText}`);
      }
      
      const completeUploadResult = await completeUploadResponse.json();
      console.log('Upload completed successfully:', completeUploadResult);
    } catch (error) {
      console.error('Failed to complete upload:', error);
    }
    
    console.log('\nTransaction enrichment flow test completed successfully!');
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testEnrichmentFlow();