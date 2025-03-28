const express = require('express');
const router = express.Router();
const db = require('../db/inMemoryDB');

// Get settings
router.get('/', async (req, res) => {
  try {
    const settings = db.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: true, message: error.message });
  }
});

// Update settings
router.put('/', async (req, res) => {
  try {
    const updatedSettings = db.updateSettings(req.body);
    res.json(updatedSettings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: true, message: error.message });
  }
});

module.exports = router;