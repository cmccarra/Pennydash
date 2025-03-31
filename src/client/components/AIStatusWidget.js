/**
 * AIStatusWidget component
 * 
 * Displays the current status of AI services and provides configuration options
 */
import { defineComponent, ref, onMounted, reactive } from 'vue';
import { aiStatusApi } from '../services/api';

export default defineComponent({
  name: 'AIStatusWidget',
  
  props: {
    showConfigOptions: {
      type: Boolean,
      default: false
    },
    refreshInterval: {
      type: Number,
      default: 30000 // Default to refresh every 30 seconds
    }
  },
  
  setup(props, { emit }) {
    // State variables
    const status = ref({
      available: false,
      apiKeyConfigured: false,
      metrics: {},
      timestamp: null
    });
    const loading = ref(false);
    const error = ref(null);
    const refreshTimer = ref(null);
    
    // Configuration form
    const configForm = reactive({
      apiKey: '',
      validating: false,
      error: null,
      success: null
    });
    
    // Fetch AI service status from the server
    const fetchStatus = async () => {
      loading.value = true;
      error.value = null;
      
      try {
        const response = await aiStatusApi.getStatus();
        
        if (response && response.openai) {
          status.value = {
            available: response.openai.available,
            apiKeyConfigured: response.openai.envInfo.apiKeyConfigured,
            apiKeyMasked: response.openai.envInfo.apiKeyMasked,
            simulatingFailure: response.openai.simulatingFailure,
            rateLimited: response.openai.rateLimited,
            metrics: response.openai.metricsSnapshot || {},
            timestamp: response.timestamp || new Date().toISOString()
          };
          
          // Emit status update event
          emit('statusUpdated', status.value);
        } else {
          error.value = 'Invalid response format from server';
        }
      } catch (err) {
        error.value = err.message || 'Failed to fetch AI status';
        console.error('Error fetching AI status:', err);
      } finally {
        loading.value = false;
      }
    };
    
    // Format a timestamp in a human-readable format
    const formatTimestamp = (timestamp) => {
      if (!timestamp) return 'N/A';
      
      try {
        const date = new Date(timestamp);
        return date.toLocaleString();
      } catch (err) {
        return timestamp;
      }
    };
    
    // Format runtime in a human-readable format
    const formatRuntime = (ms) => {
      if (!ms) return 'N/A';
      
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      
      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    };
    
    // Reset metrics
    const resetMetrics = async () => {
      try {
        await aiStatusApi.resetMetrics();
        await fetchStatus();
      } catch (err) {
        error.value = 'Failed to reset metrics: ' + (err.message || err);
      }
    };
    
    // Clear cache
    const clearCache = async () => {
      try {
        await aiStatusApi.clearCache();
        await fetchStatus();
      } catch (err) {
        error.value = 'Failed to clear cache: ' + (err.message || err);
      }
    };
    
    // Check if the API key format is valid
    const validateApiKey = () => {
      if (!configForm.apiKey) {
        configForm.error = 'API key is required';
        return false;
      }
      
      if (!configForm.apiKey.startsWith('sk-')) {
        configForm.error = 'Invalid API key format. OpenAI API keys start with "sk-"';
        return false;
      }
      
      return true;
    };
    
    // Configure API key
    const configureApiKey = async () => {
      configForm.validating = true;
      configForm.error = null;
      configForm.success = null;
      
      try {
        // Validate API key format
        if (!validateApiKey()) {
          configForm.validating = false;
          return;
        }
        
        // Check if API key is valid
        const checkResponse = await aiStatusApi.checkApiKey(configForm.apiKey);
        
        if (!checkResponse.valid) {
          configForm.error = checkResponse.message || 'Invalid API key';
          return;
        }
        
        // Configure API key
        const configResponse = await aiStatusApi.configureApiKey(configForm.apiKey);
        
        if (configResponse.success) {
          configForm.success = 'API key configured successfully';
          configForm.apiKey = ''; // Clear the form
          
          // Refresh status
          await fetchStatus();
          
          // Emit event for parent components
          emit('apiKeyConfigured', { 
            configured: true, 
            requiresRestart: configResponse.requiresRestart 
          });
        } else {
          configForm.error = 'Failed to configure API key';
        }
      } catch (err) {
        configForm.error = err.message || 'An error occurred while configuring API key';
      } finally {
        configForm.validating = false;
      }
    };
    
    // Setup refresh timer
    const setupRefreshTimer = () => {
      if (refreshTimer.value) {
        clearInterval(refreshTimer.value);
      }
      
      if (props.refreshInterval > 0) {
        refreshTimer.value = setInterval(fetchStatus, props.refreshInterval);
      }
    };
    
    // Lifecycle hooks
    onMounted(() => {
      fetchStatus();
      setupRefreshTimer();
    });
    
    return {
      status,
      loading,
      error,
      configForm,
      fetchStatus,
      formatTimestamp,
      formatRuntime,
      resetMetrics,
      clearCache,
      configureApiKey
    };
  },
  
  template: `
    <div class="ai-status-widget bg-base-200 rounded-box p-4 shadow-md">
      <h3 class="text-lg font-bold mb-2">AI Service Status</h3>
      
      <div v-if="loading" class="flex items-center justify-center py-4">
        <span class="loading loading-spinner loading-md text-primary"></span>
        <span class="ml-2">Loading status...</span>
      </div>
      
      <div v-else-if="error" class="alert alert-error mb-4">
        <span>{{ error }}</span>
      </div>
      
      <div v-else class="space-y-3">
        <!-- Status overview -->
        <div class="flex items-center">
          <div class="mr-2">
            <div class="badge" :class="{
              'badge-success': status.available,
              'badge-error': !status.available
            }">
              {{ status.available ? 'AVAILABLE' : 'UNAVAILABLE' }}
            </div>
          </div>
          <span class="text-sm" v-if="status.timestamp">
            Last updated: {{ formatTimestamp(status.timestamp) }}
          </span>
          <button class="btn btn-xs btn-ghost ml-auto" @click="fetchStatus">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
        
        <!-- API Key status -->
        <div class="flex items-center">
          <div class="mr-2">
            <div class="badge" :class="{
              'badge-success': status.apiKeyConfigured,
              'badge-warning': !status.apiKeyConfigured
            }">
              API KEY: {{ status.apiKeyConfigured ? 'CONFIGURED' : 'MISSING' }}
            </div>
          </div>
          <span class="text-sm" v-if="status.apiKeyMasked">
            {{ status.apiKeyMasked }}
          </span>
        </div>
        
        <!-- Rate limit status -->
        <div v-if="status.rateLimited" class="flex items-center">
          <div class="badge badge-warning">
            RATE LIMITED
          </div>
          <span class="text-sm ml-2">
            Please wait before making more requests.
          </span>
        </div>
        
        <!-- Metrics -->
        <div class="mt-4">
          <h4 class="text-sm font-semibold">Metrics:</h4>
          <table class="table table-compact w-full mt-2">
            <tbody>
              <tr>
                <td class="font-semibold">API Calls</td>
                <td>{{ status.metrics.apiCalls || 0 }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Cache Hits</td>
                <td>{{ status.metrics.cacheHits || 0 }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Cache Hit Rate</td>
                <td>{{ status.metrics.cacheHitRate || 0 }}%</td>
              </tr>
              <tr>
                <td class="font-semibold">Cache Size</td>
                <td>{{ status.metrics.cacheSize || 0 }} items</td>
              </tr>
              <tr>
                <td class="font-semibold">Errors</td>
                <td>{{ status.metrics.errors || 0 }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Rate Limit Errors</td>
                <td>{{ status.metrics.rateLimitErrors || 0 }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Uptime</td>
                <td>{{ formatRuntime(status.metrics.runtimeMs) }}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="flex justify-between mt-2">
            <button class="btn btn-xs btn-outline btn-primary" @click="resetMetrics">
              Reset Metrics
            </button>
            <button class="btn btn-xs btn-outline btn-accent" @click="clearCache">
              Clear Cache
            </button>
          </div>
        </div>
        
        <!-- Configuration options -->
        <div v-if="showConfigOptions" class="mt-4 pt-4 border-t border-base-300">
          <h4 class="text-sm font-semibold mb-2">Configure API Key</h4>
          
          <div v-if="!status.apiKeyConfigured || status.simulatingFailure" class="space-y-2">
            <div>
              <input 
                type="text" 
                class="input input-bordered input-sm w-full" 
                placeholder="Enter OpenAI API Key (starts with sk-...)" 
                v-model="configForm.apiKey"
              />
            </div>
            
            <div class="flex justify-end">
              <button 
                class="btn btn-sm btn-primary" 
                @click="configureApiKey"
                :disabled="configForm.validating || !configForm.apiKey"
              >
                <span v-if="configForm.validating" class="loading loading-spinner loading-xs"></span>
                <span v-else>Configure</span>
              </button>
            </div>
            
            <div v-if="configForm.error" class="alert alert-error alert-sm py-2 text-sm">
              {{ configForm.error }}
            </div>
            
            <div v-if="configForm.success" class="alert alert-success alert-sm py-2 text-sm">
              {{ configForm.success }}
            </div>
          </div>
          
          <div v-else class="text-sm">
            <p>API key is already configured.</p>
          </div>
        </div>
      </div>
    </div>
  `
});