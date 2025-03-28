const express = require('express');
const router = express.Router();
const { getDB } = require('../db/sequelize');
const { Op } = require('sequelize');

// Get the Sequelize models
const getModels = () => {
  const sequelize = getDB();
  return sequelize.models;
};

// Get all categories
router.get('/', async (req, res) => {
  try {
    const { Category } = getModels();
    
    // Get all categories with their parent categories
    const categories = await Category.findAll({
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'color', 'icon']
        }
      ],
      order: [
        ['type', 'ASC'],
        ['name', 'ASC']
      ]
    });
    
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific category
router.get('/:id', async (req, res) => {
  try {
    const { Category, Transaction } = getModels();
    
    const category = await Category.findByPk(req.params.id, {
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'color', 'icon']
        },
        {
          model: Category,
          as: 'children',
          attributes: ['id', 'name', 'color', 'icon']
        }
      ]
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Count transactions for this category
    const transactionCount = await Transaction.count({
      where: { categoryId: req.params.id }
    });
    
    const result = category.toJSON();
    result.transactionCount = transactionCount;
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new category
router.post('/', async (req, res) => {
  try {
    const { Category } = getModels();
    const categoryData = req.body;
    
    // Set a random color if none provided
    if (!categoryData.color) {
      categoryData.color = Category.generateRandomColor();
    }
    
    try {
      const newCategory = await Category.create(categoryData);
      res.status(201).json(newCategory);
    } catch (validationError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: validationError.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a category
router.put('/:id', async (req, res) => {
  try {
    const { Category } = getModels();
    const categoryData = req.body;
    
    // Find the category first
    const category = await Category.findByPk(req.params.id);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Update the category
    await category.update(categoryData);
    
    // Get the updated category with related data
    const updatedCategory = await Category.findByPk(req.params.id, {
      include: [
        {
          model: Category,
          as: 'parent',
          attributes: ['id', 'name', 'color', 'icon']
        }
      ]
    });
    
    res.json(updatedCategory);
  } catch (error) {
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Delete a category
router.delete('/:id', async (req, res) => {
  try {
    const { Category, Transaction } = getModels();
    const sequelize = getDB();
    
    // Start a transaction to ensure data consistency
    const t = await sequelize.transaction();
    
    try {
      // Check if category exists
      const category = await Category.findByPk(req.params.id, { transaction: t });
      
      if (!category) {
        await t.rollback();
        return res.status(404).json({ error: 'Category not found' });
      }
      
      // Check if category has transactions
      const transactionCount = await Transaction.count({
        where: { categoryId: req.params.id },
        transaction: t
      });
      
      if (transactionCount > 0) {
        await t.rollback();
        return res.status(400).json({ 
          error: `Cannot delete category with ${transactionCount} associated transactions` 
        });
      }
      
      // Check if category has child categories
      const childrenCount = await Category.count({
        where: { parentId: req.params.id },
        transaction: t
      });
      
      if (childrenCount > 0) {
        await t.rollback();
        return res.status(400).json({ 
          error: `Cannot delete category with ${childrenCount} child categories` 
        });
      }
      
      // Delete the category
      await category.destroy({ transaction: t });
      
      await t.commit();
      res.status(204).send();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for a specific category
router.get('/:id/transactions', async (req, res) => {
  try {
    const { Category, Transaction } = getModels();
    const categoryId = req.params.id;
    
    // Check if category exists
    const category = await Category.findByPk(categoryId);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Get transactions for this category
    const transactions = await Transaction.findAll({
      where: { categoryId },
      order: [['date', 'DESC']],
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon']
        }
      ]
    });
    
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get category statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { Category, Transaction } = getModels();
    const sequelize = getDB();
    
    // Get all categories with transaction counts and total amounts
    const categories = await Category.findAll({
      attributes: [
        'id', 
        'name', 
        'color', 
        'type',
        [
          sequelize.fn('COUNT', sequelize.col('transactions.id')), 
          'transactionCount'
        ],
        [
          sequelize.fn('SUM', sequelize.col('transactions.amount')), 
          'totalAmount'
        ]
      ],
      include: [
        {
          model: Transaction,
          as: 'transactions',
          attributes: []
        }
      ],
      group: ['Category.id'],
      order: [
        ['type', 'ASC'],
        ['name', 'ASC']
      ]
    });
    
    // Format the response
    const formattedCategories = categories.map(category => {
      const json = category.toJSON();
      return {
        ...json,
        transactionCount: parseInt(json.transactionCount || 0),
        totalAmount: parseFloat(json.totalAmount || 0)
      };
    });
    
    // Group by type (income vs expense)
    const typeGroups = {
      income: formattedCategories.filter(c => c.type === 'income'),
      expense: formattedCategories.filter(c => c.type === 'expense')
    };
    
    res.json({
      categories: formattedCategories,
      typeGroups
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;