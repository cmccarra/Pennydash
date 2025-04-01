const { organizeIntoBatches, findCommonWords, getDateRange, getFormattedDateRange } = require('./src/server/services/batchOrganization');

// Define sample test transactions
const testTransactions = [
  // Group 1: Starbucks transactions (merchant-based grouping)
  {
    id: 'tx1',
    description: 'STARBUCKS #123 San Francisco',
    merchant: 'STARBUCKS',
    amount: 5.95,
    date: '2025-03-01',
    type: 'expense'
  },
  {
    id: 'tx2',
    description: 'STARBUCKS #456 New York',
    merchant: 'STARBUCKS',
    amount: 4.75,
    date: '2025-03-05',
    type: 'expense'
  },
  {
    id: 'tx3',
    description: 'STARBUCKS MOBILE ORDER',
    merchant: 'STARBUCKS',
    amount: 6.50,
    date: '2025-03-10',
    type: 'expense'
  },
  
  // Group 2: Amazon transactions (merchant-based grouping)
  {
    id: 'tx4',
    description: 'AMAZON.COM*AB12CD34 AMZN.COM/BILL',
    merchant: 'AMAZON',
    amount: 29.99,
    date: '2025-03-15',
    type: 'expense'
  },
  {
    id: 'tx5',
    description: 'AMAZON PRIME MEMBERSHIP',
    merchant: 'AMAZON',
    amount: 14.99,
    date: '2025-03-20',
    type: 'expense'
  },
  
  // Group 3: Payroll (common word & transaction type grouping)
  {
    id: 'tx6',
    description: 'DIRECT DEPOSIT PAYROLL',
    amount: 2500.00,
    date: '2025-03-01',
    type: 'income'
  },
  {
    id: 'tx7',
    description: 'ACH DIRECT DEPOSIT EMPLOYER PAYROLL',
    amount: 2500.00,
    date: '2025-03-15',
    type: 'income'
  },
  
  // Group 4: Utility bills (similar pattern grouping)
  {
    id: 'tx8',
    description: 'PG&E ELECTRIC BILL',
    amount: 95.67,
    date: '2025-03-05',
    type: 'expense'
  },
  {
    id: 'tx9',
    description: 'WATER COMPANY PAYMENT',
    amount: 45.33,
    date: '2025-03-10',
    type: 'expense'
  },
  
  // Standalone transactions
  {
    id: 'tx10',
    description: 'VENMO TRANSFER TO FRIEND',
    amount: 50.00,
    date: '2025-03-22',
    type: 'expense'
  }
];

// Run the test function
async function runTest() {
  console.log('Testing batch organization module...');
  
  // Test organizeIntoBatches function
  console.log('\n=== Testing organizeIntoBatches ===');
  const batches = organizeIntoBatches(testTransactions);
  
  console.log(`Created ${batches.length} batches:`);
  batches.forEach((batch, index) => {
    console.log(`\nBatch #${index + 1}: ${batch.metadata.summary}`);
    console.log(`- Source: ${batch.metadata.source}`);
    console.log(`- Transaction count: ${batch.transactions.length}`);
    console.log(`- Sample transactions: ${batch.transactions.slice(0, 2).map(tx => tx.description).join(', ')}`);
  });
  
  // Test findCommonWords function
  console.log('\n=== Testing findCommonWords ===');
  const descriptions = testTransactions.map(tx => tx.description);
  const commonWords = findCommonWords(descriptions);
  console.log(`Common words across all descriptions: ${commonWords.join(', ') || 'None found'}`);
  
  // Test getDateRange function
  console.log('\n=== Testing getDateRange ===');
  const dateRange = getDateRange(testTransactions);
  console.log(`Date range: ${dateRange.from} to ${dateRange.to}`);
  
  // Test getFormattedDateRange function
  console.log('\n=== Testing getFormattedDateRange ===');
  const formattedRange = getFormattedDateRange(dateRange);
  console.log(`Formatted date range: ${formattedRange}`);
}

// Execute the test
runTest().catch(err => {
  console.error('Test failed:', err);
});