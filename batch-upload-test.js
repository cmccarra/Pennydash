/**
 * Test script to verify batch and upload functionality
 */
// Use older fetch implementation
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const API_BASE_URL = 'http://localhost:5000/api';
const CSV_TEST_FILE = './test-transactions.csv';

async function uploadFile() {
  console.log('Uploading test transaction CSV file...');
  
  const formData = new FormData();
  formData.append('file', fs.createReadStream(CSV_TEST_FILE));
  
  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Upload failed: ${error.error || error.message || 'Unknown error'}`);
  }
  
  const result = await response.json();
  console.log('Upload successful:', result);
  
  return result.uploadId;
}

async function processUpload(uploadId) {
  console.log(`Processing upload ${uploadId}...`);
  
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountName: 'Test Account',
      accountType: 'bank'
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Processing failed: ${error.error || error.message || 'Unknown error'}`);
  }
  
  const result = await response.json();
  console.log('Processing request successful:', result);
  
  return result;
}

async function createBatches(uploadId) {
  console.log(`Auto-creating batches for upload ${uploadId}...`);
  
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/auto-batches`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Batch creation failed: ${error.error || error.message || 'Unknown error'}`);
  }
  
  const result = await response.json();
  console.log('Batches created successfully:', result);
  
  return result;
}

async function getBatches(uploadId) {
  console.log(`Getting batches for upload ${uploadId}...`);
  
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/batches`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Getting batches failed: ${error.error || error.message || 'Unknown error'}`);
  }
  
  const result = await response.json();
  console.log('Batches retrieved successfully:', result);
  
  return result;
}

async function completeUpload(uploadId) {
  console.log(`Completing upload ${uploadId}...`);
  
  const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Completing upload failed: ${error.error || error.message || 'Unknown error'}`);
  }
  
  const result = await response.json();
  console.log('Upload completed successfully:', result);
  
  return result;
}

async function runTest() {
  try {
    // Upload a test file
    const uploadId = await uploadFile();
    
    // Process the upload
    await processUpload(uploadId);
    
    // Create batches automatically
    await createBatches(uploadId);
    
    // Get the batches
    await getBatches(uploadId);
    
    // Complete the upload
    await completeUpload(uploadId);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
runTest();