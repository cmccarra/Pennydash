<template>
  <div class="expenses-by-category-chart">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-gray-800">{{ title }}</h3>
      <div v-if="isLoading" class="text-sm text-gray-500">Loading...</div>
    </div>
    
    <div v-if="error" class="p-4 bg-red-100 text-red-700 rounded mb-4">
      {{ error }}
    </div>
    
    <div v-if="!isLoading && !error">
      <div v-if="chartData.labels.length === 0" class="p-4 text-center text-gray-500">
        No data available. Start by categorizing your transactions.
      </div>
      <div v-else>
        <canvas ref="chartCanvas" height="200"></canvas>
      </div>
      
      <div class="mt-4 space-y-2">
        <div 
          v-for="(category, index) in legendItems" 
          :key="category.id"
          class="flex items-center justify-between p-2 rounded hover:bg-gray-50"
        >
          <div class="flex items-center">
            <div 
              class="w-4 h-4 rounded-full mr-2" 
              :style="{ backgroundColor: chartData.backgroundColor[index] }"
            ></div>
            <span class="text-sm font-medium">{{ category.name }}</span>
          </div>
          <div class="text-sm font-medium">
            {{ formatAmount(category.amount) }}
            <span class="text-xs text-gray-500 ml-1">
              ({{ category.percentage }}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, watch } from 'vue';
import Chart from 'chart.js/auto';
import { formatCurrency } from '../../services/categoryService';

export default defineComponent({
  name: 'ExpensesByCategoryChart',
  
  props: {
    data: {
      type: Array,
      default: () => []
    },
    title: {
      type: String,
      default: 'Expenses by Category'
    },
    isLoading: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: ''
    }
  },
  
  setup(props) {
    const chartCanvas = ref(null);
    let chart = null;
    
    const chartData = computed(() => {
      if (!props.data || props.data.length === 0) {
        return {
          labels: [],
          data: [],
          backgroundColor: []
        };
      }
      
      // Filter out categories with 0 amount
      const filteredData = props.data.filter(item => item.amount > 0);
      
      return {
        labels: filteredData.map(item => item.categoryName),
        data: filteredData.map(item => item.amount),
        backgroundColor: filteredData.map(item => item.categoryColor)
      };
    });
    
    const totalAmount = computed(() => {
      return chartData.value.data.reduce((sum, amount) => sum + amount, 0);
    });
    
    const legendItems = computed(() => {
      if (totalAmount.value === 0) return [];
      
      return props.data
        .filter(item => item.amount > 0)
        .map(item => ({
          id: item.categoryId,
          name: item.categoryName,
          amount: item.amount,
          percentage: ((item.amount / totalAmount.value) * 100).toFixed(1)
        }))
        .sort((a, b) => b.amount - a.amount);
    });
    
    const formatAmount = (amount) => {
      return formatCurrency(amount);
    };
    
    const createChart = () => {
      if (!chartCanvas.value) return;
      
      const ctx = chartCanvas.value.getContext('2d');
      
      // Destroy existing chart if it exists
      if (chart) {
        chart.destroy();
      }
      
      // Create new chart
      chart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: chartData.value.labels,
          datasets: [{
            data: chartData.value.data,
            backgroundColor: chartData.value.backgroundColor,
            borderWidth: 1,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const value = context.raw;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                }
              }
            }
          },
          cutout: '70%',
          animation: {
            animateScale: true,
            animateRotate: true
          }
        }
      });
    };
    
    // Create chart on mount
    onMounted(() => {
      if (chartData.value.labels.length > 0) {
        createChart();
      }
    });
    
    // Update chart when data changes
    watch(() => props.data, () => {
      if (chartData.value.labels.length > 0) {
        createChart();
      }
    }, { deep: true });
    
    return {
      chartCanvas,
      chartData,
      legendItems,
      formatAmount
    };
  }
});
</script>
