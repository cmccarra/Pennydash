<template>
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
              ${{ largestCategory.amount }} ({{ largestCategoryPercentage }}% of total)
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
</template>

<script>
import { defineComponent, ref, computed, onMounted } from 'vue';
import MonthlySpendingBarChart from './charts/MonthlySpendingBarChart.vue';
import SpendingTrendLineChart from './charts/SpendingTrendLineChart.vue';
import CategoryDoughnutChart from './charts/CategoryDoughnutChart.vue';
import IncomeExpensesStackedChart from './charts/IncomeExpensesStackedChart.vue';

export default defineComponent({
  name: 'ReportsView',
  components: {
    MonthlySpendingBarChart,
    SpendingTrendLineChart,
    CategoryDoughnutChart,
    IncomeExpensesStackedChart
  },
  setup() {
    // Sample data - in real app this would come from API
    const dataLoaded = ref(false);
    const selectedDateRange = ref('3months');
    const timeUnit = ref('week');
    
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
    
    // Watch for date range changes
    // In real app, use watch to fetch new data based on selected range
    
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
      savingsPercentage
    };
  }
});
</script>

<style scoped>
.reports-container {
  max-width: 1400px;
  margin: 0 auto;
}
</style>