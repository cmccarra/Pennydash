const express = require('express');
const router = express.Router();
const db = require('../db/inMemoryDB');
const Category = require('../models/category');

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await db.getAllCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific category
router.get('/:id', async (req, res) => {
  try {
    const category = await db.getCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new category
router.post('/', async (req, res) => {
  try {
    const categoryData = req.body;
    
    // Set a random color if none provided
    if (!categoryData.color) {
      categoryData.color = Category.generateRandomColor();
    }
    
    const errors = Category.validate(categoryData);
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const category = new Category(categoryData);
    const savedCategory = await db.addCategory(category);
    
    res.status(201).json(savedCategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a category
router.put('/:id', async (req, res) => {
  try {
    const categoryData = req.body;
    const errors = Category.validate(categoryData);
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const updatedCategory = await db.updateCategory(req.params.id, categoryData);
    
    if (!updatedCategory) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a category
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.deleteCategory(req.params.id);
    
    if (!result) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    if (error.message.includes('associated transactions')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for a specific category
router.get('/:id/transactions', async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await db.getCategoryById(categoryId);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const transactions = await db.getAllTransactions();
    const categoryTransactions = transactions.filter(t => t.categoryId === categoryId);
    
    res.json(categoryTransactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
