// Import Vue components
import { defineComponent, ref, computed, onMounted, watchEffect } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

// Use global Chart instance from CDN
const { 
  Chart, 
  BarController, 
  LineController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  DoughnutController,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  RadialLinearScale,
  TimeScale,
  TimeSeriesScale,
  Decimation,
  Filler,
  Legend,
  Title,
  Tooltip,
  SubTitle
} = window.Chart;

// Register Chart.js components
Chart.register(
  BarController, 
  LineController,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  DoughnutController,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  RadialLinearScale,
  TimeScale,
  TimeSeriesScale,
  Decimation,
  Filler,
  Legend,
  Title,
  Tooltip,
  SubTitle
);

// MonthlySpendingBarChart Component
const MonthlySpendingBarChart = defineComponent({
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
    const chartRef = ref(null);
    let chart = null;

    const renderChart = () => {
      if (chartRef.value && props.dataLoaded) {
        const ctx = chartRef.value.getContext('2d');
        
        // Prepare data
        const labels = props.categoryData.map(item => item.category);
        const data = props.categoryData.map(item => item.amount);
        const backgroundColor = generateColors(props.categoryData.length);
        
        // Destroy previous chart if it exists
        if (chart) {
          chart.destroy();
        }
        
        // Create new chart
        chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Spending Amount',
              data: data,
              backgroundColor: backgroundColor,
              borderColor: backgroundColor.map(color => color.replace('0.8', '1')),
              borderWidth: 1
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
                  label: (context) => {
                    const value = context.raw;
                    return `$${value.toLocaleString()}`;
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
          }
        });
      }
    };
    
    // Generate random colors for chart
    const generateColors = (count) => {
      const colors = [
        'rgba(52, 211, 153, 0.8)', // Green
        'rgba(59, 130, 246, 0.8)', // Blue
        'rgba(139, 92, 246, 0.8)', // Purple
        'rgba(249, 115, 22, 0.8)', // Orange
        'rgba(239, 68, 68, 0.8)',  // Red
        'rgba(16, 185, 129, 0.8)', // Emerald
        'rgba(14, 165, 233, 0.8)', // Sky Blue
        'rgba(168, 85, 247, 0.8)', // Violet
        'rgba(251, 146, 60, 0.8)', // Amber
        'rgba(236, 72, 153, 0.8)'  // Pink
      ];
      
      // If we need more colors than we have predefined, generate them
      if (count > colors.length) {
        for (let i = colors.length; i < count; i++) {
          const r = Math.floor(Math.random() * 255);
          const g = Math.floor(Math.random() * 255);
          const b = Math.floor(Math.random() * 255);
          colors.push(`rgba(${r}, ${g}, ${b}, 0.8)`);
        }
      }
      
      return colors.slice(0, count);
    };
    
    // Watch for data changes and render chart
    onMounted(() => {
      if (props.dataLoaded) {
        renderChart();
      }
    });
    
    // Update chart when data changes
    watchEffect(() => {
      if (props.dataLoaded && props.categoryData.length > 0) {
        renderChart();
      }
    });
    
    return {
      chartRef
    };
  },
  template: `
    <div class="chart-container">
      <div v-if="!dataLoaded" class="loading-placeholder">
        <div class="text-center p-6">
          <div class="animate-pulse">
            <div class="h-40 bg-base-300 rounded"></div>
          </div>
          <p class="mt-3 text-sm text-base-content/70">Loading chart data...</p>
        </div>
      </div>
      <canvas v-else ref="chartRef" height="300"></canvas>
    </div>
  `
});

// SpendingTrendLineChart Component
const SpendingTrendLineChart = defineComponent({
  props: {
    trendData: {
      type: Array,
      required: true,
      default: () => []
    },
    timeUnit: {
      type: String,
      default: 'month'
    },
    dataLoaded: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const chartRef = ref(null);
    let chart = null;

    const renderChart = () => {
      if (chartRef.value && props.dataLoaded) {
        const ctx = chartRef.value.getContext('2d');
        
        // Prepare data
        const sortedData = [...props.trendData].sort((a, b) => 
          new Date(a.date) - new Date(b.date)
        );
        
        const labels = sortedData.map(item => {
          const date = new Date(item.date);
          if (props.timeUnit === 'day') {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          } else if (props.timeUnit === 'week') {
            return `Week ${Math.ceil(date.getDate() / 7)} ${date.toLocaleDateString('en-US', { month: 'short' })}`;
          } else {
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          }
        });
        
        const data = sortedData.map(item => item.amount);
        
        // Destroy previous chart if it exists
        if (chart) {
          chart.destroy();
        }
        
        // Create new chart
        chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Spending Trend',
              data: data,
              borderColor: 'rgba(124, 58, 237, 1)',
              backgroundColor: 'rgba(124, 58, 237, 0.2)',
              borderWidth: 2,
              tension: 0.3,
              fill: true
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
                  label: (context) => {
                    const value = context.raw;
                    return `$${value.toLocaleString()}`;
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
          }
        });
      }
    };
    
    // Watch for data changes and render chart
    onMounted(() => {
      if (props.dataLoaded) {
        renderChart();
      }
    });
    
    // Update chart when data changes
    watchEffect(() => {
      if (props.dataLoaded && props.trendData.length > 0) {
        renderChart();
      }
    });
    
    return {
      chartRef
    };
  },
  template: `
    <div class="chart-container">
      <div v-if="!dataLoaded" class="loading-placeholder">
        <div class="text-center p-6">
          <div class="animate-pulse">
            <div class="h-40 bg-base-300 rounded"></div>
          </div>
          <p class="mt-3 text-sm text-base-content/70">Loading chart data...</p>
        </div>
      </div>
      <canvas v-else ref="chartRef" height="300"></canvas>
    </div>
  `
});

// CategoryDoughnutChart Component
const CategoryDoughnutChart = defineComponent({
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
    const chartRef = ref(null);
    let chart = null;

    const renderChart = () => {
      if (chartRef.value && props.dataLoaded) {
        const ctx = chartRef.value.getContext('2d');
        
        // Sort data by amount (descending)
        const sortedData = [...props.categoryData]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 6); // Top 6 categories
        
        // Prepare data
        const labels = sortedData.map(item => item.category);
        const data = sortedData.map(item => item.amount);
        const backgroundColor = generateColors(sortedData.length);
        
        // Destroy previous chart if it exists
        if (chart) {
          chart.destroy();
        }
        
        // Create new chart
        chart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              label: 'Spending by Category',
              data: data,
              backgroundColor: backgroundColor,
              borderColor: backgroundColor.map(color => color.replace('0.8', '1')),
              borderWidth: 1,
              hoverOffset: 15
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  boxWidth: 15,
                  padding: 15
                }
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const value = context.raw;
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const percentage = Math.round((value / total) * 100);
                    return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
                  }
                }
              }
            }
          }
        });
      }
    };
    
    // Generate random colors for chart
    const generateColors = (count) => {
      const colors = [
        'rgba(124, 58, 237, 0.8)', // Purple (primary)
        'rgba(52, 211, 153, 0.8)', // Green
        'rgba(59, 130, 246, 0.8)', // Blue
        'rgba(249, 115, 22, 0.8)', // Orange
        'rgba(239, 68, 68, 0.8)',  // Red
        'rgba(16, 185, 129, 0.8)'  // Emerald
      ];
      
      // If we need more colors than we have predefined, generate them
      if (count > colors.length) {
        for (let i = colors.length; i < count; i++) {
          const r = Math.floor(Math.random() * 255);
          const g = Math.floor(Math.random() * 255);
          const b = Math.floor(Math.random() * 255);
          colors.push(`rgba(${r}, ${g}, ${b}, 0.8)`);
        }
      }
      
      return colors.slice(0, count);
    };
    
    // Watch for data changes and render chart
    onMounted(() => {
      if (props.dataLoaded) {
        renderChart();
      }
    });
    
    // Update chart when data changes
    watchEffect(() => {
      if (props.dataLoaded && props.categoryData.length > 0) {
        renderChart();
      }
    });
    
    return {
      chartRef
    };
  },
  template: `
    <div class="chart-container">
      <div v-if="!dataLoaded" class="loading-placeholder">
        <div class="text-center p-6">
          <div class="animate-pulse">
            <div class="h-40 bg-base-300 rounded"></div>
          </div>
          <p class="mt-3 text-sm text-base-content/70">Loading chart data...</p>
        </div>
      </div>
      <canvas v-else ref="chartRef" height="300"></canvas>
    </div>
  `
});

// IncomeExpensesStackedChart Component
const IncomeExpensesStackedChart = defineComponent({
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
    const chartRef = ref(null);
    let chart = null;

    const renderChart = () => {
      if (chartRef.value && props.dataLoaded) {
        const ctx = chartRef.value.getContext('2d');
        
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
        
        // Destroy previous chart if it exists
        if (chart) {
          chart.destroy();
        }
        
        // Create new chart
        chart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Income',
                data: incomeData,
                backgroundColor: 'rgba(52, 211, 153, 0.8)', // Green
                borderColor: 'rgba(52, 211, 153, 1)',
                borderWidth: 1
              },
              {
                label: 'Expenses',
                data: expensesData,
                backgroundColor: 'rgba(229, 62, 62, 0.8)', // Red
                borderColor: 'rgba(229, 62, 62, 1)',
                borderWidth: 1
              }
            ]
          },
          options: {
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
          }
        });
      }
    };
    
    // Watch for data changes and render chart
    onMounted(() => {
      if (props.dataLoaded) {
        renderChart();
      }
    });
    
    // Update chart when data changes
    watchEffect(() => {
      if (props.dataLoaded && props.monthlyData.length > 0) {
        renderChart();
      }
    });
    
    return {
      chartRef
    };
  },
  template: `
    <div class="chart-container">
      <div v-if="!dataLoaded" class="loading-placeholder">
        <div class="text-center p-6">
          <div class="animate-pulse">
            <div class="h-40 bg-base-300 rounded"></div>
          </div>
          <p class="mt-3 text-sm text-base-content/70">Loading chart data...</p>
        </div>
      </div>
      <canvas v-else ref="chartRef" height="300"></canvas>
    </div>
  `
});

// Main ReportsView Component
export default defineComponent({
  name: 'ReportsView',
  components: {
    MonthlySpendingBarChart,
    SpendingTrendLineChart,
    CategoryDoughnutChart,
    IncomeExpensesStackedChart
  },
  setup() {
    // Sample data state
    const dataLoaded = ref(false);
    const selectedDateRange = ref('3months');
    const timeUnit = ref('week');
    
    // Helper function to format amounts consistently
    const formatAmount = (amount) => {
      return amount ? amount.toFixed(2) : '0.00';
    };
    
    // Date range options
    const dateRanges = [
      { label: 'This Month', value: 'month' },
      { label: '3 Months', value: '3months' },
      { label: '6 Months', value: '6months' },
      { label: 'Year', value: 'year' }
    ];
    
    // Sample data
    const categorySpendingData = ref([]);
    const spendingTrendData = ref([]);
    const monthlyFinanceData = ref([]);
    
    // Computed properties for summary section
    const averageMonthlySpending = computed(() => {
      if (!spendingTrendData.value.length) return '0';
      
      const total = spendingTrendData.value.reduce((sum, item) => sum + item.amount, 0);
      return Math.round(total / spendingTrendData.value.length).toLocaleString();
    });
    
    const spendingTrend = computed(() => {
      if (spendingTrendData.value.length < 2) return 'No change';
      
      // Calculate average for current and previous periods
      const half = Math.ceil(spendingTrendData.value.length / 2);
      const recentItems = spendingTrendData.value.slice(-half);
      const previousItems = spendingTrendData.value.slice(0, spendingTrendData.value.length - half);
      
      if (!previousItems.length) return 'No change';
      
      const recentAvg = recentItems.reduce((sum, item) => sum + item.amount, 0) / recentItems.length;
      const prevAvg = previousItems.reduce((sum, item) => sum + item.amount, 0) / previousItems.length;
      
      const change = ((recentAvg - prevAvg) / prevAvg) * 100;
      
      if (Math.abs(change) < 1) return 'No significant change';
      
      const sign = change > 0 ? '+' : '';
      return `${sign}${change.toFixed(1)}%`;
    });
    
    const largestCategory = computed(() => {
      if (!categorySpendingData.value.length) return { category: 'None', amount: 0 };
      
      return [...categorySpendingData.value].sort((a, b) => b.amount - a.amount)[0];
    });
    
    const largestCategoryPercentage = computed(() => {
      if (!categorySpendingData.value.length) return 0;
      
      const total = categorySpendingData.value.reduce((sum, item) => sum + item.amount, 0);
      return Math.round((largestCategory.value.amount / total) * 100);
    });
    
    const monthlySavings = computed(() => {
      if (!monthlyFinanceData.value.length) return '0';
      
      // Use the most recent month
      const latestMonth = [...monthlyFinanceData.value]
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      
      const savings = Math.max(0, latestMonth.income - latestMonth.expenses);
      return savings.toLocaleString();
    });
    
    const savingsPercentage = computed(() => {
      if (!monthlyFinanceData.value.length) return 0;
      
      // Use the most recent month
      const latestMonth = [...monthlyFinanceData.value]
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      
      if (latestMonth.income === 0) return 0;
      
      const savings = Math.max(0, latestMonth.income - latestMonth.expenses);
      return Math.round((savings / latestMonth.income) * 100);
    });
    
    // Load data (simulating API call)
    const loadData = () => {
      // Simulated API data - in a real app, this would come from server
      setTimeout(() => {
        // Category spending data
        categorySpendingData.value = [
          { category: 'Housing', amount: 1200 },
          { category: 'Food', amount: 550 },
          { category: 'Transportation', amount: 350 },
          { category: 'Entertainment', amount: 200 },
          { category: 'Utilities', amount: 180 },
          { category: 'Shopping', amount: 320 },
          { category: 'Healthcare', amount: 150 },
          { category: 'Personal Care', amount: 90 },
          { category: 'Education', amount: 220 }
        ];
        
        // Spending trend data
        const today = new Date();
        spendingTrendData.value = Array.from({ length: 12 }, (_, i) => {
          const date = new Date(today);
          date.setDate(1);
          date.setMonth(today.getMonth() - i);
          
          // Random amount between 2000-3500 with some variance
          const baseAmount = 2500;
          const variance = Math.random() * 1000 - 500; // Random between -500 and 500
          
          return {
            date: date.toISOString(),
            amount: Math.round(baseAmount + variance)
          };
        }).reverse();
        
        // Monthly finance data
        monthlyFinanceData.value = Array.from({ length: 6 }, (_, i) => {
          const date = new Date(today);
          date.setDate(1);
          date.setMonth(today.getMonth() - i);
          
          // Base income around 3500-4000
          const income = Math.round(3800 + (Math.random() * 400 - 200));
          
          // Expenses between 70-95% of income
          const expenseRatio = 0.7 + (Math.random() * 0.25);
          const expenses = Math.round(income * expenseRatio);
          
          return {
            date: date.toISOString(),
            income,
            expenses
          };
        }).reverse();
        
        dataLoaded.value = true;
      }, 1000);
    };
    
    // Update time unit based on selected date range
    const updateTimeUnit = () => {
      switch(selectedDateRange.value) {
        case 'month':
          timeUnit.value = 'day';
          break;
        case '3months':
        case '6months':
          timeUnit.value = 'week';
          break;
        case 'year':
          timeUnit.value = 'month';
          break;
        default:
          timeUnit.value = 'week';
      }
    };
    
    // Init function
    onMounted(() => {
      loadData();
      updateTimeUnit();
    });
    
    return {
      dataLoaded,
      selectedDateRange,
      dateRanges,
      timeUnit,
      categorySpendingData,
      spendingTrendData,
      monthlyFinanceData,
      averageMonthlySpending,
      spendingTrend,
      largestCategory,
      largestCategoryPercentage,
      monthlySavings,
      savingsPercentage,
      formatAmount
    };
  },
  template: `
    <div class="reports-container">
      <!-- Report Controls -->
      <div class="mb-6 flex flex-wrap gap-3 items-center justify-between">
        <h1 class="text-2xl font-bold">Reports & Analytics</h1>
        
        <!-- Date Range Selector -->
        <div class="flex items-center">
          <div class="join">
            <button 
              v-for="range in dateRanges" 
              :key="range.value" 
              class="btn btn-sm join-item" 
              :class="{'btn-primary': selectedDateRange === range.value, 'btn-outline': selectedDateRange !== range.value}"
              @click="selectedDateRange = range.value"
            >
              {{ range.label }}
            </button>
          </div>
        </div>
      </div>
      
      <!-- Chart Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Monthly Spending by Category Chart -->
        <div class="card bg-base-200 shadow-md">
          <div class="card-body">
            <h2 class="card-title text-lg mb-3">Monthly Spending by Category</h2>
            <MonthlySpendingBarChart :category-data="categorySpendingData" :data-loaded="dataLoaded" />
          </div>
        </div>
        
        <!-- Spending Trend Over Time Chart -->
        <div class="card bg-base-200 shadow-md">
          <div class="card-body">
            <h2 class="card-title text-lg mb-3">Spending Trend Over Time</h2>
            <SpendingTrendLineChart :trend-data="spendingTrendData" :time-unit="timeUnit" :data-loaded="dataLoaded" />
          </div>
        </div>
        
        <!-- Spending by Category Doughnut Chart -->
        <div class="card bg-base-200 shadow-md">
          <div class="card-body">
            <h2 class="card-title text-lg mb-3">Spending by Category (This Month)</h2>
            <CategoryDoughnutChart :category-data="categorySpendingData" :data-loaded="dataLoaded" />
          </div>
        </div>
        
        <!-- Income vs Expenses Stacked Chart -->
        <div class="card bg-base-200 shadow-md">
          <div class="card-body">
            <h2 class="card-title text-lg mb-3">Income vs Expenses by Month</h2>
            <IncomeExpensesStackedChart :monthly-data="monthlyFinanceData" :data-loaded="dataLoaded" />
          </div>
        </div>
      </div>
      
      <!-- Summary Section -->
      <div class="mt-8 card bg-primary text-primary-content">
        <div class="card-body">
          <h2 class="card-title">Financial Summary</h2>
          <div class="mt-2 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-base-100/20 p-4 rounded-lg">
              <h3 class="font-semibold text-lg">Average Monthly Spending</h3>
              <p class="text-2xl font-bold">${{ averageMonthlySpending }}</p>
              <p class="text-sm opacity-80">
                {{ spendingTrend }} compared to previous period
              </p>
            </div>
            
            <div class="bg-base-100/20 p-4 rounded-lg">
              <h3 class="font-semibold text-lg">Largest Expense</h3>
              <p class="text-2xl font-bold">{{ largestCategory.category }}</p>
              <p class="text-sm opacity-80">
                ${{ formatAmount(largestCategory.amount) }} ({{ largestCategoryPercentage }}% of total)
              </p>
            </div>
            
            <div class="bg-base-100/20 p-4 rounded-lg">
              <h3 class="font-semibold text-lg">Monthly Savings</h3>
              <p class="text-2xl font-bold">${{ monthlySavings }}</p>
              <p class="text-sm opacity-80">
                {{ savingsPercentage }}% of monthly income
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
});