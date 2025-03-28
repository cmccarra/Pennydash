const express = require('express');
const router = express.Router();
const { getDB } = require('../db/sequelize');

// Get the Sequelize models
const getModels = () => {
  const sequelize = getDB();
  return sequelize.models;
};

// Get settings
router.get('/', async (req, res) => {
  try {
    const { Settings } = getModels();
    
    // Get the first settings object (there should only be one)
    let settings = await Settings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = await Settings.create({});
    }
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: true, message: error.message });
  }
});

// Update settings
router.put('/', async (req, res) => {
  try {
    const { Settings } = getModels();
    const updateData = req.body;
    
    // Get the first settings object
    let settings = await Settings.findOne();
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = await Settings.create(updateData);
    } else {
      // Update existing settings
      await settings.update(updateData);
    }
    
    // Get the updated settings
    const updatedSettings = await Settings.findByPk(settings.id);
    
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    
    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        error: true, 
        message: 'Validation error', 
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }
    
    res.status(500).json({ error: true, message: error.message });
  }
});

module.exports = router;