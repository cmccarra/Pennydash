<template>
  <div class="chart-container">
    <div v-if="!dataLoaded" class="loading-placeholder">
      <div class="text-center p-6">
        <div class="animate-pulse">
          <div class="h-40 w-40 mx-auto bg-base-300 rounded-full"></div>
        </div>
        <p class="mt-3 text-sm text-base-content/70">Loading chart data...</p>
      </div>
    </div>
    <div v-else class="relative">
      <Doughnut :data="chartData" :options="chartOptions" />
      <div class="center-text">
        <div class="total-amount">${{ totalFormatted }}</div>
        <div class="total-label">Total Spent</div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale
} from 'chart.js';

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale
);

export default defineComponent({
  name: 'CategoryDoughnutChart',
  components: { Doughnut },
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

    // Calculate total amount
    const totalAmount = computed(() => {
      return props.categoryData.reduce((sum, item) => sum + item.amount, 0);
    });

    // Format total amount with commas
    const totalFormatted = computed(() => {
      return totalAmount.value.toLocaleString();
    });

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
      
      // Limit to top categories and group the rest as "Other"
      const maxCategories = 7;
      let formattedData = sortedData;
      
      if (sortedData.length > maxCategories) {
        const topCategories = sortedData.slice(0, maxCategories - 1);
        const otherCategories = sortedData.slice(maxCategories - 1);
        
        const otherAmount = otherCategories.reduce((sum, item) => sum + item.amount, 0);
        
        formattedData = [
          ...topCategories,
          { category: 'Other', amount: otherAmount }
        ];
      }

      return {
        labels: formattedData.map(item => item.category),
        datasets: [
          {
            data: formattedData.map(item => item.amount),
            backgroundColor: formattedData.map((_, index) => 
              chartColors[index % chartColors.length]
            ),
            borderColor: formattedData.map((_, index) => 
              chartColors[index % chartColors.length].replace('0.8', '1')
            ),
            borderWidth: 1,
            hoverOffset: 20
          }
        ]
      };
    });

    // Chart options
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 15
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const percentage = totalAmount.value 
                ? ((value / totalAmount.value) * 100).toFixed(1) 
                : 0;
              return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    };

    return {
      chartData,
      chartOptions,
      totalAmount,
      totalFormatted
    };
  }
});
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 350px;
  width: 100%;
}

.loading-placeholder {
  height: 350px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.center-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
}

.total-amount {
  font-size: 1.25rem;
  font-weight: bold;
  color: var(--color-text-primary, currentColor);
}

.total-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary, currentColor);
  opacity: 0.7;
}
</style>