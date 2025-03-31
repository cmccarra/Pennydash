/**
 * Realistic batch organization test
 * 
 * This test simulates realistic transaction data to verify our
 * batch organization and title generation logic.
 */

// Import the improved title generation from our helper
const { 
  generateBatchTitle, 
  organizeIntoBatches,
  calculateBatchStatistics,
  formatAmount
} = require('./batch-title-generation-module');

// Generate realistic transaction data for testing
function generateRealisticTransactions() {
  // Utility to generate random date in March 2025
  const randomDate = () => {
    const day = Math.floor(Math.random() * 31) + 1;
    return `2025-03-${day.toString().padStart(2, '0')}`;
  };
  
  // Utility to generate random amount between min and max
  const randomAmount = (min, max) => {
    return +(Math.random() * (max - min) + min).toFixed(2);
  };
  
  // Generate transactions from different sources
  return [
    // Credit card transactions with standard formatting
    ...Array(20).fill().map((_, i) => ({
      id: `cc-${i + 1}`,
      date: randomDate(),
      description: [
        'AMAZON.COM',
        'NETFLIX.COM',
        'UBER EATS',
        'STARBUCKS',
        'TARGET',
        'WALMART',
        'WHOLE FOODS',
        'HOME DEPOT',
        'CHEVRON',
        'SHELL OIL'
      ][i % 10] + ' PURCHASE',
      merchant: [
        'Amazon',
        'Netflix',
        'Uber Eats',
        'Starbucks',
        'Target',
        'Walmart',
        'Whole Foods',
        'Home Depot',
        'Chevron',
        'Shell'
      ][i % 10],
      amount: randomAmount(10, 200),
      type: 'expense',
      source: 'credit_card'
    })),
    
    // Bank transactions with different formats
    ...Array(15).fill().map((_, i) => ({
      id: `bank-${i + 1}`,
      date: randomDate(),
      description: [
        'Direct Deposit - EMPLOYER NAME',
        'ACH Transfer from SAVINGS',
        'Interest Payment',
        'ATM Withdrawal',
        'Check #1234',
        'Wire Transfer',
        'Online Payment - RENT',
        'Online Payment - UTILITY',
        'Online Payment - INSURANCE',
        'Zelle Payment - FRIEND NAME'
      ][i % 10],
      merchant: i % 3 === 0 ? null : [
        'Employer',
        'Internal Transfer',
        'Bank',
        'ATM',
        'Check',
        'Wire',
        'Landlord',
        'Utility Company',
        'Insurance Co',
        'Friend'
      ][i % 10],
      amount: i % 4 === 0 ? randomAmount(1000, 3000) : randomAmount(20, 500),
      type: i % 4 === 0 ? 'income' : 'expense',
      source: 'bank'
    })),
    
    // Subscription services with similar descriptions
    ...Array(8).fill().map((_, i) => ({
      id: `sub-${i + 1}`,
      date: randomDate(),
      description: [
        'Monthly Subscription - Netflix',
        'Monthly Subscription - Spotify',
        'Monthly Subscription - Disney+',
        'Monthly Subscription - Hulu',
        'Monthly Subscription - HBO Max',
        'Monthly Subscription - Amazon Prime',
        'Monthly Subscription - Apple TV+',
        'Monthly Subscription - YouTube Premium'
      ][i],
      merchant: [
        'Netflix',
        'Spotify',
        'Disney',
        'Hulu',
        'HBO',
        'Amazon',
        'Apple',
        'YouTube'
      ][i],
      amount: randomAmount(8, 20),
      type: 'expense',
      source: 'credit_card'
    })),
    
    // Groceries from different stores
    ...Array(12).fill().map((_, i) => ({
      id: `grocery-${i + 1}`,
      date: randomDate(),
      description: `Grocery shopping ${['weekly', 'weekend', 'express', 'monthly'][i % 4]}`,
      merchant: [
        'Whole Foods',
        'Trader Joe\'s',
        'Safeway',
        'Kroger',
        'Aldi',
        'Costco'
      ][i % 6],
      amount: randomAmount(30, 200),
      type: 'expense',
      source: 'credit_card'
    })),
    
    // Utilities with similar keywords
    ...Array(5).fill().map((_, i) => ({
      id: `util-${i + 1}`,
      date: randomDate(),
      description: [
        'Electricity bill payment',
        'Water service monthly',
        'Internet provider bill',
        'Cell phone payment',
        'Gas utility payment'
      ][i],
      merchant: [
        'Power Company',
        'Water Utility',
        'ISP Provider',
        'Cellular Provider',
        'Gas Company'
      ][i],
      amount: randomAmount(40, 150),
      type: 'expense',
      source: 'bank'
    })),
    
    // Single large transactions
    {
      id: 'rent-1',
      date: '2025-03-01',
      description: 'Monthly Rent Payment',
      merchant: 'Property Management',
      amount: 1800.00,
      type: 'expense',
      source: 'bank'
    },
    {
      id: 'salary-1',
      date: '2025-03-15',
      description: 'Salary Deposit',
      merchant: 'Employer Inc',
      amount: 3500.00,
      type: 'income',
      source: 'bank'
    },
    {
      id: 'salary-2',
      date: '2025-03-30',
      description: 'Salary Deposit',
      merchant: 'Employer Inc',
      amount: 3500.00,
      type: 'income',
      source: 'bank'
    }
  ];
}

// Test function
async function testBatchOrganization() {
  console.log('===== TESTING REALISTIC BATCH ORGANIZATION =====\n');
  
  // Generate 60+ realistic transactions
  const transactions = generateRealisticTransactions();
  console.log(`Generated ${transactions.length} realistic transactions for testing\n`);
  
  // Split transactions by type for inspection
  const incomeTransactions = transactions.filter(tx => tx.type === 'income');
  const expenseTransactions = transactions.filter(tx => tx.type === 'expense');
  
  console.log(`Income transactions: ${incomeTransactions.length}`);
  console.log(`Expense transactions: ${expenseTransactions.length}`);
  
  // Organize transactions into batches
  const batchModule = require('./batch-title-generation-module');
  const organizeFn = batchModule.organizeIntoBatches;
  const titleFn = batchModule.generateBatchTitle;
  
  console.log('\nOrganizing transactions into batches...\n');
  
  // For this test, we'll use our own implementation if the imported one isn't available
  const organizedBatches = typeof organizeFn === 'function' 
    ? organizeFn(transactions)
    : organizeByTypeAndSource(transactions);
  
  // Print batch statistics
  console.log(`Organized ${transactions.length} transactions into ${organizedBatches.length} batches:\n`);
  
  const batches = organizedBatches.sort((a, b) => {
    // Sort by transaction type first (income, then expense)
    const typeA = a.transactions[0]?.type || 'expense';
    const typeB = b.transactions[0]?.type || 'expense';
    if (typeA === 'income' && typeB !== 'income') return -1;
    if (typeA !== 'income' && typeB === 'income') return 1;
    
    // Then by merchant name if available
    const merchantA = getMostCommonMerchant(a.transactions);
    const merchantB = getMostCommonMerchant(b.transactions);
    if (merchantA && merchantB) return merchantA.localeCompare(merchantB);
    
    // Then by transaction count
    return b.transactions.length - a.transactions.length;
  });
  
  // Display batch information
  batches.forEach((batch, index) => {
    const title = batch.title || (typeof titleFn === 'function' 
      ? titleFn(batch.batchId || `batch_${index}`, batch.transactions)
      : `Batch ${index + 1}`);
    
    console.log(`\n== Batch ${index + 1}: ${title} ==`);
    console.log(`Transactions: ${batch.transactions.length}`);
    
    // Calculate statistics
    const totalIncome = batch.transactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    
    const totalExpense = batch.transactions
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    
    console.log(`Income: $${totalIncome.toFixed(2)}`);
    console.log(`Expenses: $${totalExpense.toFixed(2)}`);
    
    // Display unique merchants
    const merchants = [...new Set(batch.transactions
      .map(tx => tx.merchant)
      .filter(Boolean))];
    
    if (merchants.length > 0) {
      console.log(`Merchants: ${merchants.slice(0, 5).join(', ')}${merchants.length > 5 ? '...' : ''}`);
    }
    
    // Display sample transactions
    console.log('\nSample transactions:');
    batch.transactions.slice(0, 3).forEach((tx, txIndex) => {
      console.log(`  ${txIndex + 1}. ${tx.description.substring(0, 40)} - $${tx.amount} (${tx.type})`);
    });
    
    console.log('\n----------------------------------');
  });
  
  // Analyze batch quality
  const stats = {
    averageTransactionsPerBatch: transactions.length / batches.length,
    singleTransactionBatches: batches.filter(b => b.transactions.length === 1).length,
    largeBatches: batches.filter(b => b.transactions.length > 10).length
  };
  
  console.log('\n===== BATCH QUALITY ANALYSIS =====');
  console.log(`Average transactions per batch: ${stats.averageTransactionsPerBatch.toFixed(2)}`);
  console.log(`Single transaction batches: ${stats.singleTransactionBatches}`);
  console.log(`Large batches (>10 transactions): ${stats.largeBatches}`);
  console.log(`Total batches: ${batches.length}`);
  
  return batches;
}

// Helper function to organize by type and source if imported function is unavailable
function organizeByTypeAndSource(transactions) {
  const batchGroups = {};
  
  // First separate by transaction type (income/expense)
  transactions.forEach(tx => {
    const type = tx.type || 'expense';
    const source = tx.source || 'unknown';
    const merchant = tx.merchant;
    const key = merchant && merchant.length < 15
      ? `${type}_${merchant}`
      : `${type}_${source}`;
    
    if (!batchGroups[key]) {
      batchGroups[key] = [];
    }
    
    batchGroups[key].push(tx);
  });
  
  // Convert to array of batch objects
  return Object.keys(batchGroups).map(key => ({
    batchId: key,
    transactions: batchGroups[key]
  }));
}

// Helper function to get most common merchant in a batch
function getMostCommonMerchant(transactions) {
  const merchantCounts = {};
  
  transactions.forEach(tx => {
    if (tx.merchant) {
      merchantCounts[tx.merchant] = (merchantCounts[tx.merchant] || 0) + 1;
    }
  });
  
  if (Object.keys(merchantCounts).length === 0) return null;
  
  return Object.keys(merchantCounts).sort((a, b) => 
    merchantCounts[b] - merchantCounts[a]
  )[0];
}

// Run the test
testBatchOrganization()
  .then(() => console.log('\nTest completed successfully!'))
  .catch(err => console.error('Error in test:', err));