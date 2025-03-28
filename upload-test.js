/**
 * Test script to upload transactions from a CSV file
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');
const https = require('https');

// Configuration
const API_HOST = 'localhost';
const API_PORT = 5000;
const API_PATH = '/api/transactions/import/csv';
const CSV_FILE_PATH = './test-transactions.csv';

console.log(`Testing upload of ${CSV_FILE_PATH}...`);

// Create form data
const form = new FormData();
const fileStream = fs.createReadStream(path.resolve(CSV_FILE_PATH));
form.append('file', fileStream, { filename: 'test-transactions.csv' });

// Make the request
const options = {
  host: API_HOST,
  port: API_PORT,
  path: API_PATH,
  method: 'POST',
  headers: form.getHeaders(),
};

// Handle HTTP vs HTTPS based on configuration
const client = API_PORT === 443 ? https : http;

const req = client.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('UPLOAD RESULT:');
      console.log(`Transactions added: ${result.added || 0}`);
      console.log(`Transactions skipped: ${result.skipped || 0}`);
      console.log(`Transactions failed: ${result.failed || 0}`);
      
      if (result.transactions && result.transactions.length > 0) {
        console.log('\nFirst 3 transactions:');
        result.transactions.slice(0, 3).forEach((tx, i) => {
          console.log(`\n--- Transaction ${i + 1} ---`);
          console.log(`Date: ${tx.date}`);
          console.log(`Description: ${tx.description}`);
          console.log(`Amount: ${tx.amount} (${tx.type})`);
          console.log(`Account: ${tx.account} (${tx.accountType || 'unknown type'})`);
          console.log(`Merchant: ${tx.merchant || 'not specified'}`);
          console.log(`Tags: ${tx.tags && tx.tags.length > 0 ? tx.tags.join(', ') : 'none'}`);
          console.log(`Currency: ${tx.currency}`);
          console.log(`Balance: ${tx.balance || 'not available'}`);
          
          // Debug raw transaction data
          console.log('Raw data:');
          console.log(JSON.stringify(tx, null, 2));
        });
      }
    } catch (e) {
      console.error('Error parsing response:', e);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

// Write data to request body
form.pipe(req);

console.log('Request sent, waiting for response...');