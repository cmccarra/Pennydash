<template>
  <div class="chart-container">
    <div v-if="!dataLoaded" class="loading-placeholder">
      <div class="text-center p-6">
        <div class="animate-pulse">
          <div class="h-40 bg-base-300 rounded"></div>
        </div>
        <p class="mt-3 text-sm text-base-content/70">Loading chart data...</p>
      </div>
    </div>
    <Bar v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
} from 'chart.js';

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale
);

export default defineComponent({
  name: 'IncomeExpensesStackedChart',
  components: { Bar },
  props: {
    monthlyData: {
      type: Array,
      required: true,
      default: () => []
    },
    dataLoaded: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    // Computed chart data
    const chartData = computed(() => {
      if (!props.monthlyData.length) {
        return {
          labels: [],
          datasets: []
        };
      }

      // Sort data by date
      const sortedData = [...props.monthlyData]
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const labels = sortedData.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      });
      
      // Extract income and expenses
      const incomeData = sortedData.map(item => item.income);
      const expensesData = sortedData.map(item => item.expenses);
      
      // Calculate savings data (positive difference between income and expenses)
      const savingsData = sortedData.map(item => 
        Math.max(0, item.income - item.expenses)
      );
      
      // Calculate deficit data (negative difference between income and expenses)
      const deficitData = sortedData.map(item => 
        Math.max(0, item.expenses - item.income)
      );
      
      return {
        labels,
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            backgroundColor: 'rgba(52, 211, 153, 0.8)', // Emerald/Green
            borderColor: 'rgba(52, 211, 153, 1)',
            borderWidth: 1
          },
          {
            label: 'Expenses',
            data: expensesData,
            backgroundColor: 'rgba(229, 62, 62, 0.8)', // Red
            borderColor: 'rgba(229, 62, 62, 1)',
            borderWidth: 1
          },
          {
            label: 'Savings',
            data: savingsData,
            backgroundColor: 'rgba(101, 116, 205, 0.4)', // Primary lighter
            borderColor: 'rgba(101, 116, 205, 0.8)',
            borderWidth: 1,
            // Hide in the chart but show in legend
            hidden: true
          },
          {
            label: 'Deficit',
            data: deficitData,
            backgroundColor: 'rgba(251, 146, 60, 0.4)', // Orange lighter
            borderColor: 'rgba(251, 146, 60, 0.8)',
            borderWidth: 1,
            // Hide in the chart but show in legend
            hidden: true
          }
        ]
      };
    });

    // Chart options
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const label = context.dataset.label;
              return `${label}: $${value.toLocaleString()}`;
            },
            afterBody: (tooltipItems) => {
              const index = tooltipItems[0].dataIndex;
              const monthData = props.monthlyData[index];
              
              if (!monthData) return null;
              
              const difference = monthData.income - monthData.expenses;
              const isSurplus = difference >= 0;
              const label = isSurplus ? 'Savings' : 'Deficit';
              const value = Math.abs(difference);
              
              return [`${label}: $${value.toLocaleString()}`];
            }
          }
        }
      },
      scales: {
        x: {
          stacked: false,
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => `$${value}`
          }
        }
      }
    };

    return {
      chartData,
      chartOptions
    };
  }
});
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 300px;
  width: 100%;
}

.loading-placeholder {
  height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>