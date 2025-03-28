<template>
  <nav class="bg-blue-600 shadow-md">
    <div class="container mx-auto px-4">
      <div class="flex justify-between items-center py-3">
        <!-- Logo and Brand -->
        <div class="flex items-center">
          <router-link to="/" class="flex items-center space-x-2">
            <img :src="logoUrl" alt="Budget App" class="w-8 h-8" />
            <span class="text-white font-bold text-xl">Budget App</span>
          </router-link>
        </div>

        <!-- Mobile Menu Button -->
        <div class="md:hidden">
          <button 
            @click="toggleMobileMenu" 
            class="text-white hover:text-blue-200 focus:outline-none"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-6 w-6" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                v-if="!isMobileMenuOpen" 
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                d="M4 6h16M4 12h16M4 18h16" 
              />
              <path 
                v-else 
                stroke-linecap="round" 
                stroke-linejoin="round" 
                stroke-width="2" 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>
        </div>

        <!-- Desktop Navigation Links -->
        <div class="hidden md:flex md:items-center md:space-x-4">
          <router-link 
            v-for="(item, index) in navItems" 
            :key="index" 
            :to="item.path" 
            class="text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
            :class="{ 'bg-blue-700': isActive(item.path) }"
          >
            {{ item.name }}
          </router-link>
        </div>
      </div>
    </div>

    <!-- Mobile Navigation Menu -->
    <div 
      v-show="isMobileMenuOpen" 
      class="md:hidden bg-blue-700"
    >
      <div class="px-2 pt-2 pb-3 space-y-1">
        <router-link 
          v-for="(item, index) in navItems" 
          :key="index" 
          :to="item.path" 
          class="text-white block px-3 py-2 rounded-md text-base font-medium hover:bg-blue-800 transition-colors"
          :class="{ 'bg-blue-800': isActive(item.path) }"
          @click="isMobileMenuOpen = false"
        >
          {{ item.name }}
        </router-link>
      </div>
    </div>
  </nav>
</template>

<script>
import { defineComponent, ref, computed } from 'vue';
import { useRoute } from 'vue-router';

export default defineComponent({
  name: 'Navbar',
  
  setup() {
    const route = useRoute();
    const isMobileMenuOpen = ref(false);
    
    const navItems = [
      { name: 'Dashboard', path: '/' },
      { name: 'Upload', path: '/upload' },
      { name: 'Transactions', path: '/transactions' },
      { name: 'Categories', path: '/categories' },
      { name: 'Settings', path: '/settings' }
    ];
    
    const logoUrl = computed(() => {
      // We're using the SVG from our assets folder
      return '/src/client/assets/logo.svg';
    });
    
    const toggleMobileMenu = () => {
      isMobileMenuOpen.value = !isMobileMenuOpen.value;
    };
    
    const isActive = (path) => {
      if (path === '/') {
        return route.path === '/';
      }
      return route.path.startsWith(path);
    };
    
    return {
      navItems,
      logoUrl,
      isMobileMenuOpen,
      toggleMobileMenu,
      isActive
    };
  }
});
</script>
