<template>
  <div class="transaction-list">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Transactions</h1>

    <!-- Filters and Controls -->
    <div class="card mb-6">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <!-- Search and Filters -->
        <div class="w-full md:w-2/3 flex flex-wrap gap-2">
          <div class="flex-grow">
            <input 
              v-model="filters.search" 
              type="text" 
              placeholder="Search transactions..." 
              class="input"
              @input="applyFilters"
            />
          </div>

          <div class="flex-shrink-0 w-32">
            <select v-model="filters.category" class="input" @change="applyFilters">
              <option value="">All Categories</option>
              <option value="uncategorized">Uncategorized</option>
              <option 
                v-for="category in categories" 
                :key="category.id" 
                :value="category.id"
              >
                {{ category.name }}
              </option>
            </select>
          </div>

          <div class="flex-shrink-0 w-32">
            <select v-model="filters.type" class="input" @change="applyFilters">
              <option value="">All Types</option>
              <option value="expense">Expenses</option>
              <option value="income">Income</option>
            </select>
          </div>
        </div>

        <!-- Batch Actions -->
        <div class="w-full md:w-1/3 flex justify-end gap-2">
          <button 
            v-show="selectedTransactions.length > 0" 
            @click="showBatchEditModal = true" 
            class="btn btn-primary flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
              <path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" />
            </svg>
            Categorize Selected ({{ selectedTransactions.length }})
          </button>

          <button 
            @click="createTransaction" 
            class="btn btn-success flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
            </svg>
            Add
          </button>
        </div>
      </div>
    </div>

    <!-- Transaction List -->
    <div class="card">
      <div v-if="isLoading" class="py-8 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        <p class="mt-2 text-gray-600">Loading transactions...</p>
      </div>

      <div v-else-if="error" class="p-4 bg-red-100 text-red-700 rounded mb-4">
        {{ error }}
        <button @click="fetchTransactions" class="ml-2 underline">Retry</button>
      </div>

      <div v-else-if="filteredTransactions.length === 0" class="py-8 text-center">
        <p class="text-gray-600">No transactions found.</p>
        <p v-if="hasFiltersApplied" class="mt-2 text-sm text-gray-500">
          Try adjusting your filters or <button @click="resetFilters" class="text-blue-600 underline">clear all filters</button>.
        </p>
        <p v-else class="mt-2 text-sm text-blue-600">
          <router-link to="/upload" class="underline">Upload some transactions</router-link> to get started.
        </p>
      </div>

      <div v-else>
        <!-- Transaction List Header -->
        <div class="flex items-center p-4 font-medium text-gray-700 bg-gray-50 border-b border-gray-200">
          <div class="w-8">
            <input 
              type="checkbox" 
              :checked="isAllSelected"
              @change="toggleSelectAll"
              class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>
          <div class="flex-grow">Description</div>
          <div class="w-32 text-right">Amount</div>
          <div class="w-32 text-right">Date</div>
          <div class="w-32">Category</div>
          <div class="w-24 text-right">Actions</div>
        </div>

        <!-- Transaction Items -->
        <div class="divide-y divide-gray-200">
          <div 
            v-for="transaction in paginatedTransactions" 
            :key="transaction.id"
            class="flex items-center p-4 hover:bg-gray-50"
          >
            <div class="w-8">
              <input 
                type="checkbox" 
                :checked="isSelected(transaction.id)"
                @change="toggleSelect(transaction.id)"
                class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
            <div class="flex-grow truncate" :title="transaction.description">
              {{ transaction.description }}
            </div>
            <div 
              class="w-32 text-right font-medium"
              :class="transaction.type === 'income' ? 'text-green-600' : 'text-red-600'"
            >
              {{ transaction.type === 'income' ? '+' : '-' }}{{ formatCurrency(transaction.amount) }}
            </div>
            <div class="w-32 text-right text-gray-600">
              {{ formatDate(transaction.date) }}
            </div>
            <div class="w-32">
              <span 
                v-if="transaction.categoryId"
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                :style="getCategoryStyle(transaction.categoryId)"
              >
                {{ getCategoryName(transaction.categoryId) }}
              </span>
              <span v-else class="text-gray-400">Uncategorized</span>
            </div>
            <div class="w-24 text-right">
              <button 
                @click="editTransaction(transaction)" 
                class="text-blue-600 hover:text-blue-800 mr-2"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button 
                @click="deleteTransaction(transaction.id)" 
                class="text-red-600 hover:text-red-800"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <!-- Add bottom padding to accommodate floating bar -->
        <div class="flex justify-between items-center p-4 border-t border-gray-200 mb-20">
          <div>
            <span class="text-sm text-gray-700">
              Showing {{ paginationStart }} to {{ paginationEnd }} of {{ totalTransactions }} transactions
            </span>
          </div>
          <div class="flex space-x-2">
            <button 
              @click="previousPage" 
              class="btn btn-secondary"
              :disabled="currentPage === 1"
            >
              Previous
            </button>
            <button 
              @click="nextPage" 
              class="btn btn-secondary"
              :disabled="currentPage === totalPages"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Transaction Modal -->
    <div 
      v-if="showTransactionModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-screen overflow-y-auto">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            {{ isEditing ? 'Edit Transaction' : 'Add Transaction' }}
          </h3>

          <form @submit.prevent="saveTransaction">
            <div class="mb-4">
              <label for="description" class="label">Description</label>
              <input 
                id="description"
                v-model="currentTransaction.description" 
                type="text" 
                class="input" 
                required
              />
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label for="amount" class="label">Amount</label>
                <input 
                  id="amount"
                  v-model="currentTransaction.amount" 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  class="input" 
                  required
                />
              </div>

              <div>
                <label for="date" class="label">Date</label>
                <input 
                  id="date"
                  v-model="currentTransaction.date" 
                  type="date" 
                  class="input" 
                  required
                />
              </div>
            </div>

            <div class="mb-4">
              <label for="type" class="label">Type</label>
              <select id="type" v-model="currentTransaction.type" class="input">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>

            <div class="mb-4">
              <CategorySelector 
                v-model="currentTransaction.categoryId"
                :categories="categories"
                label="Category"
                :show-create-new="true"
                @category-created="categoryCreated"
              />
            </div>

            <div class="mb-4">
              <label for="notes" class="label">Notes</label>
              <textarea 
                id="notes"
                v-model="currentTransaction.notes" 
                class="input" 
                rows="3"
              ></textarea>
            </div>

            <div class="flex justify-end space-x-3">
              <button 
                type="button" 
                @click="showTransactionModal = false" 
                class="btn btn-secondary"
              >
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">
                {{ isEditing ? 'Update' : 'Add' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Batch Edit Modal -->
    <div 
      v-if="showBatchEditModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            Categorize {{ selectedTransactions.length }} Transactions
          </h3>

          <form @submit.prevent="saveBatchEdit">
            <div class="mb-6">
              <CategorySelector 
                v-model="batchEditCategoryId"
                :categories="categories"
                label="Assign Category"
                :show-create-new="true"
                @category-created="categoryCreated"
              />
            </div>

            <div class="flex justify-end space-x-3">
              <button 
                type="button" 
                @click="cancelBatchEdit" 
                class="btn btn-secondary"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                class="btn btn-primary"
                :disabled="!batchEditCategoryId"
              >
                Apply to Selected
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div 
      v-if="showDeleteModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            Delete Transaction
          </h3>

          <p class="mb-6 text-gray-700">
            Are you sure you want to delete this transaction? This action cannot be undone.
          </p>

          <div class="flex justify-end space-x-3">
            <button 
              type="button" 
              @click="showDeleteModal = false" 
              class="btn btn-secondary"
            >
              Cancel
            </button>
            <button 
              type="button" 
              @click="confirmDelete" 
              class="btn btn-danger"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="selectedTransactions.length > 0" class="fixed bottom-0 left-0 right-0 bg-base-200 p-4 shadow-lg border-t border-base-300 flex items-center justify-between z-50">
            <div class="flex items-center space-x-4">
              <span class="font-medium">{{ selectedTransactions.length }} transactions selected</span>
              <button 
                @click="selectAllFiltered" 
                class="btn btn-secondary btn-sm"
                v-if="selectedTransactions.length < filteredTransactions.length"
              >
                Select All {{ filteredTransactions.length }} Transactions
              </button>
              <button 
                @click="clearSelection" 
                class="btn btn-secondary btn-sm"
                v-else
              >
                Clear Selection
              </button>
            </div>
          </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, provide, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { transactionsApi, categoriesApi } from '../services/api';
import { formatCurrency } from '../services/categoryService';
import CategorySelector from '../components/CategorySelector.vue';

export default defineComponent({
  name: 'TransactionList',

  components: {
    CategorySelector
  },

  setup() {
    const route = useRoute();
    const router = useRouter();

    // State
    const isLoading = ref(true);
    const error = ref('');
    const transactions = ref([]);
    const categories = ref([]);
    const filters = ref({
      search: '',
      category: route.query.filter || '',
      type: ''
    });
    const selectedTransactions = ref([]);
    const itemsPerPage = 20;
    const currentPage = ref(1);

    // Modal state
    const showTransactionModal = ref(false);
    const showBatchEditModal = ref(false);
    const showDeleteModal = ref(false);
    const currentTransaction = ref({});
    const transactionToDelete = ref(null);
    const batchEditCategoryId = ref('');
    const isEditing = ref(false);

    // Provide categories to child components
    provide('categories', categories);

    // Computed properties
    const filteredTransactions = computed(() => {
      let result = [...transactions.value];

      // Apply search filter
      if (filters.value.search) {
        const searchTerm = filters.value.search.toLowerCase();
        result = result.filter(t => 
          t.description?.toLowerCase().includes(searchTerm) ||
          t.notes?.toLowerCase().includes(searchTerm)
        );
      }

      // Apply category filter
      if (filters.value.category === 'uncategorized') {
        result = result.filter(t => !t.categoryId);
      } else if (filters.value.category) {
        result = result.filter(t => t.categoryId === filters.value.category);
      }

      // Apply type filter
      if (filters.value.type) {
        result = result.filter(t => t.type === filters.value.type);
      }

      return result;
    });

    const totalTransactions = computed(() => filteredTransactions.value.length);
    const totalPages = computed(() => Math.ceil(totalTransactions.value / itemsPerPage));

    const paginatedTransactions = computed(() => {
      const start = (currentPage.value - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      return filteredTransactions.value.slice(start, end);
    });

    const paginationStart = computed(() => {
      if (totalTransactions.value === 0) return 0;
      return (currentPage.value - 1) * itemsPerPage + 1;
    });

    const paginationEnd = computed(() => {
      if (totalTransactions.value === 0) return 0;
      return Math.min(currentPage.value * itemsPerPage, totalTransactions.value);
    });

    const isAllSelected = computed(() => {
      return paginatedTransactions.value.length > 0 && 
            paginatedTransactions.value.every(t => isSelected(t.id));
    });

    const hasFiltersApplied = computed(() => {
      return filters.value.search || filters.value.category || filters.value.type;
    });

    // Methods
    const fetchTransactions = async () => {
      isLoading.value = true;
      error.value = '';

      try {
        const [transactionsData, categoriesData] = await Promise.all([
          transactionsApi.getAll(),
          categoriesApi.getAll()
        ]);

        transactions.value = transactionsData;
        categories.value = categoriesData;
      } catch (err) {
        console.error('Error fetching transactions:', err);
        error.value = 'Failed to load transactions. Please try again.';
      } finally {
        isLoading.value = false;
      }
    };

    const formatDate = (dateString) => {
      if (!dateString) return '';

      const date = new Date(dateString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    const getCategoryName = (categoryId) => {
      if (!categoryId) return 'Uncategorized';

      const category = categories.value.find(c => c.id === categoryId);
      return category ? category.name : 'Uncategorized';
    };

    const getCategoryStyle = (categoryId) => {
      if (!categoryId) return { backgroundColor: '#f3f4f6', color: '#6b7280' };

      const category = categories.value.find(c => c.id === categoryId);
      if (!category) return { backgroundColor: '#f3f4f6', color: '#6b7280' };

      return { 
        backgroundColor: `${category.color}30`, 
        color: category.color 
      };
    };

    const applyFilters = () => {
      currentPage.value = 1;
      selectedTransactions.value = [];

      // Update URL query params
      router.replace({ 
        query: { 
          ...route.query,
          filter: filters.value.category || undefined
        } 
      });
    };

    const resetFilters = () => {
      filters.value = {
        search: '',
        category: '',
        type: ''
      };
      currentPage.value = 1;
      selectedTransactions.value = [];

      // Update URL query params
      router.replace({ query: {} });
    };

    const nextPage = () => {
      if (currentPage.value < totalPages.value) {
        currentPage.value++;
        selectedTransactions.value = [];
      }
    };

    const previousPage = () => {
      if (currentPage.value > 1) {
        currentPage.value--;
        selectedTransactions.value = [];
      }
    };

    const isSelected = (id) => {
      return selectedTransactions.value.includes(id);
    };

    const toggleSelect = (id) => {
      const index = selectedTransactions.value.indexOf(id);
      if (index === -1) {
        selectedTransactions.value.push(id);
      } else {
        selectedTransactions.value.splice(index, 1);
      }
    };

    const toggleSelectAll = () => {
      if (isAllSelected.value) {
        selectedTransactions.value = [];
      } else {
        paginatedTransactions.value.forEach(t => {
          if (!isSelected(t.id)) {
            selectedTransactions.value.push(t.id);
          }
        });
      }
    };

    const selectAllFiltered = () => {
      filteredTransactions.value.forEach(t => {
        if (!isSelected(t.id)) {
          selectedTransactions.value.push(t.id);
        }
      });
    };

    const clearSelection = () => {
      selectedTransactions.value = [];
    };


    const createTransaction = () => {
      currentTransaction.value = {
        description: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        type: 'expense',
        categoryId: '',
        notes: ''
      };
      isEditing.value = false;
      showTransactionModal.value = true;
    };

    const editTransaction = (transaction) => {
      currentTransaction.value = { ...transaction };
      isEditing.value = true;
      showTransactionModal.value = true;
    };

    const saveTransaction = async () => {
      try {
        if (isEditing.value) {
          await transactionsApi.update(currentTransaction.value.id, currentTransaction.value);
        } else {
          await transactionsApi.create(currentTransaction.value);
        }

        showTransactionModal.value = false;
        await fetchTransactions();
      } catch (err) {
        console.error('Error saving transaction:', err);
        alert('Error saving transaction. Please try again.');
      }
    };

    const deleteTransaction = (id) => {
      transactionToDelete.value = id;
      showDeleteModal.value = true;
    };

    const confirmDelete = async () => {
      try {
        await transactionsApi.delete(transactionToDelete.value);
        showDeleteModal.value = false;
        transactionToDelete.value = null;
        await fetchTransactions();
      } catch (err) {
        console.error('Error deleting transaction:', err);
        alert('Error deleting transaction. Please try again.');
      }
    };

    const saveBatchEdit = async () => {
      try {
        if (!batchEditCategoryId.value || selectedTransactions.value.length === 0) {
          return;
        }

        await transactionsApi.batchCategorize({
          transactionIds: selectedTransactions.value,
          categoryId: batchEditCategoryId.value
        });

        showBatchEditModal.value = false;
        batchEditCategoryId.value = '';
        selectedTransactions.value = [];
        await fetchTransactions();
      } catch (err) {
        console.error('Error updating categories:', err);
        alert('Error updating categories. Please try again.');
      }
    };

    const cancelBatchEdit = () => {
      showBatchEditModal.value = false;
      batchEditCategoryId.value = '';
    };

    const categoryCreated = (newCategory) => {
      categories.value.push(newCategory);
    };

    // Watch for route changes
    watch(() => route.query, (newQuery) => {
      if (newQuery.filter !== filters.value.category) {
        filters.value.category = newQuery.filter || '';
        currentPage.value = 1;
      }
    });

    // Initialize
    onMounted(() => {
      fetchTransactions();
    });

    return {
      isLoading,
      error,
      transactions,
      categories,
      filters,
      filteredTransactions,
      paginatedTransactions,
      selectedTransactions,
      currentPage,
      totalPages,
      totalTransactions,
      paginationStart,
      paginationEnd,
      showTransactionModal,
      showBatchEditModal,
      showDeleteModal,
      currentTransaction,
      batchEditCategoryId,
      isEditing,
      isAllSelected,
      hasFiltersApplied,
      fetchTransactions,
      formatDate,
      formatCurrency,
      getCategoryName,
      getCategoryStyle,
      applyFilters,
      resetFilters,
      nextPage,
      previousPage,
      isSelected,
      toggleSelect,
      toggleSelectAll,
      selectAllFiltered,
      clearSelection,
      createTransaction,
      editTransaction,
      saveTransaction,
      deleteTransaction,
      confirmDelete,
      saveBatchEdit,
      cancelBatchEdit,
      categoryCreated
    };
  }
});
</script>