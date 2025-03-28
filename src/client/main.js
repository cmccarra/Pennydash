import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/main.css';

const app = createApp(App);

// Global error handler
app.config.errorHandler = (err, vm, info) => {
  console.error('Global error:', err);
  console.error('Vue instance:', vm);
  console.error('Error info:', info);
};

// Mount the app
app.use(router).mount('#app');
