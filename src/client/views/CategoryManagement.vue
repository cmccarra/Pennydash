<template>
  <div class="category-management">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Categories</h1>
    
    <!-- Category Actions -->
    <div class="card mb-6">
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-lg font-semibold text-gray-800">Manage Your Categories</h2>
          <p class="text-sm text-gray-600">Create, edit and organize how your transactions are categorized</p>
        </div>
        <button @click="createCategory" class="btn btn-primary flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          Add Category
        </button>
      </div>
    </div>
    
    <!-- Category List -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Expense Categories Card -->
      <div class="card">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Expense Categories</h3>
        
        <div v-if="isLoading" class="py-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          <p class="mt-2 text-gray-600">Loading categories...</p>
        </div>
        
        <div v-else-if="error" class="p-4 bg-red-100 text-red-700 rounded mb-4">
          {{ error }}
          <button @click="fetchCategories" class="ml-2 underline">Retry</button>
        </div>
        
        <div v-else-if="expenseCategories.length === 0" class="py-8 text-center">
          <p class="text-gray-600">No expense categories found.</p>
          <button @click="createCategory" class="mt-2 text-blue-600 underline">Create your first category</button>
        </div>
        
        <div v-else class="space-y-2">
          <div 
            v-for="category in expenseCategories" 
            :key="category.id"
            class="p-3 border border-gray-200 rounded-md flex justify-between items-center hover:bg-gray-50"
          >
            <div class="flex items-center space-x-3">
              <div 
                class="w-4 h-4 rounded-full" 
                :style="{ backgroundColor: category.color }"
              ></div>
              <span class="font-medium">{{ category.name }}</span>
            </div>
            
            <div class="flex space-x-2">
              <button 
                @click="editCategory(category)" 
                class="text-blue-600 hover:text-blue-800"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button 
                @click="deleteCategory(category.id)" 
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
      </div>
      
      <!-- Income Categories Card -->
      <div class="card">
        <h3 class="text-lg font-semibold text-gray-800 mb-4">Income Categories</h3>
        
        <div v-if="isLoading" class="py-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          <p class="mt-2 text-gray-600">Loading categories...</p>
        </div>
        
        <div v-else-if="error" class="p-4 bg-red-100 text-red-700 rounded mb-4">
          {{ error }}
          <button @click="fetchCategories" class="ml-2 underline">Retry</button>
        </div>
        
        <div v-else-if="incomeCategories.length === 0" class="py-8 text-center">
          <p class="text-gray-600">No income categories found.</p>
          <button @click="createIncomeCategory" class="mt-2 text-blue-600 underline">Create your first income category</button>
        </div>
        
        <div v-else class="space-y-2">
          <div 
            v-for="category in incomeCategories" 
            :key="category.id"
            class="p-3 border border-gray-200 rounded-md flex justify-between items-center hover:bg-gray-50"
          >
            <div class="flex items-center space-x-3">
              <div 
                class="w-4 h-4 rounded-full" 
                :style="{ backgroundColor: category.color }"
              ></div>
              <span class="font-medium">{{ category.name }}</span>
            </div>
            
            <div class="flex space-x-2">
              <button 
                @click="editCategory(category)" 
                class="text-blue-600 hover:text-blue-800"
                title="Edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button 
                @click="deleteCategory(category.id)" 
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
      </div>
    </div>
    
    <!-- Category Usage Stats -->
    <div class="card mt-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Category Usage</h3>
      
      <div v-if="isLoading" class="py-8 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
        <p class="mt-2 text-gray-600">Loading category stats...</p>
      </div>
      
      <div v-else-if="error" class="p-4 bg-red-100 text-red-700 rounded mb-4">
        {{ error }}
      </div>
      
      <div v-else-if="!categoryStats.length" class="py-8 text-center">
        <p class="text-gray-600">No transaction data available yet.</p>
        <router-link to="/upload" class="mt-2 text-blue-600 underline">Upload some transactions</router-link>
      </div>
      
      <div v-else class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th class="py-3">Category</th>
              <th class="py-3">Type</th>
              <th class="py-3 text-right">Transactions</th>
              <th class="py-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="stat in categoryStats" :key="stat.categoryId">
              <td class="py-3">
                <div class="flex items-center space-x-2">
                  <div 
                    class="w-3 h-3 rounded-full" 
                    :style="{ backgroundColor: stat.categoryColor }"
                  ></div>
                  <span>{{ stat.categoryName }}</span>
                </div>
              </td>
              <td class="py-3 capitalize">{{ stat.categoryType }}</td>
              <td class="py-3 text-right">{{ stat.count }}</td>
              <td class="py-3 text-right font-medium" :class="stat.categoryType === 'income' ? 'text-green-600' : 'text-red-600'">
                {{ formatCurrency(stat.amount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Category Modal -->
    <div 
      v-if="showCategoryModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            {{ isEditing ? 'Edit Category' : 'Add Category' }}
          </h3>
          
          <form @submit.prevent="saveCategory">
            <div class="mb-4">
              <label for="name" class="label">Category Name</label>
              <input 
                id="name"
                v-model="currentCategory.name" 
                type="text" 
                class="input" 
                required
              />
            </div>
            
            <div class="mb-4">
              <label for="type" class="label">Type</label>
              <select 
                id="type"
                v-model="currentCategory.type" 
                class="input"
                :disabled="isEditing && categoryHasTransactions"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <p v-if="isEditing && categoryHasTransactions" class="text-sm text-yellow-600 mt-1">
                Cannot change type for categories with transactions.
              </p>
            </div>
            
            <div class="mb-4">
              <label for="color" class="label">Color</label>
              <div class="flex items-center space-x-3">
                <input 
                  id="color"
                  v-model="currentCategory.color" 
                  type="color" 
                  class="h-10 w-10 rounded border border-gray-300"
                />
                <input 
                  v-model="currentCategory.color" 
                  type="text" 
                  class="input"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  placeholder="#RRGGBB"
                />
              </div>
            </div>
            
            <div class="mb-4">
              <label for="description" class="label">Description (Optional)</label>
              <textarea 
                id="description"
                v-model="currentCategory.description" 
                class="input" 
                rows="2"
              ></textarea>
            </div>
            
            <div class="flex justify-end space-x-3">
              <button 
                type="button" 
                @click="showCategoryModal = false" 
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
    
    <!-- Delete Confirmation Modal -->
    <div 
      v-if="showDeleteModal" 
      class="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900 mb-4">
            Delete Category
          </h3>
          
          <p class="mb-6 text-gray-700">
            Are you sure you want to delete this category? This action cannot be undone.
          </p>
          
          <div v-if="deleteError" class="p-3 mb-4 bg-red-100 text-red-700 rounded">
            {{ deleteError }}
          </div>
          
          <div class="flex justify-end space-x-3">
            <button 
              type="button" 
              @click="cancelDelete" 
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
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
import { categoriesApi, reportsApi } from '../services/api';
import { formatCurrency } from '../services/categoryService';

export default defineComponent({
  name: 'CategoryManagement',
  
  setup() {
    // State
    const isLoading = ref(true);
    const error = ref('');
    const deleteError = ref('');
    const categories = ref([]);
    const categoryStats = ref([]);
    const showCategoryModal = ref(false);
    const showDeleteModal = ref(false);
    const currentCategory = ref({});
    const categoryToDelete = ref(null);
    const isEditing = ref(false);
    const categoryHasTransactions = ref(false);
    
    // Computed properties
    const expenseCategories = computed(() => {
      return categories.value.filter(c => c.type !== 'income');
    });
    
    const incomeCategories = computed(() => {
      return categories.value.filter(c => c.type === 'income');
    });
    
    // Methods
    const fetchCategories = async () => {
      isLoading.value = true;
      error.value = '';
      
      try {
        const [categoriesData, statsData] = await Promise.all([
          categoriesApi.getAll(),
          reportsApi.getByCategory()
        ]);
        
        categories.value = categoriesData;
        
        // Format category stats
        categoryStats.value = statsData.map(item => ({
          categoryId: item.categoryId,
          categoryName: item.categoryName,
          categoryColor: item.categoryColor,
          categoryType: categories.value.find(c => c.id === item.categoryId)?.type || 'expense',
          count: item.count,
          amount: item.amount
        }));
      } catch (err) {
        console.error('Error fetching categories:', err);
        error.value = 'Failed to load categories. Please try again.';
      } finally {
        isLoading.value = false;
      }
    };
    
    const createCategory = () => {
      currentCategory.value = {
        name: '',
        type: 'expense',
        color: generateRandomColor(),
        description: ''
      };
      isEditing.value = false;
      categoryHasTransactions.value = false;
      showCategoryModal.value = true;
    };
    
    const createIncomeCategory = () => {
      currentCategory.value = {
        name: '',
        type: 'income',
        color: generateRandomColor(),
        description: ''
      };
      isEditing.value = false;
      categoryHasTransactions.value = false;
      showCategoryModal.value = true;
    };
    
    const editCategory = async (category) => {
      currentCategory.value = { ...category };
      isEditing.value = true;
      
      try {
        // Check if category has transactions
        const transactions = await categoriesApi.getTransactions(category.id);
        categoryHasTransactions.value = transactions.length > 0;
      } catch (err) {
        console.error('Error checking category transactions:', err);
        categoryHasTransactions.value = false;
      }
      
      showCategoryModal.value = true;
    };
    
    const saveCategory = async () => {
      try {
        if (!currentCategory.value.name) return;
        
        if (isEditing.value) {
          await categoriesApi.update(currentCategory.value.id, currentCategory.value);
        } else {
          await categoriesApi.create(currentCategory.value);
        }
        
        showCategoryModal.value = false;
        await fetchCategories();
      } catch (err) {
        console.error('Error saving category:', err);
        alert('Error saving category. Please try again.');
      }
    };
    
    const deleteCategory = (id) => {
      categoryToDelete.value = id;
      deleteError.value = '';
      showDeleteModal.value = true;
    };
    
    const confirmDelete = async () => {
      try {
        deleteError.value = '';
        await categoriesApi.delete(categoryToDelete.value);
        showDeleteModal.value = false;
        categoryToDelete.value = null;
        await fetchCategories();
      } catch (err) {
        console.error('Error deleting category:', err);
        deleteError.value = err.message || 'Error deleting category. It may have associated transactions.';
      }
    };
    
    const cancelDelete = () => {
      showDeleteModal.value = false;
      categoryToDelete.value = null;
      deleteError.value = '';
    };
    
    const generateRandomColor = () => {
      const letters = '0123456789ABCDEF';
      let color = '#';
      for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
      }
      return color;
    };
    
    // Initialize
    onMounted(() => {
      fetchCategories();
    });
    
    return {
      isLoading,
      error,
      deleteError,
      categories,
      categoryStats,
      expenseCategories,
      incomeCategories,
      showCategoryModal,
      showDeleteModal,
      currentCategory,
      isEditing,
      categoryHasTransactions,
      fetchCategories,
      createCategory,
      createIncomeCategory,
      editCategory,
      saveCategory,
      deleteCategory,
      confirmDelete,
      cancelDelete,
      formatCurrency
    };
  }
});
</script>
