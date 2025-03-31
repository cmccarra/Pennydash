/**
 * Test script to verify the batch titles and batch organization functionality
 */
import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function testBatchTitles() {
  try {
    console.log('Testing batch titles functionality...');
    
    // Step 1: Upload some sample data
    console.log("Creating test upload...");
    // Use our test-transactions.csv which is already verified to work
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-transactions.csv'));
    formData.append('enrichMode', 'true');
    
    const uploadResponse = await fetch(`${API_URL}/transactions/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadData = await uploadResponse.json();
    
    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadData.error || uploadResponse.statusText}`);
    }
    
    // Extract the uploadId from the transactions
    const uploadId = uploadData.transactions && uploadData.transactions.length > 0 ?
      uploadData.transactions[0].uploadId : null;
    
    if (!uploadId) {
      throw new Error('Upload succeeded but no uploadId was returned');
    }
    
    console.log(`\nUpload created with ID: ${uploadId}`);

    // Step 2: Get the batches with titles
    console.log('\nFetching batches with titles...');
    const batchesResponse = await fetchData(`${API_URL}/uploads/${uploadId}/batches`);
    
    console.log(`Found ${batchesResponse.batches.length} batches for upload ${uploadId}`);
    
    // Step 3: Display the batches with their titles
    console.log('\n=== BATCH TITLES ===');
    batchesResponse.batches.forEach((batch, index) => {
      console.log(`\nBatch ${index + 1}:`);
      console.log(`ID: ${batch.batchId}`);
      console.log(`Title: ${batch.title || 'No title'}`);
      console.log(`Transactions: ${batch.transactions.length}`);
      console.log(`Transaction types: ${collectTransactionTypes(batch.transactions)}`);
      
      // List the first 3 transactions in the batch as a sample
      console.log('\nSample transactions:');
      batch.transactions.slice(0, 3).forEach((tx, txIndex) => {
        console.log(`  ${txIndex + 1}. ${tx.description} - $${tx.amount} (${tx.type})`);
      });
      
      // Display batch statistics
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
    console.error('Error testing batch titles:', error);
    return false;
  }
}

// Helper function to format amounts with 2 decimal places
function formatAmount(amount) {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

// Helper function to collect unique transaction types
function collectTransactionTypes(transactions) {
  const types = new Set(transactions.map(tx => tx.type));
  return Array.from(types).join(', ');
}

// Upload a CSV file with test transactions
async function uploadSampleData() {
  try {
    // Create a larger transaction set with varied data
    const testData = generateLargeTestDataset(50); // 50 transactions
    const tempFilePath = './large-test-data.csv';
    
    // Write the generated data to a temp file
    fs.writeFileSync(tempFilePath, testData);
    console.log(`Created test data file with 50 transactions: ${tempFilePath}`);
    
    // Upload the file
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath));
    formData.append('enrichMode', 'true');
    
    const response = await fetch(`${API_URL}/transactions/upload`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    // Clean up the temp file
    fs.unlinkSync(tempFilePath);
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${data.error || response.statusText}`);
    }
    
    // Extract the uploadId from the transactions
    if (data.transactions && data.transactions.length > 0 && data.transactions[0].uploadId) {
      return data.transactions[0].uploadId;
    } else {
      throw new Error('Could not find uploadId in response');
    }
  } catch (error) {
    console.error('Error uploading sample data:', error);
    throw error;
  }
}

// Generate a large dataset with varied transaction data 
function generateLargeTestDataset(count = 50) {
  // CSV header
  let csv = 'Date,Description,Amount,Account,AccountType,Merchant,Tags,Currency,Balance\n';
  
  // Transaction templates for variety
  const templates = [
    // Groceries - multiple merchants
    { 
      description: "Grocery Shopping", 
      amount: -45.99, 
      account: "Chase Sapphire", 
      accountType: "credit_card",
      merchants: ["Whole Foods", "Trader Joe's", "Safeway", "Kroger", "Publix"],
      tags: "groceries;food",
      amountRange: [15, 150]
    },
    // Gas - multiple merchants
    {
      description: "Gas Fill-up",
      amount: -35.75,
      account: "Amex Platinum",
      accountType: "credit_card",
      merchants: ["Shell", "Chevron", "Exxon", "BP", "7-Eleven"],
      tags: "transportation;travel",
      amountRange: [25, 65]
    },
    // Food - multiple merchants
    {
      description: "Restaurant",
      amount: -45.00,
      account: "Capital One",
      accountType: "credit_card",
      merchants: ["Chipotle", "Panera", "Olive Garden", "Cheesecake Factory", "Local Restaurant"],
      tags: "dining;food",
      amountRange: [15, 120]
    },
    // Entertainment subscriptions
    {
      description: "Streaming Service",
      amount: -14.99,
      account: "Chase Checking",
      accountType: "bank",
      merchants: ["Netflix", "Hulu", "Disney+", "Spotify", "Amazon Prime"],
      tags: "entertainment;subscription",
      amountRange: [9, 20]
    },
    // Shopping
    {
      description: "Online Purchase",
      amount: -65.50,
      account: "Bank Debit",
      accountType: "bank",
      merchants: ["Amazon", "Target", "Walmart", "Best Buy", "Home Depot"],
      tags: "shopping;household",
      amountRange: [15, 200]
    },
    // Income sources
    {
      description: "Income",
      amount: 1250.00,
      account: "Chase Checking",
      accountType: "bank", 
      merchants: ["Employer", "Client Payment", "Freelance Work", "Side Gig", "Contract"],
      tags: "income;salary",
      amountRange: [500, 3000],
      type: "income"
    },
    // Utilities
    {
      description: "Utility Payment",
      amount: -120.50,
      account: "Bank Debit",
      accountType: "bank",
      merchants: ["City Utilities", "Water & Electric", "Gas Company", "Internet Provider", "Phone Company"],
      tags: "utilities;housing",
      amountRange: [50, 200]
    },
    // Large purchases
    {
      description: "Large Purchase",
      amount: -450.00,
      account: "Amex Platinum",
      accountType: "credit_card",
      merchants: ["Best Buy", "Apple Store", "Samsung", "Furniture Store", "Department Store"],
      tags: "large purchase;shopping",
      amountRange: [300, 1000]
    }
  ];
  
  // Generate random dates in the past 45 days
  const today = new Date();
  const transactions = [];
  
  for (let i = 0; i < count; i++) {
    // Select a random template
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    // Generate a random date within the past 45 days
    const randomDaysAgo = Math.floor(Math.random() * 45);
    const date = new Date(today);
    date.setDate(date.getDate() - randomDaysAgo);
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Select a random merchant from the template
    const merchant = template.merchants[Math.floor(Math.random() * template.merchants.length)];
    
    // Generate a random amount within the template's range
    const minAmount = template.amountRange[0];
    const maxAmount = template.amountRange[1];
    const randomAmount = (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(2);
    
    // Determine if this is an expense or income
    const amount = template.type === 'income' ? randomAmount : -randomAmount;
    
    // Generate a random balance (not important for this test)
    const balance = (1000 + Math.random() * 5000).toFixed(2);
    
    // Build a custom description with some variability
    let description = template.description;
    if (template.description === "Restaurant") {
      description = Math.random() > 0.5 ? `Dinner at ${merchant}` : `Lunch at ${merchant}`;
    } else if (template.description === "Streaming Service") {
      description = `${merchant} Subscription`;
    } else if (template.description === "Income") {
      description = Math.random() > 0.7 ? `${merchant} Deposit` : `${merchant} Income`;
    }
    
    // Add the transaction to the CSV data
    csv += `${formattedDate},${description},${amount},${template.account},${template.accountType},${merchant},${template.tags},USD,${balance}\n`;
    
    // Also store transaction objects for potential further use
    transactions.push({
      date: formattedDate,
      description,
      amount,
      account: template.account,
      accountType: template.accountType,
      merchant,
      tags: template.tags,
      type: amount >= 0 ? 'income' : 'expense',
      balance
    });
  }
  
  return csv;
}

// Run the test
testBatchTitles().then(() => {
  console.log('Test script completed.');
});