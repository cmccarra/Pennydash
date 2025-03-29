<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold mb-6">Transaction Review Queue</h1>
    
    <div class="card bg-base-200 shadow-md transition-all">
      <div class="p-6">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">Transactions Needing Review</h2>
          <div class="stats bg-base-300 shadow">
            <div class="stat">
              <div class="stat-title">Remaining</div>
              <div class="stat-value text-primary text-xl">{{ reviewQueue.totalItems || 0 }}</div>
            </div>
          </div>
        </div>
        
        <div v-if="loading" class="flex justify-center my-12">
          <span class="loading loading-spinner loading-lg text-primary"></span>
        </div>
        
        <div v-else-if="reviewQueue.items && reviewQueue.items.length === 0" class="my-12 text-center">
          <div class="bg-base-300 p-4 rounded-lg inline-block mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-12 h-12 mx-auto text-base-content/60">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-lg mt-4">No transactions need review!</p>
          <p class="text-base-content/70 mt-2">All your transactions have been properly categorized.</p>
        </div>
        
        <div v-else class="space-y-4">
          <!-- Transaction Table -->
          <div class="overflow-x-auto">
            <table class="table w-full table-zebra">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Conf.</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="tx in reviewQueue.items" :key="tx.id">
                  <td>{{ formatDate(tx.date) }}</td>
                  <td class="max-w-xs truncate">{{ tx.description }}</td>
                  <td :class="tx.type === 'income' ? 'text-success' : 'text-error'">
                    {{ formatCurrency(tx.amount) }}
                  </td>
                  <td>
                    <select class="select select-bordered select-sm w-full" v-model="tx.categoryId">
                      <option v-if="tx.type === 'income'" v-for="cat in incomeCategories" :key="cat.id" :value="cat.id">
                        {{ cat.name }}
                      </option>
                      <option v-if="tx.type === 'expense'" v-for="cat in expenseCategories" :key="cat.id" :value="cat.id">
                        {{ cat.name }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <div class="radial-progress text-xs" :class="getConfidenceColor(tx.categoryConfidence || tx.confidence || 0)" :style="{ '--value': (tx.categoryConfidence || tx.confidence || 0) * 100 }">
                      {{ Math.round((tx.categoryConfidence || tx.confidence || 0) * 100) }}%
                    </div>
                  </td>
                  <td>
                    <div class="flex space-x-1">
                      <button @click="saveReviewedTransaction(tx)" class="btn btn-sm btn-success btn-square">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </button>
                      <button @click="removeFromReviewQueue(tx.id)" class="btn btn-sm btn-error btn-square">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <!-- Pagination -->
          <div class="flex justify-between items-center">
            <div>
              <span class="text-sm">Showing {{ (reviewQueue.page - 1) * reviewQueue.pageSize + 1 }} to 
                {{ Math.min(reviewQueue.page * reviewQueue.pageSize, reviewQueue.totalItems) }} 
                of {{ reviewQueue.totalItems }} transactions
              </span>
            </div>
            <div class="join">
              <button 
                @click="changePage(-1)" 
                class="join-item btn btn-sm" 
                :disabled="reviewQueue.page <= 1"
              >
                Previous
              </button>
              <button class="join-item btn btn-sm" disabled>{{ reviewQueue.page }}</button>
              <button 
                @click="changePage(1)" 
                class="join-item btn btn-sm" 
                :disabled="reviewQueue.page * reviewQueue.pageSize >= reviewQueue.totalItems"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue';
import { transactionsApi, categoriesApi } from '../services/api';
import { getExpenseCategories, getIncomeCategories, formatCurrency } from '../services/categoryService';

export default {
  name: 'ReviewQueue',
  setup() {
    const loading = ref(true);
    const error = ref(null);
    const categories = ref([]);
    const reviewQueue = reactive({
      items: [],
      page: 1,
      pageSize: 50,
      totalItems: 0
    });

    const fetchCategories = async () => {
      try {
        console.log('Fetching categories...');
        const response = await categoriesApi.getAll();
        console.log('Categories response:', response);
        categories.value = response;
      } catch (err) {
        console.error('Failed to fetch categories:', err);
        error.value = 'Failed to load categories. Please try again later.';
      }
    };

    const fetchReviewQueue = async () => {
      loading.value = true;
      error.value = null;
      
      try {
        console.log('Fetching review queue with params:', { 
          page: reviewQueue.page, 
          pageSize: reviewQueue.pageSize 
        });
        
        // Add a timeout to the API call to prevent hanging UI
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        const fetchPromise = transactionsApi.getReviewQueue({ 
          page: reviewQueue.page, 
          pageSize: reviewQueue.pageSize 
        });
        
        // Race the fetch against a timeout
        const response = await Promise.race([
          fetchPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Review queue request timed out')), 15000))
        ]);
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        console.log('Review queue response:', response);
        
        if (response && response.success) {
          reviewQueue.items = response.transactions || [];
          reviewQueue.totalItems = response.pagination?.total || 0;
          
          // Add client-side pagination data
          reviewQueue.page = response.pagination?.page || 1;
          reviewQueue.pageSize = response.pagination?.pageSize || 50;
          reviewQueue.totalPages = response.pagination?.totalPages || 1;
          
          console.log(`Loaded ${reviewQueue.items.length} transactions that need review (${reviewQueue.totalItems} total)`);
        } else {
          console.warn('Review queue response was not successful:', response);
          error.value = 'Failed to load review queue data. Response format may be incorrect.';
        }
      } catch (err) {
        console.error('Failed to fetch review queue:', err);
        
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          error.value = 'Request timed out. The server might be busy processing a large number of transactions.';
        } else {
          error.value = `Failed to load transactions for review: ${err.message}`;
        }
      } finally {
        loading.value = false;
      }
    };

    const saveReviewedTransaction = async (transaction) => {
      loading.value = true;
      try {
        console.log(`Saving transaction ${transaction.id} with category ${transaction.categoryId}`);
        
        await transactionsApi.updateTransaction(transaction.id, {
          categoryId: transaction.categoryId,
          reviewed: true
        });
        
        console.log(`Successfully updated transaction ${transaction.id}`);
        
        // Remove from the local list
        reviewQueue.items = reviewQueue.items.filter(item => item.id !== transaction.id);
        reviewQueue.totalItems--;
        
        // If we've removed all items on the current page and there are more pages, go back one page
        if (reviewQueue.items.length === 0 && reviewQueue.page > 1) {
          reviewQueue.page--;
          await fetchReviewQueue();
        }
      } catch (err) {
        console.error('Failed to update transaction:', err);
        
        // More user-friendly error message based on the error type
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          alert('The request timed out. The server might be busy, but your changes may have been saved.');
        } else if (err.message.includes('404')) {
          alert('Transaction not found. It might have been deleted or already processed.');
        } else {
          alert(`Failed to save changes: ${err.message}. Please try again.`);
        }
      } finally {
        loading.value = false;
      }
    };

    const removeFromReviewQueue = async (transactionId) => {
      loading.value = true;
      try {
        console.log(`Marking transaction ${transactionId} as reviewed without changing category`);
        
        await transactionsApi.markAsReviewed(transactionId);
        
        console.log(`Successfully marked transaction ${transactionId} as reviewed`);
        
        // Remove from the local list
        reviewQueue.items = reviewQueue.items.filter(item => item.id !== transactionId);
        reviewQueue.totalItems--;
        
        // If we've removed all items on the current page and there are more pages, go back one page
        if (reviewQueue.items.length === 0 && reviewQueue.page > 1) {
          reviewQueue.page--;
          await fetchReviewQueue();
        }
      } catch (err) {
        console.error('Failed to remove transaction from review queue:', err);
        
        // More user-friendly error message based on the error type
        if (err.name === 'AbortError' || err.message.includes('timeout')) {
          alert('The request timed out. The server might be busy, but your changes may have been saved.');
        } else if (err.message.includes('404')) {
          alert('Transaction not found. It might have been deleted or already processed.');
        } else {
          alert(`Failed to remove from review queue: ${err.message}. Please try again.`);
        }
      } finally {
        loading.value = false;
      }
    };

    const changePage = async (direction) => {
      reviewQueue.page += direction;
      await fetchReviewQueue();
    };

    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    };

    const getConfidenceColor = (confidence) => {
      if (confidence < 0.5) return 'text-error';
      if (confidence < 0.7) return 'text-warning';
      return 'text-success';
    };

    const incomeCategories = computed(() => {
      return getIncomeCategories(categories.value);
    });

    const expenseCategories = computed(() => {
      return getExpenseCategories(categories.value);
    });

    onMounted(async () => {
      await Promise.all([fetchCategories(), fetchReviewQueue()]);
    });

    return {
      loading,
      error,
      reviewQueue,
      incomeCategories,
      expenseCategories,
      saveReviewedTransaction,
      removeFromReviewQueue,
      changePage,
      formatDate,
      formatCurrency,
      getConfidenceColor
    };
  }
};
</script>

<style scoped>
.radial-progress {
  --size: 2rem;
  font-size: 0.6rem;
}
</style>