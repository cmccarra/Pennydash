/**
 * Test script to verify the batch titles and batch organization functionality without uploading
 */
import fetch from 'node-fetch';

const API_URL = 'http://localhost:5000/api';

async function fetchData(url, options = {}) {
  console.log(`Fetching data from: ${url}`);
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`API error: ${data.error || response.statusText}`);
  }
  return data;
}

async function getTransactions() {
  return fetchData(`${API_URL}/transactions`);
}

async function testBatchOrganization() {
  try {
    console.log('Testing batch organization and titles...');
    
    // Step 1: Get all transactions
    const transactions = await getTransactions();
    console.log(`\nFound ${transactions.length} transactions`);
    
    // Filter to focus on the most recently added transactions
    const recentTransactions = transactions.filter(tx => 
      tx.createdAt >= '2025-03-31T22:15:00' // Only the most recent ones
    );
    console.log(`\nFocusing on ${recentTransactions.length} transactions created in the last few minutes`);
    
    // Show the list of batch IDs to check for our newly added transactions
    const recentBatchIds = [...new Set(recentTransactions.map(tx => tx.batchId))];
    console.log(`\nRecent batch IDs: ${recentBatchIds.join(', ')}`);
    
    // Step 2: Group transactions by batch ID
    const batchGroups = {};
    recentTransactions.forEach(tx => {
      if (tx.batchId) {
        if (!batchGroups[tx.batchId]) {
          batchGroups[tx.batchId] = [];
        }
        batchGroups[tx.batchId].push(tx);
      }
    });
    
    const batches = Object.keys(batchGroups).map(batchId => ({
      id: batchId,
      title: generateBatchTitle(batchId, batchGroups[batchId]),
      transactions: batchGroups[batchId],
      transactionCount: batchGroups[batchId].length,
      statistics: calculateBatchStatistics(batchGroups[batchId])
    }));
    
    console.log(`\nFound ${batches.length} batches`);
    
    // Step 3: Display the batches with their titles
    console.log('\n=== BATCH TITLES ===');
    batches.forEach((batch, index) => {
      console.log(`\nBatch ${index + 1}:`);
      console.log(`ID: ${batch.id || batch.batchId}`);
      console.log(`Title: ${batch.title || 'No title'}`);
      
      // Add other batch information if available
      if (batch.transactionCount) {
        console.log(`Transactions: ${batch.transactionCount}`);
      }
      
      if (batch.statistics) {
        console.log('\nStatistics:');
        console.log(`  Total: $${formatAmount(batch.statistics.totalExpense + batch.statistics.totalIncome)}`);
        console.log(`  Income: $${formatAmount(batch.statistics.totalIncome)}`);
        console.log(`  Expenses: $${formatAmount(batch.statistics.totalExpense)}`);
        
        if (batch.statistics.dateRange) {
          console.log(`  Date range: ${batch.statistics.dateRange.from || 'N/A'} to ${batch.statistics.dateRange.to || 'N/A'}`);
        }
      }
      
      console.log('-------------------');
    });
    
    console.log('\nTest completed successfully!');
    return true;
  } catch (error) {
    console.error('Error testing batch organization:', error);
    return false;
  }
}

// Generate a title for a batch based on its contents
function generateBatchTitle(batchId, transactions) {
  // If batch ID already contains a pattern we can use, extract it
  if (batchId.includes('_')) {
    const parts = batchId.split('_');
    if (parts.length >= 3) {
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
  
  // If we have a dominant merchant
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
    dateRange: {
      from: earliestDate ? earliestDate.toISOString().split('T')[0] : null,
      to: latestDate ? latestDate.toISOString().split('T')[0] : null
    }
  };
}

// Helper function to get date range from transactions
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

// Helper function to format amounts with 2 decimal places
function formatAmount(amount) {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

// Run the test
testBatchOrganization().then(() => {
  console.log('Test script completed.');
});