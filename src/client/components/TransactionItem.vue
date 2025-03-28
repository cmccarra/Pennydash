<template>
  <div 
    class="transaction-item p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors"
    :class="{ 'bg-blue-50': selected }"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <input 
          v-if="selectable"
          type="checkbox"
          :checked="selected"
          @change="$emit('select', transaction.id)"
          class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <div 
          class="flex-shrink-0 w-2 h-10 rounded-full" 
          :style="{ backgroundColor: categoryColor }"
        ></div>
        <div>
          <div class="font-medium text-gray-900">{{ transaction.description }}</div>
          <div class="text-sm text-gray-500">{{ formattedDate }}</div>
        </div>
      </div>
      
      <div class="flex flex-col items-end">
        <div 
          class="text-base font-medium"
          :class="transaction.type === 'income' ? 'text-green-600' : 'text-red-600'"
        >
          {{ transaction.type === 'income' ? '+' : '-' }}{{ formattedAmount }}
        </div>
        <div class="text-sm">
          <span 
            class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
            :style="{ backgroundColor: categoryColor + '30', color: categoryColor }"
          >
            {{ categoryName }}
          </span>
        </div>
      </div>
    </div>
    
    <div v-if="showControls" class="mt-3 flex justify-end space-x-2">
      <button 
        @click="$emit('edit', transaction)" 
        class="text-sm text-blue-600 hover:text-blue-800"
      >
        Edit
      </button>
      <button 
        @click="$emit('delete', transaction.id)" 
        class="text-sm text-red-600 hover:text-red-800"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed, inject } from 'vue';
import { getCategoryColor, getCategoryName, formatCurrency } from '../services/categoryService';

export default defineComponent({
  name: 'TransactionItem',
  
  props: {
    transaction: {
      type: Object,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    },
    selectable: {
      type: Boolean,
      default: false
    },
    showControls: {
      type: Boolean,
      default: false
    }
  },
  
  emits: ['select', 'edit', 'delete'],
  
  setup(props) {
    // Inject categories from parent component
    const categories = inject('categories', []);
    
    const categoryColor = computed(() => {
      return getCategoryColor(categories.value, props.transaction.categoryId);
    });
    
    const categoryName = computed(() => {
      return getCategoryName(categories.value, props.transaction.categoryId);
    });
    
    const formattedAmount = computed(() => {
      return formatCurrency(props.transaction.amount);
    });
    
    const formattedDate = computed(() => {
      if (!props.transaction.date) return '';
      
      const date = new Date(props.transaction.date);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    });
    
    return {
      categoryColor,
      categoryName,
      formattedAmount,
      formattedDate
    };
  }
});
</script>
