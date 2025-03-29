/**
 * Test script to check the review queue endpoint
 */
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/review-queue',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('BODY:');
    try {
      const parsedData = JSON.parse(data);
      // Just show the top-level structure and pagination info
      const simplified = {
        success: parsedData.success,
        transactionCount: parsedData.transactions ? parsedData.transactions.length : 0,
        pagination: parsedData.pagination,
        transactionSample: parsedData.transactions && parsedData.transactions.length > 0 ? 
          parsedData.transactions[0] : null
      };
      console.log(JSON.stringify(simplified, null, 2));
    } catch (e) {
      console.log('Could not parse response as JSON');
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();