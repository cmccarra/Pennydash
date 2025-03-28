const express = require('express');
const router = express.Router();
const db = require('../db/inMemoryDB');

// Get transactions by category
router.get('/by-category', async (req, res) => {
  try {
    const byCategory = await db.getTransactionsByCategory();
    res.json(byCategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly totals (income vs. expenses)
router.get('/monthly-totals', async (req, res) => {
  try {
    const monthlyTotals = await db.getMonthlyTotals();
    res.json(monthlyTotals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get income vs. expenses summary
router.get('/income-vs-expenses', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    const categories = await db.getAllCategories();
    
    // Get income categories IDs
    const incomeCategories = categories
      .filter(c => c.type === 'income')
      .map(c => c.id);
    
    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    
    transactions.forEach(transaction => {
      if (transaction.categoryId && incomeCategories.includes(transaction.categoryId)) {
        totalIncome += transaction.amount || 0;
      } else {
        totalExpenses += transaction.amount || 0;
      }
    });
    
    res.json({
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top merchants by total spending
router.get('/top-merchants', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const transactions = await db.getAllTransactions();
    
    // Group by merchant
    const merchantTotals = {};
    
    for (const transaction of transactions) {
      // Skip if no merchant or it's income
      if (!transaction.merchant || transaction.type === 'income') continue;
      
      if (!merchantTotals[transaction.merchant]) {
        merchantTotals[transaction.merchant] = {
          merchant: transaction.merchant,
          count: 0,
          total: 0
        };
      }
      
      merchantTotals[transaction.merchant].count++;
      merchantTotals[transaction.merchant].total += transaction.amount || 0;
    }
    
    // Convert to array and sort by total
    const result = Object.values(merchantTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categorization status (percentage of transactions categorized)
router.get('/categorization-status', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    const categorized = transactions.filter(t => t.categoryId && t.categoryId !== '').length;
    const total = transactions.length;
    
    res.json({
      total,
      categorized,
      uncategorized: total - categorized,
      percentage: total > 0 ? (categorized / total) * 100 : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;