/**
 * Test script for batch title generation logic
 */

// Example transactions grouped in batches
const testBatches = [
  {
    // Batch with common merchant
    id: 'starbucks_batch',
    transactions: [
      { date: '2025-03-15', description: 'Coffee at Starbucks', merchant: 'Starbucks', amount: 5.75, type: 'expense' },
      { date: '2025-03-16', description: 'Coffee and pastry', merchant: 'Starbucks', amount: 8.45, type: 'expense' },
      { date: '2025-03-17', description: 'Lunch meeting', merchant: 'Starbucks', amount: 15.99, type: 'expense' },
      { date: '2025-03-18', description: 'Morning coffee', merchant: 'Starbucks', amount: 4.50, type: 'expense' }
    ]
  },
  {
    // Batch with common word in descriptions
    id: 'grocery_batch',
    transactions: [
      { date: '2025-03-01', description: 'Grocery shopping', merchant: 'Whole Foods', amount: 85.45, type: 'expense' },
      { date: '2025-03-08', description: 'Weekly grocery run', merchant: 'Trader Joe\'s', amount: 65.22, type: 'expense' },
      { date: '2025-03-15', description: 'Grocery and household items', merchant: 'Target', amount: 125.87, type: 'expense' },
      { date: '2025-03-22', description: 'Monthly grocery stock-up', merchant: 'Costco', amount: 245.33, type: 'expense' }
    ]
  },
  {
    // Batch with standard pattern in ID
    id: 'batch_income_2025-03',
    transactions: [
      { date: '2025-03-15', description: 'Paycheck Deposit', merchant: 'Employer', amount: 1500.00, type: 'income' },
      { date: '2025-03-30', description: 'Consulting Fee', merchant: 'Client A', amount: 750.00, type: 'income' }
    ]
  },
  {
    // Mixed batch with no clear pattern
    id: 'entertainment_batch',
    transactions: [
      { date: '2025-03-05', description: 'Movie tickets', merchant: 'AMC Theaters', amount: 24.50, type: 'expense' },
      { date: '2025-03-12', description: 'Book purchase', merchant: 'Amazon', amount: 15.99, type: 'expense' },
      { date: '2025-03-18', description: 'Concert tickets', merchant: 'Ticketmaster', amount: 85.00, type: 'expense' },
      { date: '2025-03-25', description: 'Magazine subscription', merchant: 'NY Times', amount: 12.99, type: 'expense' }
    ]
  }
];

// Generate a title for a batch based on its contents
function generateBatchTitle(batchId, transactions) {
  // If batch ID already contains a pattern we can use, extract it
  if (batchId.includes('_')) {
    const parts = batchId.split('_');
    console.log(`Batch ID parts: ${JSON.stringify(parts)}`);
    
    // For "batch_income_2025-03" or "batch_expense_2025-03" pattern
    if (parts.length >= 3 && (parts[1] === 'income' || parts[1] === 'expense') && parts[2].includes('-')) {
      const type = parts[1]; // income or expense
      const period = parts[2]; // YYYY-MM
      
      const year = period.split('-')[0];
      const month = period.split('-')[1];
      
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      
      const monthName = monthNames[parseInt(month) - 1];
      return `${type === 'income' ? 'Income' : 'Expenses'} - ${monthName} ${year}`;
    }
  }
  
  // Find common merchants
  const merchantCounts = {};
  transactions.forEach(tx => {
    if (tx.merchant) {
      merchantCounts[tx.merchant] = (merchantCounts[tx.merchant] || 0) + 1;
    }
  });
  
  const sortedMerchants = Object.keys(merchantCounts).sort((a, b) => 
    merchantCounts[b] - merchantCounts[a]
  );
  
  // If we have a dominant merchant (appears in more than 50% of transactions)
  if (sortedMerchants.length > 0 && 
      merchantCounts[sortedMerchants[0]] >= transactions.length * 0.5) {
    return `Transactions from ${sortedMerchants[0]}`;
  }
  
  // Find common words in descriptions
  const descriptions = transactions.map(tx => tx.description.toLowerCase());
  const commonWords = findCommonWords(descriptions);
  
  if (commonWords.length > 0) {
    return `${commonWords.join(' ')} Transactions`;
  }
  
  // Default to date range
  const dateRange = getDateRange(transactions);
  return `Transactions from ${dateRange.from} to ${dateRange.to}`;
}

// Helper function to find common words across descriptions
function findCommonWords(descriptions) {
  const excludeWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
    'from', 'by', 'as', 'of', 'payment', 'purchase', 'transaction', 'fee', 'charge'
  ]);
  
  // Extract words from descriptions
  const allWords = [];
  descriptions.forEach(desc => {
    const words = desc.split(/\s+/).filter(word => 
      word.length > 2 && !excludeWords.has(word)
    );
    allWords.push(...words);
  });
  
  // Count word frequencies
  const wordCounts = {};
  allWords.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });
  
  // Find words that appear in at least 50% of transactions
  const threshold = descriptions.length * 0.5;
  const commonWords = Object.keys(wordCounts).filter(word => 
    wordCounts[word] >= threshold
  ).sort((a, b) => wordCounts[b] - wordCounts[a]).slice(0, 3);
  
  // Capitalize first letters
  return commonWords.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  );
}

// Helper function to get date range from a batch of transactions
function getDateRange(transactions) {
  let earliestDate = null;
  let latestDate = null;
  
  transactions.forEach(tx => {
    const txDate = new Date(tx.date);
    if (!earliestDate || txDate < earliestDate) {
      earliestDate = txDate;
    }
    if (!latestDate || txDate > latestDate) {
      latestDate = txDate;
    }
  });
  
  return {
    from: earliestDate ? earliestDate.toISOString().split('T')[0] : 'unknown',
    to: latestDate ? latestDate.toISOString().split('T')[0] : 'unknown'
  };
}

// Calculate statistics for a batch of transactions
function calculateBatchStatistics(transactions) {
  let totalIncome = 0;
  let totalExpense = 0;
  let earliestDate = null;
  let latestDate = null;
  
  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount);
    if (tx.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpense += amount;
    }
    
    const txDate = new Date(tx.date);
    if (!earliestDate || txDate < earliestDate) {
      earliestDate = txDate;
    }
    if (!latestDate || txDate > latestDate) {
      latestDate = txDate;
    }
  });
  
  return {
    totalIncome,
    totalExpense,
    totalAmount: totalIncome + totalExpense,
    dateRange: {
      from: earliestDate ? earliestDate.toISOString().split('T')[0] : null,
      to: latestDate ? latestDate.toISOString().split('T')[0] : null
    }
  };
}

// Helper function to format amounts with 2 decimal places
function formatAmount(amount) {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

// Organize transactions into logical batches
function organizeIntoBatches(transactions) {
  // First, separate transactions by type and month
  const batchGroups = {};
  
  transactions.forEach(tx => {
    const date = new Date(tx.date);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const batchKey = `batch_${tx.type}_${yearMonth}`;
    
    if (!batchGroups[batchKey]) {
      batchGroups[batchKey] = [];
    }
    
    batchGroups[batchKey].push(tx);
  });
  
  // Convert to array of batch objects with additional metadata
  return Object.keys(batchGroups).map(batchId => {
    const transactions = batchGroups[batchId];
    return {
      batchId,
      title: generateBatchTitle(batchId, transactions),
      transactions,
      statistics: calculateBatchStatistics(transactions)
    };
  });
}

// Test batch title generation
function testBatchTitleGeneration() {
  console.log('===== TESTING BATCH TITLE GENERATION =====\n');
  
  testBatches.forEach((batch, index) => {
    const title = generateBatchTitle(batch.id, batch.transactions);
    const stats = calculateBatchStatistics(batch.transactions);
    
    console.log(`\n== Batch ${index + 1}: ${batch.id} ==`);
    console.log(`Generated title: "${title}"`);
    console.log(`Transactions: ${batch.transactions.length}`);
    console.log(`Total amount: $${formatAmount(stats.totalIncome + stats.totalExpense)}`);
    console.log(`Date range: ${stats.dateRange.from} to ${stats.dateRange.to}`);
    
    console.log('\nSample transactions:');
    batch.transactions.slice(0, 2).forEach((tx, txIndex) => {
      console.log(`  ${txIndex + 1}. ${tx.description} - $${tx.amount} (${tx.type})`);
    });
    
    console.log('\n----------------------------------');
  });
  
  console.log('\n===== TESTING BATCH ORGANIZATION =====\n');
  
  // Flatten all transactions into a single array for organization testing
  const allTransactions = testBatches.reduce((acc, batch) => {
    return acc.concat(batch.transactions);
  }, []);
  
  const organizedBatches = organizeIntoBatches(allTransactions);
  
  console.log(`Organized ${allTransactions.length} transactions into ${organizedBatches.length} batches:\n`);
  
  organizedBatches.forEach((batch, index) => {
    console.log(`\n== Organized Batch ${index + 1}: ${batch.batchId} ==`);
    console.log(`Title: "${batch.title}"`);
    console.log(`Transactions: ${batch.transactions.length}`);
    console.log(`Income: $${formatAmount(batch.statistics.totalIncome)}`);
    console.log(`Expenses: $${formatAmount(batch.statistics.totalExpense)}`);
    console.log(`Date range: ${batch.statistics.dateRange.from} to ${batch.statistics.dateRange.to}`);
    console.log('\n----------------------------------');
  });
}

// Run the test
testBatchTitleGeneration();