const express = require('express');
const router = express.Router();
const { getDB } = require('../db/sequelize');
const { Op, QueryTypes, literal, fn, col } = require('sequelize');
const { promisify } = require('util');

// Get the Sequelize models
const getModels = () => {
  const sequelize = getDB();
  return sequelize.models;
};

// Get transactions by category
router.get('/by-category', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const sequelize = getDB();
    
    // Query to get transaction totals by category
    const results = await sequelize.query(`
      SELECT 
        c.id, 
        c.name, 
        c.color, 
        c.type,
        COUNT(t.id) as transaction_count,
        SUM(t.amount) as total_amount
      FROM categories c
      LEFT JOIN transactions t ON c.id = t.category_id
      GROUP BY c.id, c.name, c.color, c.type
      ORDER BY c.type, total_amount DESC
    `, {
      type: QueryTypes.SELECT
    });
    
    // Format the results
    const formattedResults = results.map(item => ({
      id: item.id,
      name: item.name,
      color: item.color,
      type: item.type,
      transactionCount: parseInt(item.transaction_count) || 0,
      totalAmount: parseFloat(item.total_amount) || 0
    }));
    
    // Group by type
    const income = formattedResults.filter(item => item.type === 'income');
    const expense = formattedResults.filter(item => item.type === 'expense');
    
    res.json({
      categories: formattedResults,
      income,
      expense
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly totals (income vs. expenses)
router.get('/monthly-totals', async (req, res) => {
  try {
    const { Transaction } = getModels();
    const sequelize = getDB();
    
    // Query to get monthly totals
    const results = await sequelize.query(`
      SELECT 
        TO_CHAR(date, 'YYYY-MM') as month,
        type,
        SUM(amount) as total
      FROM transactions
      GROUP BY TO_CHAR(date, 'YYYY-MM'), type
      ORDER BY month
    `, {
      type: QueryTypes.SELECT
    });
    
    // Format into months with income and expense data
    const monthlyData = {};
    
    results.forEach(item => {
      const month = item.month;
      
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month,
          income: 0,
          expense: 0,
          net: 0
        };
      }
      
      if (item.type === 'income') {
        monthlyData[month].income = parseFloat(item.total) || 0;
      } else {
        monthlyData[month].expense = parseFloat(item.total) || 0;
      }
      
      monthlyData[month].net = monthlyData[month].income - monthlyData[month].expense;
    });
    
    // Convert to array and sort by month
    const monthlyTotals = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
    
    res.json(monthlyTotals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get income vs. expenses summary
router.get('/income-vs-expenses', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    
    // Calculate totals grouped by transaction type
    const totals = await Transaction.findAll({
      attributes: [
        'type',
        [fn('SUM', col('amount')), 'total']
      ],
      group: ['type']
    });
    
    // Format the results
    const totalsByType = totals.reduce((acc, item) => {
      acc[item.type] = parseFloat(item.getDataValue('total')) || 0;
      return acc;
    }, { income: 0, expense: 0 });
    
    const totalIncome = totalsByType.income || 0;
    const totalExpenses = totalsByType.expense || 0;
    const net = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
    
    res.json({
      income: totalIncome,
      expenses: totalExpenses,
      net,
      savingsRate
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top merchants by total spending
router.get('/top-merchants', async (req, res) => {
  try {
    const { Transaction } = getModels();
    const sequelize = getDB();
    const limit = parseInt(req.query.limit) || 10;
    
    // Query to get top merchants by total spending
    const results = await sequelize.query(`
      SELECT 
        merchant,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM transactions
      WHERE merchant IS NOT NULL AND merchant != '' AND type = 'expense'
      GROUP BY merchant
      ORDER BY total_amount DESC
      LIMIT :limit
    `, {
      replacements: { limit },
      type: QueryTypes.SELECT
    });
    
    // Format the results
    const topMerchants = results.map(item => ({
      merchant: item.merchant,
      count: parseInt(item.transaction_count),
      total: parseFloat(item.total_amount)
    }));
    
    res.json(topMerchants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get categorization status (percentage of transactions categorized)
router.get('/categorization-status', async (req, res) => {
  try {
    const { Transaction } = getModels();
    
    // Count total transactions
    const total = await Transaction.count();
    
    // Count categorized transactions
    const categorized = await Transaction.count({
      where: {
        categoryId: {
          [Op.not]: null
        }
      }
    });
    
    const uncategorized = total - categorized;
    const percentage = total > 0 ? (categorized / total) * 100 : 0;
    
    res.json({
      total,
      categorized,
      uncategorized,
      percentage
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard endpoint - combines multiple reports
router.get('/dashboard', async (req, res) => {
  try {
    // Create a promise-based version of the request handler functions
    const getIncomeVsExpensesData = async () => {
      const { Transaction } = getModels();
      
      // Calculate totals grouped by transaction type
      const totals = await Transaction.findAll({
        attributes: [
          'type',
          [fn('SUM', col('amount')), 'total']
        ],
        group: ['type']
      });
      
      // Format the results
      const totalsByType = totals.reduce((acc, item) => {
        acc[item.type] = parseFloat(item.getDataValue('total')) || 0;
        return acc;
      }, { income: 0, expense: 0 });
      
      const totalIncome = totalsByType.income || 0;
      const totalExpenses = totalsByType.expense || 0;
      const net = totalIncome - totalExpenses;
      const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;
      
      return {
        income: totalIncome,
        expenses: totalExpenses,
        net,
        savingsRate
      };
    };
    
    const getCategorizationData = async () => {
      const { Transaction } = getModels();
      
      // Count total transactions
      const total = await Transaction.count();
      
      // Count categorized transactions
      const categorized = await Transaction.count({
        where: {
          categoryId: {
            [Op.not]: null
          }
        }
      });
      
      const uncategorized = total - categorized;
      const percentage = total > 0 ? (categorized / total) * 100 : 0;
      
      return {
        total,
        categorized,
        uncategorized,
        percentage
      };
    };
    
    const getTopMerchantsData = async (limit = 5) => {
      const sequelize = getDB();
      
      // Query to get top merchants by total spending
      const results = await sequelize.query(`
        SELECT 
          merchant,
          COUNT(*) as transaction_count,
          SUM(amount) as total_amount
        FROM transactions
        WHERE merchant IS NOT NULL AND merchant != '' AND type = 'expense'
        GROUP BY merchant
        ORDER BY total_amount DESC
        LIMIT :limit
      `, {
        replacements: { limit },
        type: QueryTypes.SELECT
      });
      
      // Format the results
      return results.map(item => ({
        merchant: item.merchant,
        count: parseInt(item.transaction_count),
        total: parseFloat(item.total_amount)
      }));
    };
    
    const getRecentTransactions = async (limit = 10) => {
      const { Transaction, Category } = getModels();
      
      // Get recent transactions
      const transactions = await Transaction.findAll({
        limit,
        order: [['date', 'DESC']],
        include: [{
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color']
        }]
      });
      
      // Format the transactions
      return transactions.map(tx => {
        const plainTx = tx.get({ plain: true });
        return {
          id: plainTx.id,
          date: plainTx.date,
          description: plainTx.description,
          amount: parseFloat(plainTx.amount),
          type: plainTx.type,
          merchant: plainTx.merchant,
          category: plainTx.category,
        };
      });
    };
    
    // Execute all queries in parallel
    const [incomeVsExpenses, categorization, topMerchants, recentTransactions] = 
      await Promise.all([
        getIncomeVsExpensesData(), 
        getCategorizationData(), 
        getTopMerchantsData(5),
        getRecentTransactions(10)
      ]);
    
    // Combine all data into a single dashboard response
    res.json({
      incomeVsExpenses,
      categorization,
      topMerchants,
      recentTransactions
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get spending trends over time
router.get('/spending-trends', async (req, res) => {
  try {
    const { Transaction, Category } = getModels();
    const sequelize = getDB();
    
    // Get time range from query params or use default of last 6 months
    const numMonths = parseInt(req.query.months) || 6;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - numMonths);
    
    // Format dates for PostgreSQL
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Query to get spending by category over time
    const results = await sequelize.query(`
      SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        TO_CHAR(t.date, 'YYYY-MM') as month,
        SUM(t.amount) as total
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE 
        t.date BETWEEN :startDate AND :endDate
        AND t.type = 'expense'
      GROUP BY c.id, c.name, c.color, TO_CHAR(t.date, 'YYYY-MM')
      ORDER BY c.name, month
    `, {
      replacements: { startDate: startDateStr, endDate: endDateStr },
      type: QueryTypes.SELECT
    });
    
    // Format the results into a structure suitable for charts
    // First, get all unique months and categories
    const uniqueMonths = [...new Set(results.map(item => item.month))].sort();
    const categories = [...new Set(results.map(item => item.category_id))].map(id => {
      const categoryData = results.find(item => item.category_id === id);
      return {
        id,
        name: categoryData?.category_name || 'Unknown',
        color: categoryData?.category_color || '#cccccc'
      };
    });
    
    // Then build the dataset
    const datasets = categories.map(category => {
      const data = uniqueMonths.map(month => {
        const entry = results.find(item => 
          item.category_id === category.id && item.month === month
        );
        return entry ? parseFloat(entry.total) : 0;
      });
      
      return {
        categoryId: category.id,
        label: category.name,
        data,
        backgroundColor: category.color,
        borderColor: category.color
      };
    });
    
    res.json({
      labels: uniqueMonths,
      datasets,
      categories
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;