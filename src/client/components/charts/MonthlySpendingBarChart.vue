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
import { defineComponent, computed, ref } from 'vue';
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
  name: 'MonthlySpendingBarChart',
  components: { Bar },
  props: {
    categoryData: {
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
    // Chart colors
    const chartColors = [
      'rgba(101, 116, 205, 0.8)',  // Primary
      'rgba(229, 62, 62, 0.8)',    // Red
      'rgba(79, 209, 197, 0.8)',   // Teal
      'rgba(251, 146, 60, 0.8)',   // Orange
      'rgba(168, 85, 247, 0.8)',   // Purple
      'rgba(14, 165, 233, 0.8)',   // Sky
      'rgba(52, 211, 153, 0.8)',   // Emerald
      'rgba(249, 115, 22, 0.8)'    // Amber
    ];

    // Computed chart data
    const chartData = computed(() => {
      if (!props.categoryData.length) {
        return {
          labels: [],
          datasets: [{ data: [] }]
        };
      }

      // Sort categories by amount (descending)
      const sortedData = [...props.categoryData]
        .sort((a, b) => b.amount - a.amount);

      return {
        labels: sortedData.map(item => item.category),
        datasets: [
          {
            label: 'Amount Spent ($)',
            data: sortedData.map(item => item.amount),
            backgroundColor: sortedData.map((_, index) => 
              chartColors[index % chartColors.length]
            ),
            borderColor: sortedData.map((_, index) => 
              chartColors[index % chartColors.length].replace('0.8', '1')
            ),
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      };
    });

    // Calculate total amount for percentage tooltips
    const totalAmount = computed(() => {
      return props.categoryData.reduce((sum, item) => sum + item.amount, 0);
    });

    // Chart options
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const percentage = totalAmount.value 
                ? ((value / totalAmount.value) * 100).toFixed(1) 
                : 0;
              return [`$${value.toLocaleString()}`, `${percentage}% of total`];
            }
          }
        }
      },
      scales: {
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