const express = require('express');
const router = express.Router();
const db = require('../db/inMemoryDB');

// Get spending by category
router.get('/by-category', async (req, res) => {
  try {
    const result = await db.getTransactionsByCategory();
    
    // Format the data for the frontend charts
    const formattedData = result.map(item => ({
      categoryId: item.category.id,
      categoryName: item.category.name,
      categoryColor: item.category.color,
      amount: item.total,
      count: item.count
    }));
    
    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly spending totals
router.get('/monthly-totals', async (req, res) => {
  try {
    const monthlyData = await db.getMonthlyTotals();
    res.json(monthlyData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get income vs expenses summary
router.get('/income-vs-expenses', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    const categories = await db.getAllCategories();
    
    let totalIncome = 0;
    let totalExpenses = 0;
    
    for (const transaction of transactions) {
      const category = categories.find(c => c.id === transaction.categoryId);
      
      if (category && category.type === 'income') {
        totalIncome += transaction.amount;
      } else {
        totalExpenses += transaction.amount;
      }
    }
    
    res.json({
      income: totalIncome,
      expenses: totalExpenses,
      balance: totalIncome - totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top merchants/vendors
router.get('/top-merchants', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    const limit = parseInt(req.query.limit) || 10;
    
    // Group transactions by merchant/description
    const merchantMap = {};
    
    for (const transaction of transactions) {
      const merchant = transaction.description;
      
      if (!merchantMap[merchant]) {
        merchantMap[merchant] = {
          name: merchant,
          totalAmount: 0,
          count: 0
        };
      }
      
      merchantMap[merchant].totalAmount += transaction.amount;
      merchantMap[merchant].count += 1;
    }
    
    // Convert to array and sort by amount
    const merchants = Object.values(merchantMap)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);
    
    res.json(merchants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categorization status
router.get('/categorization-status', async (req, res) => {
  try {
    const transactions = await db.getAllTransactions();
    
    const categorized = transactions.filter(t => t.categoryId).length;
    const uncategorized = transactions.length - categorized;
    
    res.json({
      total: transactions.length,
      categorized,
      uncategorized,
      percentage: transactions.length > 0 
        ? Math.round((categorized / transactions.length) * 100) 
        : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
