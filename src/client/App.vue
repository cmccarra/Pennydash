<template>
  <div class="min-h-screen bg-gray-50">
    <Navbar />
    <div class="container mx-auto px-4 py-6 pb-16 md:pb-6">
      <router-view />
    </div>
    
    <!-- Mobile Bottom Navigation -->
    <div class="btm-nav bg-base-200 border-t border-base-300 md:hidden">
      <button @click="activeTab = 'home'" :class="activeTab === 'home' ? 'active text-primary' : ''">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
        <span class="btm-nav-label">Home</span>
      </button>
      <button @click="activeTab = 'transactions'" :class="activeTab === 'transactions' ? 'active text-primary' : ''">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        <span class="btm-nav-label">Transactions</span>
      </button>
      <button @click="activeTab = 'reports'" :class="activeTab === 'reports' ? 'active text-primary' : ''">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
        </svg>
        <span class="btm-nav-label">Reports</span>
      </button>
      <div class="flex-1 relative">
        <button @click="moreMenuOpen = !moreMenuOpen" :class="{'active text-primary': moreMenuOpen || activeTab === 'more'}" class="w-full h-full flex flex-col items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          <span class="btm-nav-label">More</span>
        </button>
        <div v-if="moreMenuOpen" class="absolute bottom-full right-0 mb-2 w-48 dropdown-content">
          <ul class="menu p-2 shadow-lg bg-base-200 rounded-box">
            <li><a @click="activeTab = 'settings'; moreMenuOpen = false">Settings</a></li>
            <li><a @click="activeTab = 'categories'; moreMenuOpen = false">Categories</a></li>
            <li><a @click="activeTab = 'reviewQueue'; moreMenuOpen = false">Review Queue</a></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import Navbar from './components/Navbar.vue';

export default defineComponent({
  name: 'App',
  components: {
    Navbar
  },
  setup() {
    const router = useRouter();
    const activeTab = ref('home');
    const moreMenuOpen = ref(false);
    const loading = ref(false);
    const error = ref(null);

    // Watch for activeTab changes to navigate
    const handleTabChange = (tab) => {
      switch(tab) {
        case 'home':
          router.push('/');
          break;
        case 'transactions':
          router.push('/transactions');
          break;
        case 'reports':
          router.push('/reports');
          break;
        case 'settings':
          router.push('/settings');
          break;
        case 'categories':
          router.push('/categories');
          break;
        case 'reviewQueue':
          router.push('/review-queue');
          break;
      }
    };

    return {
      activeTab,
      moreMenuOpen,
      loading,
      error,
      handleTabChange
    };
  },
  watch: {
    activeTab(newTab) {
      this.handleTabChange(newTab);
    }
  }
});
</script>

<style>
/* Global styles can be placed here */
</style>