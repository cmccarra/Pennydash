<template>
  <div class="dashboard">
    <h1 class="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
    
    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div class="card">
        <h3 class="text-lg font-medium text-gray-700 mb-2">Total Balance</h3>
        <div class="text-3xl font-bold" :class="balanceClass">
          {{ formatCurrency(summaryData.balance) }}
        </div>
        <div class="mt-2 text-sm text-gray-500">
          {{ lastUpdated }}
        </div>
      </div>
      
      <div class="card">
        <h3 class="text-lg font-medium text-gray-700 mb-2">Total Income</h3>
        <div class="text-3xl font-bold text-green-600">
          {{ formatCurrency(summaryData.income) }}
        </div>
        <div class="mt-2 text-sm text-gray-500">
          All time total
        </div>
      </div>
      
      <div class="card">
        <h3 class="text-lg font-medium text-gray-700 mb-2">Total Expenses</h3>
        <div class="text-3xl font-bold text-red-600">
          {{ formatCurrency(summaryData.expenses) }}
        </div>
        <div class="mt-2 text-sm text-gray-500">
          All time total
        </div>
      </div>
    </div>
    
    <!-- Category Progress -->
    <div class="mb-6">
      <div class="card">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-medium text-gray-700">Categorization Progress</h3>
          <router-link 
            to="/transactions?filter=uncategorized" 
            class="text-sm text-blue-600 hover:underline"
          >
            View uncategorized
          </router-link>
        </div>
        
        <div v-if="isLoading" class="py-4 text-center text-gray-500">
          Loading...
        </div>
        <div v-else-if="categorizationStatus.total === 0" class="py-4 text-center text-gray-500">
          No transactions yet. <router-link to="/upload" class="text-blue-600 hover:underline">Upload some</router-link> to get started.
        </div>
        <div v-else>
          <div class="flex justify-between items-center mb-1">
            <span class="text-sm text-gray-600">{{ categorizationStatus.percentage }}% categorized</span>
            <span class="text-sm text-gray-600">{{ categorizationStatus.categorized }} / {{ categorizationStatus.total }}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              class="bg-blue-600 h-2.5 rounded-full"
              :style="{ width: `${categorizationStatus.percentage}%` }" 
            ></div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="card">
        <ExpensesByCategoryChart 
          :data="categoryData"
          :isLoading="isLoading" 
          :error="error"
        />
      </div>
      
      <div class="card">
        <MonthlyTrendChart 
          :data="monthlyData"
          :isLoading="isLoading" 
          :error="error"
        />
      </div>
    </div>
    
    <!-- Top Merchants -->
    <div class="card">
      <h3 class="text-lg font-medium text-gray-700 mb-4">Top Merchants</h3>
      
      <div v-if="isLoading" class="py-4 text-center text-gray-500">
        Loading...
      </div>
      <div v-else-if="!topMerchants.length" class="py-4 text-center text-gray-500">
        No merchants data available yet.
      </div>
      <div v-else class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th class="py-3">Merchant</th>
              <th class="py-3 text-right">Amount</th>
              <th class="py-3 text-right">Transactions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(merchant, index) in topMerchants" :key="index">
              <td class="py-3">{{ merchant.name }}</td>
              <td class="py-3 text-right font-medium">{{ formatCurrency(merchant.totalAmount) }}</td>
              <td class="py-3 text-right">{{ merchant.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref, computed, onMounted, provide } from 'vue';
import { reportsApi, categoriesApi } from '../services/api';
import { formatCurrency } from '../services/categoryService';
import ExpensesByCategoryChart from '../components/charts/ExpensesByCategoryChart.vue';
import MonthlyTrendChart from '../components/charts/MonthlyTrendChart.vue';

export default defineComponent({
  name: 'Dashboard',
  
  components: {
    ExpensesByCategoryChart,
    MonthlyTrendChart
  },
  
  setup() {
    const isLoading = ref(true);
    const error = ref('');
    const categories = ref([]);
    const categoryData = ref([]);
    const monthlyData = ref([]);
    const topMerchants = ref([]);
    const categorizationStatus = ref({
      total: 0,
      categorized: 0,
      uncategorized: 0,
      percentage: 0
    });
    const summaryData = ref({
      income: 0,
      expenses: 0,
      balance: 0
    });
    
    // Provide categories to child components
    provide('categories', categories);
    
    const balanceClass = computed(() => {
      if (summaryData.value.balance > 0) return 'text-green-600';
      if (summaryData.value.balance < 0) return 'text-red-600';
      return 'text-gray-800';
    });
    
    const lastUpdated = computed(() => {
      return `Last updated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    });
    
    const fetchDashboardData = async () => {
      isLoading.value = true;
      error.value = '';
      
      try {
        // Fetch all required data in parallel
        const [
          categoriesData,
          byCategoryData,
          monthlyTotalsData,
          incomeVsExpensesData,
          topMerchantsData,
          categorizationData
        ] = await Promise.all([
          categoriesApi.getAll(),
          reportsApi.getByCategory(),
          reportsApi.getMonthlyTotals(),
          reportsApi.getIncomeVsExpenses(),
          reportsApi.getTopMerchants(5),
          reportsApi.getCategorizationStatus()
        ]);
        
        // Update state with fetched data
        categories.value = categoriesData;
        categoryData.value = byCategoryData;
        monthlyData.value = monthlyTotalsData;
        summaryData.value = incomeVsExpensesData;
        topMerchants.value = topMerchantsData;
        categorizationStatus.value = categorizationData;
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        error.value = 'Failed to load dashboard data. Please try again.';
      } finally {
        isLoading.value = false;
      }
    };
    
    onMounted(() => {
      fetchDashboardData();
    });
    
    return {
      isLoading,
      error,
      categoryData,
      monthlyData,
      topMerchants,
      categorizationStatus,
      summaryData,
      balanceClass,
      lastUpdated,
      formatCurrency
    };
  }
});
</script>
