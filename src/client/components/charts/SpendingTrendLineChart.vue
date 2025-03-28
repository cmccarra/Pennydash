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
    <Line v-else :data="chartData" :options="chartOptions" />
  </div>
</template>

<script>
import { defineComponent, computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
  Filler
} from 'chart.js';

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  CategoryScale,
  Filler
);

export default defineComponent({
  name: 'SpendingTrendLineChart',
  components: { Line },
  props: {
    trendData: {
      type: Array,
      required: true,
      default: () => []
    },
    timeUnit: {
      type: String,
      default: 'week',
      validator: (value) => ['day', 'week', 'month', 'year'].includes(value)
    },
    dataLoaded: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    // Check for significant changes to highlight points
    const getSpikeStatus = (values, index, threshold = 0.20) => {
      if (index === 0) return false;
      const current = values[index];
      const previous = values[index - 1];
      if (previous === 0) return false;
      
      const change = Math.abs((current - previous) / previous);
      return change > threshold;
    };
    
    // Computed chart data
    const chartData = computed(() => {
      if (!props.trendData.length) {
        return {
          labels: [],
          datasets: [{ data: [] }]
        };
      }

      // Sort data by date
      const sortedData = [...props.trendData]
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      
      const labels = sortedData.map(item => {
        const date = new Date(item.date);
        if (props.timeUnit === 'day') {
          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (props.timeUnit === 'week') {
          return `Week ${Math.ceil(date.getDate() / 7)} of ${date.toLocaleDateString('en-US', { month: 'short' })}`;
        } else if (props.timeUnit === 'month') {
          return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        } else {
          return date.getFullYear().toString();
        }
      });
      
      const values = sortedData.map(item => item.amount);
      
      // Identify spikes or dips
      const pointRadiuses = values.map((value, index) => 
        getSpikeStatus(values, index) ? 6 : 3
      );
      
      return {
        labels,
        datasets: [
          {
            label: 'Total Spend',
            data: values,
            borderColor: 'rgba(101, 116, 205, 1)',
            backgroundColor: 'rgba(101, 116, 205, 0.2)',
            tension: 0.3,
            fill: true,
            pointBackgroundColor: values.map((value, index) => 
              getSpikeStatus(values, index) 
                ? 'rgba(229, 62, 62, 1)' 
                : 'rgba(101, 116, 205, 1)'
            ),
            pointRadius: pointRadiuses,
            pointHoverRadius: pointRadiuses.map(r => r + 2)
          }
        ]
      };
    });

    // Chart options
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              return `$${value.toLocaleString()}`;
            },
            afterLabel: (context) => {
              const index = context.dataIndex;
              if (index > 0) {
                const currentValue = context.raw;
                const previousValue = context.dataset.data[index - 1];
                const change = ((currentValue - previousValue) / previousValue) * 100;
                
                if (!isNaN(change) && isFinite(change)) {
                  const sign = change >= 0 ? '+' : '';
                  return `${sign}${change.toFixed(1)}% from previous`;
                }
              }
              return null;
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