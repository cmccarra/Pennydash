<template>
  <div class="monthly-trend-chart">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-gray-800">{{ title }}</h3>
      <div v-if="isLoading" class="text-sm text-gray-500">Loading...</div>
    </div>
    
    <div v-if="error" class="p-4 bg-red-100 text-red-700 rounded mb-4">
      {{ error }}
    </div>
    
    <div v-if="!isLoading && !error">
      <div v-if="!hasData" class="p-4 text-center text-gray-500">
        No data available. Start by categorizing your transactions.
      </div>
      <div v-else>
        <canvas ref="chartCanvas" height="250"></canvas>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, watch } from 'vue';
import Chart from 'chart.js/auto';
import { formatCurrency } from '../../services/categoryService';

export default defineComponent({
  name: 'MonthlyTrendChart',
  
  props: {
    data: {
      type: Array,
      default: () => []
    },
    title: {
      type: String,
      default: 'Monthly Trends'
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
    
    const hasData = computed(() => {
      return props.data && props.data.length > 0;
    });
    
    const chartData = computed(() => {
      if (!hasData.value) {
        return {
          labels: [],
          expenses: [],
          income: []
        };
      }
      
      // Sort data by month
      const sortedData = [...props.data].sort((a, b) => a.month.localeCompare(b.month));
      
      return {
        labels: sortedData.map(item => formatMonthLabel(item.month)),
        expenses: sortedData.map(item => item.expenses),
        income: sortedData.map(item => item.income)
      };
    });
    
    const formatMonthLabel = (monthStr) => {
      const [year, month] = monthStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    };
    
    const createChart = () => {
      if (!chartCanvas.value || !hasData.value) return;
      
      const ctx = chartCanvas.value.getContext('2d');
      
      // Destroy existing chart if it exists
      if (chart) {
        chart.destroy();
      }
      
      // Create new chart
      chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: chartData.value.labels,
          datasets: [
            {
              label: 'Income',
              data: chartData.value.income,
              backgroundColor: 'rgba(75, 192, 192, 0.5)',
              borderColor: 'rgb(75, 192, 192)',
              borderWidth: 1
            },
            {
              label: 'Expenses',
              data: chartData.value.expenses,
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgb(255, 99, 132)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: {
                display: false
              }
            },
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  return formatCurrency(value).replace('.00', '');
                }
              }
            }
          },
          plugins: {
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.dataset.label || '';
                  const value = context.raw;
                  return `${label}: ${formatCurrency(value)}`;
                }
              }
            }
          }
        }
      });
    };
    
    // Create chart on mount
    onMounted(() => {
      if (hasData.value) {
        createChart();
      }
    });
    
    // Update chart when data changes
    watch(() => props.data, () => {
      if (hasData.value) {
        createChart();
      }
    }, { deep: true });
    
    return {
      chartCanvas,
      hasData
    };
  }
});
</script>
