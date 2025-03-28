const fs = require('fs');
const csvParse = require('csv-parse');
const xml2js = require('xml2js');
const Transaction = require('../models/transaction');

/**
 * Service to parse different file formats (CSV, XML) into transaction objects
 */
class FileParser {
  /**
   * Parse a CSV file into an array of transaction objects
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const transactions = [];
      
      fs.createReadStream(filePath)
        .pipe(csvParse({
          columns: true, // Treat the first line as header
          trim: true,    // Trim whitespace
          skip_empty_lines: true,
          cast: true     // Attempt to convert values to native types
        }))
        .on('data', (row) => {
          try {
            const transaction = Transaction.fromCSV(row);
            transactions.push(transaction);
          } catch (error) {
            console.error('Error processing CSV row:', error);
            // Continue processing other rows
          }
        })
        .on('error', (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        })
        .on('end', () => {
          resolve(transactions);
        });
    });
  }

  /**
   * Parse an XML file into an array of transaction objects
   * @param {string} filePath - Path to the XML file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseXML(filePath) {
    return new Promise((resolve, reject) => {
      const parser = new xml2js.Parser({ explicitArray: true });
      
      fs.readFile(filePath, (err, data) => {
        if (err) {
          return reject(new Error(`Error reading XML file: ${err.message}`));
        }
        
        parser.parseString(data, (parseErr, result) => {
          if (parseErr) {
            return reject(new Error(`XML parsing error: ${parseErr.message}`));
          }
          
          try {
            const transactions = [];
            
            // This implementation assumes a specific XML structure
            // It would need to be adjusted based on the actual format
            let transactionItems = [];
            
            // Try to find transactions in the XML tree
            // Example paths to check for different bank export formats
            const possiblePaths = [
              result?.Transactions?.Transaction,
              result?.transactions?.transaction,
              result?.bankTransactions?.transaction,
              result?.StatementData?.Transaction,
              result?.document?.transactions?.transaction
            ];
            
            for (const path of possiblePaths) {
              if (Array.isArray(path)) {
                transactionItems = path;
                break;
              }
            }
            
            // If transactions not found through common paths, try to search deeper
            if (transactionItems.length === 0) {
              console.warn('Could not find transactions with common XML paths');
            }
            
            // Process found transactions
            for (const item of transactionItems) {
              try {
                const transaction = Transaction.fromXML(item);
                transactions.push(transaction);
              } catch (itemError) {
                console.error('Error processing XML item:', itemError);
                // Continue processing other items
              }
            }
            
            resolve(transactions);
          } catch (processError) {
            reject(new Error(`Error processing XML data: ${processError.message}`));
          }
        });
      });
    });
  }

  /**
   * Parse a file based on its extension
   * @param {string} filePath - Path to the file
   * @returns {Promise<Transaction[]>} Array of transaction objects
   */
  static parseFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return Promise.reject(new Error(`File not found: ${filePath}`));
    }
    
    const fileExtension = filePath.split('.').pop().toLowerCase();
    
    switch (fileExtension) {
      case 'csv':
        return this.parseCSV(filePath);
      case 'xml':
        return this.parseXML(filePath);
      default:
        return Promise.reject(new Error(`Unsupported file format: ${fileExtension}`));
    }
  }

  /**
   * Extract filename from a file path
   * @param {string} filePath - Full path to the file
   * @returns {string} Just the filename
   */
  static getFileName(filePath) {
    return filePath.split('/').pop();
  }
}

module.exports = FileParser;
