<template>
  <div class="transaction-upload">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Upload Transactions</h1>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <div class="card">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">Import Transactions</h2>
          
          <FileUploader @upload-complete="handleUploadComplete" />
        </div>
        
        <div v-if="recentlyUploadedTransactions.length > 0" class="card mt-6">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">Recent Uploads</h2>
          
          <div class="divide-y divide-gray-200">
            <TransactionItem 
              v-for="transaction in recentlyUploadedTransactions" 
              :key="transaction.id"
              :transaction="transaction"
            />
          </div>
          
          <div class="mt-4 flex justify-center">
            <router-link to="/transactions" class="btn btn-primary">
              View All Transactions
            </router-link>
          </div>
        </div>
      </div>
      
      <div class="lg:col-span-1">
        <div class="card">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">Upload Instructions</h2>
          
          <div class="space-y-4">
            <div>
              <h3 class="font-medium text-gray-700">Supported Formats</h3>
              <p class="text-gray-600 text-sm mt-1">
                You can upload transactions in CSV or XML format. Most banks allow you to export your transactions in these formats.
              </p>
            </div>
            
            <div>
              <h3 class="font-medium text-gray-700">CSV Format</h3>
              <p class="text-gray-600 text-sm mt-1">
                Your CSV file should include columns for date, description, and amount. The system will try to identify these columns automatically.
              </p>
            </div>
            
            <div>
              <h3 class="font-medium text-gray-700">XML Format</h3>
              <p class="text-gray-600 text-sm mt-1">
                The system supports common XML export formats from major banks. The importer will try to identify transaction records in the XML structure.
              </p>
            </div>
            
            <div>
              <h3 class="font-medium text-gray-700">After Upload</h3>
              <p class="text-gray-600 text-sm mt-1">
                Once uploaded, you can categorize your transactions on the Transactions page. The system will suggest categories based on transaction descriptions.
              </p>
            </div>
          </div>
        </div>
        
        <div class="card mt-6">
          <h2 class="text-xl font-semibold text-gray-800 mb-4">Quick Stats</h2>
          
          <div v-if="isLoading" class="py-4 text-center text-gray-500">
            Loading...
          </div>
          <div v-else>
            <div class="grid grid-cols-2 gap-4">
              <div class="text-center">
                <div class="text-3xl font-bold text-blue-600">{{ stats.total }}</div>
                <div class="text-sm text-gray-600 mt-1">Total Transactions</div>
              </div>
              <div class="text-center">
                <div class="text-3xl font-bold text-yellow-600">{{ stats.uncategorized }}</div>
                <div class="text-sm text-gray-600 mt-1">Needs Categorization</div>
              </div>
            </div>
            
            <div class="mt-4">
              <div class="flex justify-between items-center mb-1">
                <span class="text-sm text-gray-600">Categorization Progress</span>
                <span class="text-sm text-gray-600">{{ stats.percentage }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  class="bg-blue-600 h-2.5 rounded-full"
                  :style="{ width: `${stats.percentage}%` }" 
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, onMounted, provide } from 'vue';
import { reportsApi, categoriesApi } from '../services/api';
import FileUploader from '../components/FileUploader.vue';
import TransactionItem from '../components/TransactionItem.vue';

export default defineComponent({
  name: 'TransactionUpload',
  
  components: {
    FileUploader,
    TransactionItem
  },
  
  setup() {
    const isLoading = ref(true);
    const error = ref('');
    const categories = ref([]);
    const recentlyUploadedTransactions = ref([]);
    const stats = ref({
      total: 0,
      categorized: 0,
      uncategorized: 0,
      percentage: 0
    });
    
    // Provide categories to child components
    provide('categories', categories);
    
    const fetchData = async () => {
      isLoading.value = true;
      error.value = '';
      
      try {
        const [categoriesData, categorizationData] = await Promise.all([
          categoriesApi.getAll(),
          reportsApi.getCategorizationStatus()
        ]);
        
        categories.value = categoriesData;
        stats.value = categorizationData;
      } catch (err) {
        console.error('Error fetching data:', err);
        error.value = 'Failed to load data. Please try again.';
      } finally {
        isLoading.value = false;
      }
    };
    
    const handleUploadComplete = (result) => {
      if (result && result.transactions) {
        recentlyUploadedTransactions.value = result.transactions.slice(0, 5); // Show only first 5
        fetchData(); // Refresh stats
      }
    };
    
    onMounted(() => {
      fetchData();
    });
    
    return {
      isLoading,
      error,
      categories,
      recentlyUploadedTransactions,
      stats,
      handleUploadComplete
    };
  }
});
</script>
