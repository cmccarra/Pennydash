<template>
  <div class="settings">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Settings Panel -->
      <div class="lg:col-span-2">
        <div class="card">
          <h2 class="text-xl font-semibold text-gray-800 mb-6">Application Settings</h2>
          
          <div v-if="isLoading" class="py-4 text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            <p class="mt-2 text-gray-600">Loading settings...</p>
          </div>
          
          <div v-else>
            <form @submit.prevent="saveSettings">
              <!-- AI Confidence Threshold -->
              <div class="mb-6">
                <label class="label">AI Confidence Threshold</label>
                <div class="flex items-center space-x-4">
                  <input 
                    type="range" 
                    v-model.number="settings.confidenceThreshold" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <span class="text-sm font-medium w-16 text-center">
                    {{ Math.round(settings.confidenceThreshold * 100) }}%
                  </span>
                </div>
                <p class="text-sm text-gray-600 mt-1">
                  This controls how confident the AI needs to be before automatically categorizing similar transactions.
                  Higher values mean more manual review, lower values mean more automatic categorization.
                </p>
              </div>
              
              <!-- Default Category -->
              <div class="mb-6">
                <label class="label">Default Category</label>
                <select v-model="settings.defaultCategory" class="input">
                  <option value="">-- Select a default category --</option>
                  <optgroup label="Expenses">
                    <option 
                      v-for="category in expenseCategories" 
                      :key="category.id" 
                      :value="category.id"
                    >
                      {{ category.name }}
                    </option>
                  </optgroup>
                  <optgroup label="Income">
                    <option 
                      v-for="category in incomeCategories" 
                      :key="category.id" 
                      :value="category.id"
                    >
                      {{ category.name }}
                    </option>
                  </optgroup>
                </select>
                <p class="text-sm text-gray-600 mt-1">
                  This category will be used as fallback when no category can be determined.
                </p>
              </div>
              
              <div class="flex justify-end">
                <button type="submit" class="btn btn-primary" :disabled="isSaving">
                  <span v-if="isSaving">Saving...</span>
                  <span v-else>Save Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
        
        <!-- Data Management -->
        <div class="card mt-6">
          <h2 class="text-xl font-semibold text-gray-800 mb-6">Data Management</h2>
          
          <div class="space-y-6">
            <!-- Import & Export -->
            <div>
              <h3 class="font-medium text-gray-700 mb-2">Import & Export</h3>
              <p class="text-sm text-gray-600 mb-3">
                Export your data as CSV for backup or import it into other applications.
              </p>
              <div class="flex flex-wrap gap-2">
                <button @click="exportData" class="btn btn-secondary flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                  Export Transactions
                </button>
              </div>
            </div>
            
            <!-- Training Data Management -->
            <div>
              <h3 class="font-medium text-gray-700 mb-2">AI Training</h3>
              <p class="text-sm text-gray-600 mb-3">
                Manage how the AI categorizes your transactions.
              </p>
              <button @click="retrainAI" class="btn btn-secondary flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
                </svg>
                Retrain Categorization AI
              </button>
            </div>
            
            <!-- Danger Zone -->
            <div>
              <h3 class="font-medium text-red-600 mb-2">Danger Zone</h3>
              <div class="border border-red-200 rounded-md p-4 bg-red-50">
                <p class="text-sm text-red-600 mb-3">
                  These actions cannot be undone. Be careful!
                </p>
                <div class="space-y-2">
                  <button 
                    @click="showResetModal = true" 
                    class="btn bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500 w-full justify-center"
                  >
                    Reset All Data
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Information Panel -->
      <div class="lg:col-span-1">
        <div class="card">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">About</h2>
          
          <div class="space-y-4">
            <div>
              <h3 class="font-medium text-gray-700">Budget App</h3>
              <p class="text-sm text-gray-600 mt-1">
                Version 1.0.0
              </p>
            </div>
            
            <div>
              <h3 class="font-medium text-gray-700">Features</h3>
              <ul class="text-sm text-gray-600 mt-1 space-y-1 list-disc list-inside">
                <li>Transaction import from CSV and XML</li>
                <li>Automatic transaction categorization</li>
                <li>Financial reporting and insights</li>
                <li>Category management</li>
              </ul>
            </div>
            
            <div>
              <h3 class="font-medium text-gray-700">Coming Soon</h3>
              <ul class="text-sm text-gray-600 mt-1 space-y-1 list-disc list-inside">
                <li>PDF statement parsing</li>
                <li>User accounts & authentication</li>
                <li>Advanced reporting with Metabase integration</li>
                <li>Budget planning and forecasting</li>
              </ul>
            </div>
            
            <div>
              <h3 class="font-medium text-gray-700">Reminders</h3>
              <p class="text-sm text-gray-600 mt-1">
                This application uses in-memory storage. Data will be lost when the server restarts.
                In future versions, data will be stored in MongoDB.
              </p>
            </div>
          </div>
        </div>
        
        <div class="card mt-6">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">Statistics</h2>
          
          <div v-if="isLoading" class="py-4 text-center">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
            <p class="mt-2 text-gray-600">Loading stats...</p>
          </div>
          
          <div v-else>
            <div class="space-y-4">
              <div class="flex justify-between">
                <span class="text-gray-700">Total Transactions:</span>
                <span class="font-medium">{{ stats.totalTransactions }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-700">Categorized:</span>
                <span class="font-medium">{{ stats.categorizedTransactions }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-700">Uncategorized:</span>
                <span class="font-medium">{{ stats.uncategorizedTransactions }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-700">Categories:</span>
                <span class="font-medium">{{ stats.totalCategories }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-700">Categorization Rate:</span>
                <span class="font-medium">{{ stats.categorizationRate }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Reset Confirmation Modal -->
    <div 
      v-if="showResetModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            Reset All Data
          </h3>
          
          <p class="mb-6 text-gray-700">
            This will permanently delete all your transactions, categories, and settings.
            This action cannot be undone.
          </p>
          
          <div class="mb-6">
            <label class="label">Type "RESET" to confirm</label>
            <input 
              v-model="resetConfirmation" 
              type="text" 
              class="input" 
              placeholder="RESET"
            />
          </div>
          
          <div class="flex justify-end space-x-3">
            <button 
              type="button" 
              @click="showResetModal = false" 
              class="btn btn-secondary"
            >
              Cancel
            </button>
            <button 
              type="button" 
              @click="resetAllData" 
              class="btn btn-danger"
              :disabled="resetConfirmation !== 'RESET'"
            >
              Reset All Data
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Export Modal -->
    <div 
      v-if="showExportModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            Export Data
          </h3>
          
          <p class="mb-6 text-gray-700">
            Your data is ready to download.
          </p>
          
          <div class="flex justify-end space-x-3">
            <button 
              type="button" 
              @click="showExportModal = false" 
              class="btn btn-secondary"
            >
              Close
            </button>
            <a 
              :href="exportUrl" 
              download="budget_transactions.csv" 
              class="btn btn-primary"
              @click="showExportModal = false"
            >
              Download CSV
            </a>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Notifications -->
    <div 
      v-if="notification" 
      class="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg z-50"
    >
      {{ notification }}
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
import { transactionsApi, categoriesApi, reportsApi } from '../services/api';

export default defineComponent({
  name: 'Settings',
  
  setup() {
    // State
    const isLoading = ref(true);
    const isSaving = ref(false);
    const settings = ref({
      confidenceThreshold: 0.7,
      defaultCategory: ''
    });
    const categories = ref([]);
    const showResetModal = ref(false);
    const showExportModal = ref(false);
    const resetConfirmation = ref('');
    const notification = ref('');
    const exportUrl = ref('');
    const stats = ref({
      totalTransactions: 0,
      categorizedTransactions: 0,
      uncategorizedTransactions: 0,
      totalCategories: 0,
      categorizationRate: 0
    });
    
    // Computed properties
    const expenseCategories = computed(() => {
      return categories.value.filter(c => c.type !== 'income');
    });
    
    const incomeCategories = computed(() => {
      return categories.value.filter(c => c.type === 'income');
    });
    
    // Methods
    const fetchSettings = async () => {
      isLoading.value = true;
      
      try {
        // Would normally fetch settings from API, using mock data for now
        // const settingsData = await settingsApi.get();
        // settings.value = settingsData;
        
        // For the MVP, we'll use hardcoded settings
        settings.value = {
          confidenceThreshold: 0.7,
          defaultCategory: '1' // First category ID
        };
        
        const [categoriesData, categorizationStatus] = await Promise.all([
          categoriesApi.getAll(),
          reportsApi.getCategorizationStatus()
        ]);
        
        categories.value = categoriesData;
        
        // Calculate stats
        stats.value = {
          totalTransactions: categorizationStatus.total,
          categorizedTransactions: categorizationStatus.categorized,
          uncategorizedTransactions: categorizationStatus.uncategorized,
          totalCategories: categories.value.length,
          categorizationRate: categorizationStatus.percentage
        };
      } catch (err) {
        console.error('Error fetching settings:', err);
        showNotification('Failed to load settings');
      } finally {
        isLoading.value = false;
      }
    };
    
    const saveSettings = async () => {
      isSaving.value = true;
      
      try {
        // Would normally save settings to API
        // await settingsApi.update(settings.value);
        
        // For the MVP, just show a success notification
        showNotification('Settings saved successfully');
      } catch (err) {
        console.error('Error saving settings:', err);
        showNotification('Failed to save settings');
      } finally {
        isSaving.value = false;
      }
    };
    
    const exportData = async () => {
      try {
        // Fetch all transactions
        const transactions = await transactionsApi.getAll();
        
        if (transactions.length === 0) {
          showNotification('No transactions to export');
          return;
        }
        
        // Convert to CSV
        const headers = ['Date', 'Description', 'Amount', 'Type', 'Category', 'Notes'];
        const csvContent = [
          headers.join(','),
          ...transactions.map(t => {
            const category = categories.value.find(c => c.id === t.categoryId);
            return [
              t.date,
              `"${t.description.replace(/"/g, '""')}"`,
              t.amount,
              t.type,
              category ? `"${category.name}"` : '',
              `"${(t.notes || '').replace(/"/g, '""')}"`
            ].join(',');
          })
        ].join('\n');
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv' });
        exportUrl.value = URL.createObjectURL(blob);
        showExportModal.value = true;
      } catch (err) {
        console.error('Error exporting data:', err);
        showNotification('Failed to export data');
      }
    };
    
    const retrainAI = () => {
      // In a real implementation, this would call an API endpoint to retrain the model
      showNotification('AI retraining initiated. This may take a moment.');
      
      // Simulate a delay for the "training" process
      setTimeout(() => {
        showNotification('Categorization AI has been retrained with your latest data.');
      }, 2000);
    };
    
    const resetAllData = () => {
      if (resetConfirmation.value !== 'RESET') return;
      
      // In a real implementation, this would call an API endpoint to reset all data
      showNotification('All data has been reset.');
      showResetModal.value = false;
      resetConfirmation.value = '';
      
      // Refresh the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    };
    
    const showNotification = (message) => {
      notification.value = message;
      
      // Clear notification after 3 seconds
      setTimeout(() => {
        notification.value = '';
      }, 3000);
    };
    
    // Initialize
    onMounted(() => {
      fetchSettings();
    });
    
    return {
      isLoading,
      isSaving,
      settings,
      categories,
      expenseCategories,
      incomeCategories,
      showResetModal,
      showExportModal,
      resetConfirmation,
      notification,
      exportUrl,
      stats,
      saveSettings,
      exportData,
      retrainAI,
      resetAllData,
      showNotification
    };
  }
});
</script>
