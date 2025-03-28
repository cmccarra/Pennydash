<template>
  <div class="category-selector">
    <label :for="id" class="label">{{ label }}</label>
    
    <div class="relative">
      <select
        :id="id"
        v-model="selectedValue"
        @change="updateValue"
        class="input pr-10"
        :disabled="disabled"
      >
        <option v-if="showEmptyOption" value="">{{ emptyOptionLabel }}</option>
        <optgroup v-if="showGroups && hasExpenses" label="Expenses">
          <option
            v-for="category in expenseCategories"
            :key="category.id"
            :value="category.id"
            :style="{ borderLeft: `4px solid ${category.color}` }"
          >
            {{ category.name }}
          </option>
        </optgroup>
        <optgroup v-if="showGroups && hasIncome" label="Income">
          <option
            v-for="category in incomeCategories"
            :key="category.id"
            :value="category.id"
            :style="{ borderLeft: `4px solid ${category.color}` }"
          >
            {{ category.name }}
          </option>
        </optgroup>
        <template v-if="!showGroups">
          <option
            v-for="category in categories"
            :key="category.id"
            :value="category.id"
            :style="{ borderLeft: `4px solid ${category.color}` }"
          >
            {{ category.name }}
          </option>
        </template>
      </select>
      
      <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
        <svg
          class="h-5 w-5 text-gray-400"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </div>
    </div>
    
    <div v-if="showCreateNew" class="mt-2">
      <button
        @click="showCreateForm = !showCreateForm"
        type="button"
        class="text-sm text-blue-600 hover:text-blue-800"
      >
        {{ showCreateForm ? 'Cancel' : '+ Create new category' }}
      </button>
      
      <div v-if="showCreateForm" class="mt-2 p-3 border border-gray-200 rounded-md">
        <div class="mb-3">
          <label class="label">Category Name</label>
          <input
            v-model="newCategory.name"
            type="text"
            class="input"
            placeholder="Enter category name"
          />
        </div>
        
        <div class="mb-3">
          <label class="label">Type</label>
          <select v-model="newCategory.type" class="input">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        
        <div class="mb-3">
          <label class="label">Color</label>
          <div class="flex items-center space-x-2">
            <input
              v-model="newCategory.color"
              type="color"
              class="w-8 h-8 rounded border border-gray-300"
            />
            <input
              v-model="newCategory.color"
              type="text"
              class="input"
              placeholder="#RRGGBB"
            />
          </div>
        </div>
        
        <div class="flex justify-end">
          <button
            @click="createCategory"
            type="button"
            class="btn btn-primary"
            :disabled="!newCategory.name"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, watch } from 'vue';
import { createCategory } from '../services/categoryService';

export default defineComponent({
  name: 'CategorySelector',
  
  props: {
    modelValue: {
      type: String,
      default: ''
    },
    categories: {
      type: Array,
      default: () => []
    },
    label: {
      type: String,
      default: 'Category'
    },
    showEmptyOption: {
      type: Boolean,
      default: true
    },
    emptyOptionLabel: {
      type: String,
      default: 'Select a category'
    },
    disabled: {
      type: Boolean,
      default: false
    },
    showCreateNew: {
      type: Boolean,
      default: false
    },
    showGroups: {
      type: Boolean,
      default: true
    },
    id: {
      type: String,
      default: () => `category-selector-${Math.random().toString(36).substring(2, 9)}`
    }
  },
  
  emits: ['update:modelValue', 'category-created'],
  
  setup(props, { emit }) {
    const selectedValue = ref(props.modelValue);
    const showCreateForm = ref(false);
    const newCategory = ref({
      name: '',
      type: 'expense',
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
    });
    
    // Watch for external changes
    watch(() => props.modelValue, (newValue) => {
      selectedValue.value = newValue;
    });
    
    const updateValue = () => {
      emit('update:modelValue', selectedValue.value);
    };
    
    const expenseCategories = computed(() => {
      return props.categories.filter(c => c.type !== 'income');
    });
    
    const incomeCategories = computed(() => {
      return props.categories.filter(c => c.type === 'income');
    });
    
    const hasExpenses = computed(() => expenseCategories.value.length > 0);
    const hasIncome = computed(() => incomeCategories.value.length > 0);
    
    const createCategory = async () => {
      try {
        if (!newCategory.value.name) return;
        
        const category = await createCategory(newCategory.value);
        
        // Update the selected value to the new category
        selectedValue.value = category.id;
        emit('update:modelValue', category.id);
        
        // Notify parent of new category
        emit('category-created', category);
        
        // Reset the form
        newCategory.value = {
          name: '',
          type: 'expense',
          color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        };
        showCreateForm.value = false;
      } catch (error) {
        console.error('Error creating category:', error);
      }
    };
    
    return {
      selectedValue,
      showCreateForm,
      newCategory,
      expenseCategories,
      incomeCategories,
      hasExpenses,
      hasIncome,
      updateValue,
      createCategory
    };
  }
});
</script>
