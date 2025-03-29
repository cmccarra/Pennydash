/**
 * Utility script to temporarily simulate OpenAI API failures
 * This script modifies the openai.js file to force all API calls to fail
 * Useful for testing the fallback mechanism
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Path to the OpenAI service file
const OPENAI_SERVICE_PATH = path.join(__dirname, 'src', 'server', 'services', 'openai.js');

// Target function to modify
const TARGET_FUNCTION = 'callWithRetry';
const SIMULATION_FLAG = '[OpenAI] Simulating API failure for testing';

// Backup management
const BACKUP_SUFFIX = '.backup';
const BACKUP_PATH = `${OPENAI_SERVICE_PATH}${BACKUP_SUFFIX}`;

// Create backup of original file if it doesn't exist
function createBackupIfNeeded() {
  if (!fs.existsSync(BACKUP_PATH)) {
    console.log('Creating backup of original OpenAI service file...');
    fs.copyFileSync(OPENAI_SERVICE_PATH, BACKUP_PATH);
    console.log(`Backup created at ${BACKUP_PATH}`);
  } else {
    console.log('Backup already exists, skipping backup creation');
  }
}

// Restore from backup
function restoreFromBackup() {
  if (fs.existsSync(BACKUP_PATH)) {
    console.log('Restoring original OpenAI service file from backup...');
    fs.copyFileSync(BACKUP_PATH, OPENAI_SERVICE_PATH);
    console.log('Original file restored');
    return true;
  } else {
    console.error('Error: Backup file not found. Cannot restore.');
    return false;
  }
}

// Check if simulation is already enabled
function isSimulationEnabled() {
  const content = fs.readFileSync(OPENAI_SERVICE_PATH, 'utf8');
  return content.includes(SIMULATION_FLAG);
}

// Modify the OpenAI service to simulate API failures
function enableSimulation() {
  createBackupIfNeeded();
  
  if (isSimulationEnabled()) {
    console.log('Simulation already enabled');
    return;
  }
  
  console.log('Modifying OpenAI service to simulate API failures...');
  
  const fileContent = fs.readFileSync(OPENAI_SERVICE_PATH, 'utf8');
  
  // Find the callWithRetry function
  const functionRegex = new RegExp(`async\\s+function\\s+${TARGET_FUNCTION}\\s*\\([^)]*\\)\\s*\\{`, 'm');
  const match = fileContent.match(functionRegex);
  
  if (!match) {
    console.error(`Error: Could not find ${TARGET_FUNCTION} function in the file.`);
    return;
  }
  
  const position = match.index + match[0].length;
  
  // Insert code to simulate API failure at the beginning of the function
  const modifiedContent = 
    fileContent.slice(0, position) + 
    `
  console.log('${SIMULATION_FLAG}');
  if (process.env.SIMULATE_OPENAI_FAILURE === 'true') {
    const error = new Error('OpenAI API rate limited');
    this.updateMetrics({ error: true, rateLimited: true });
    throw error;
  }
  
` + 
    fileContent.slice(position);
  
  // Write the modified content back to the file
  fs.writeFileSync(OPENAI_SERVICE_PATH, modifiedContent);
  
  console.log('Simulation enabled. Set SIMULATE_OPENAI_FAILURE=true to trigger failures.');
}

// Main function
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('========================================');
  console.log('OpenAI Failure Simulation Tool');
  console.log('========================================');
  console.log();
  console.log('This tool modifies the OpenAI service to simulate API failures');
  console.log('Options:');
  console.log('  1. Enable simulation');
  console.log('  2. Restore original file');
  console.log('  3. Exit');
  console.log();
  
  const answer = await new Promise(resolve => {
    rl.question('Select an option (1/2/3): ', resolve);
  });
  
  switch (answer.trim()) {
    case '1':
      enableSimulation();
      break;
    case '2':
      restoreFromBackup();
      break;
    case '3':
      console.log('Exiting without changes');
      break;
    default:
      console.log('Invalid option. Exiting without changes');
  }
  
  rl.close();
}

// Run the main function
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});