import { createRouter, createWebHistory } from 'vue-router';

// Import views
import Dashboard from '../views/Dashboard.vue';
import TransactionUpload from '../views/TransactionUpload.vue';
import TransactionList from '../views/TransactionList.vue';
import CategoryManagement from '../views/CategoryManagement.vue';
import Settings from '../views/Settings.vue';

// Define routes
const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard,
    meta: { title: 'Dashboard' }
  },
  {
    path: '/upload',
    name: 'Upload',
    component: TransactionUpload,
    meta: { title: 'Upload Transactions' }
  },
  {
    path: '/transactions',
    name: 'Transactions',
    component: TransactionList,
    meta: { title: 'Transactions' }
  },
  {
    path: '/categories',
    name: 'Categories',
    component: CategoryManagement,
    meta: { title: 'Categories' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { title: 'Settings' }
  }
];

// Create router
const router = createRouter({
  history: createWebHistory(),
  routes
});

// Update document title based on route
router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `Budget App | ${to.meta.title}` : 'Budget App';
  next();
});

export default router;
