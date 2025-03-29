/**
 * Test script to verify the complete upload flow
 */
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Simple fetch implementation using core Node.js modules
async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = protocol.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      if (options.body instanceof FormData) {
        options.body.pipe(req);
      } else {
        req.write(options.body);
        req.end();
      }
    } else {
      req.end();
    }
  });
}

// Base URL for the API
const API_URL = 'http://localhost:5000/api';

// Function to upload a file
async function uploadFile(filePath) {
  // Create form data with the file
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  
  try {
    // Upload the file
    console.log('Uploading file:', filePath);
    const uploadResponse = await fetch(`${API_URL}/transactions/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    console.log('Upload response:', uploadResult);
    
    if (!uploadResult.uploadId) {
      throw new Error('Upload failed - no uploadId returned');
    }
    
    return uploadResult.uploadId;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// Function to update account info
async function updateAccountInfo(uploadId, accountInfo) {
  try {
    console.log('Updating account info for upload:', uploadId);
    const response = await fetch(`${API_URL}/transactions/uploads/${uploadId}/account-info`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(accountInfo)
    });
    
    const result = await response.json();
    console.log('Account info update response:', result);
    return result;
  } catch (error) {
    console.error('Account info update error:', error);
    throw error;
  }
}

// Function to get batches for an upload
async function getUploadBatches(uploadId) {
  try {
    console.log('Getting batches for upload:', uploadId);
    const response = await fetch(`${API_URL}/transactions/uploads/${uploadId}/batches`);
    
    const batches = await response.json();
    console.log('Batches response:', batches);
    return batches;
  } catch (error) {
    console.error('Get batches error:', error);
    throw error;
  }
}

// Function to complete upload process
async function completeUpload(uploadId) {
  try {
    console.log('Completing upload:', uploadId);
    const response = await fetch(`${API_URL}/transactions/uploads/${uploadId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const result = await response.json();
    console.log('Complete upload response:', result);
    return result;
  } catch (error) {
    console.error('Complete upload error:', error);
    throw error;
  }
}

// Main function to run the tests
async function runTests() {
  try {
    // 1. Upload a file
    const uploadId = await uploadFile('test-transactions.csv');
    
    // 2. Update account info
    await updateAccountInfo(uploadId, {
      accountName: 'Test Bank Account',
      accountType: 'bank'
    });
    
    // 3. Get batches
    const batches = await getUploadBatches(uploadId);
    
    // 4. Complete upload
    await completeUpload(uploadId);
    
    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the tests
runTests();