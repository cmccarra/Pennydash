/**
 * Test script to import transactions from activity.csv
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
          ok: res.statusCode >= 200 && res.statusCode < 300,
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

// Test the complete workflow for uploading activity.csv
async function testActivityCSV() {
  try {
    // Create a form with the file
    const filePath = './attached_assets/activity (1).csv';
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    console.log(`File exists at ${filePath}, size: ${fs.statSync(filePath).size} bytes`);
    
    // Log the first few lines of the file for debugging
    const filePreview = fs.readFileSync(filePath, 'utf8');
    const lines = filePreview.split('\n').slice(0, 5);
    console.log('CSV file preview (first 5 lines):');
    lines.forEach((line, i) => console.log(`  ${i+1}: ${line}`));
    
    // Directly use multipart/form-data with boundary
    const boundary = '--------------------------' + Date.now().toString(16);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    const payload = `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="activity.csv"\r
Content-Type: text/csv\r
\r
${fileContent}\r
--${boundary}\r
Content-Disposition: form-data; name="enrichMode"\r
\r
true\r
--${boundary}--\r
`;

    console.log('Uploading CSV file...');
    const uploadResponse = await fetch(`${API_URL}/transactions/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: payload
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload successful with ID:', uploadResult.uploadId);

    if (!uploadResult.uploadId) {
      throw new Error('Upload failed - no uploadId returned');
    }

    const uploadId = uploadResult.uploadId;

    // Step 2: Update account info
    console.log('Updating account info...');
    const accountInfo = [
      {
        fileName: 'activity (1).csv',
        fileId: uploadId,
        accountSource: 'Credit Card',
        accountType: 'credit_card'
      }
    ];

    const accountInfoResponse = await fetch(`${API_URL}/transactions/uploads/${uploadId}/account-info`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(accountInfo)
    });

    if (!accountInfoResponse.ok) {
      throw new Error(`Account info update failed with status ${accountInfoResponse.status}`);
    }

    const accountInfoResult = await accountInfoResponse.json();
    console.log('Account info update result:', accountInfoResult);

    // Step 3: Get batches
    console.log('Getting batches...');
    const batchesResponse = await fetch(`${API_URL}/transactions/uploads/${uploadId}/batches`);

    if (!batchesResponse.ok) {
      throw new Error(`Get batches failed with status ${batchesResponse.status}`);
    }

    const batchesResult = await batchesResponse.json();
    console.log('Found', batchesResult.batches?.length || 0, 'batches');
    
    // Show stats for understanding breakdown
    let incomeCount = 0;
    let expenseCount = 0;
    let totalTransactions = 0;
    
    if (batchesResult.batches) {
      batchesResult.batches.forEach(batch => {
        totalTransactions += batch.transactions.length;
        batch.transactions.forEach(tx => {
          if (tx.type === 'income') incomeCount++;
          if (tx.type === 'expense') expenseCount++;
        });
      });
      
      console.log(`Transaction breakdown: ${totalTransactions} total, ${incomeCount} income, ${expenseCount} expense`);
    }

    if (!batchesResult.batches || batchesResult.batches.length === 0) {
      console.log('No batches found - this could indicate an issue with parsing the file');
    } else {
      // Display some sample transactions from the first batch
      const firstBatch = batchesResult.batches[0];
      console.log('First batch ID:', firstBatch.batchId);
      console.log('Sample transactions:');
      firstBatch.transactions.slice(0, 3).forEach((tx, i) => {
        console.log(`  ${i+1}. ${tx.date} - ${tx.description} - $${tx.amount} (${tx.type})`);
      });

      // Step 4: Complete upload
      console.log('Completing upload...');
      const completeResponse = await fetch(`${API_URL}/transactions/uploads/${uploadId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!completeResponse.ok) {
        throw new Error(`Complete upload failed with status ${completeResponse.status}`);
      }

      const completeResult = await completeResponse.json();
      console.log('Complete upload result:', completeResult);
    }

    console.log('✅ Test completed successfully');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testActivityCSV();