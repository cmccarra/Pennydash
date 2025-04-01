<template>
  <div class="file-uploader">
    <div 
      class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors"
      :class="{ 'bg-blue-50 border-blue-500': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleFileDrop"
    >
      <div v-if="isUploading">
        <div class="mb-3">
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div class="bg-blue-600 h-2.5 rounded-full" :style="{ width: `${uploadProgress}%` }"></div>
          </div>
          <p class="mt-2 text-sm text-gray-600">Uploading... {{ uploadProgress }}%</p>
        </div>
      </div>
      <div v-else>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class="mx-auto h-12 w-12 text-gray-400"
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            stroke-linecap="round" 
            stroke-linejoin="round" 
            stroke-width="2" 
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
          />
        </svg>
        <p class="mt-2 text-sm text-gray-600">
          <span class="font-medium text-blue-600 hover:text-blue-500">
            Upload a file
          </span>
          or drag and drop
        </p>
        <p class="mt-1 text-xs text-gray-500">
          CSV or XML up to 10MB
        </p>
      </div>
    </div>
    
    <input 
      ref="fileInput"
      type="file" 
      class="hidden"
      accept=".csv,.xml" 
      @change="handleFileChange" 
    />
    
    <div class="flex justify-center mt-4">
      <button 
        @click="$refs.fileInput.click()" 
        type="button" 
        class="btn btn-primary"
        :disabled="isUploading"
      >
        Select File
      </button>
    </div>
    
    <div v-if="error" class="mt-4 p-3 bg-red-100 text-red-700 rounded">
      {{ error }}
    </div>

    <div v-if="selectedFile && !isUploading" class="mt-4">
      <div class="bg-blue-50 p-3 rounded flex justify-between items-center">
        <div>
          <p class="font-medium">Selected file:</p>
          <p class="text-sm text-gray-600">{{ selectedFile.name }}</p>
        </div>
        <button 
          @click="uploadFile" 
          class="btn btn-success"
        >
          Upload
        </button>
      </div>
    </div>

    <div v-if="uploadResult" class="mt-4">
      <div class="bg-blue-50 p-3 rounded">
        <p class="font-medium text-blue-700">Preview Ready</p>
        <p class="text-sm text-gray-600 mt-1">
          Found {{ uploadResult.transactionCount }} transactions
          from {{ uploadResult.dateRange?.start }} to {{ uploadResult.dateRange?.end }}
        </p>
        <div class="mt-3 flex justify-end space-x-2">
          <button 
            @click="cancelUpload"
            class="btn btn-secondary"
          >
            Cancel
          </button>
          <button 
            @click="confirmUpload"
            class="btn btn-primary"
          >
            Continue to Review
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent, ref } from 'vue';
import { transactionsApi } from '../services/api';

export default defineComponent({
  name: 'FileUploader',
  
  emits: ['upload-complete'],
  
  setup(props, { emit }) {
    const fileInput = ref(null);
    const selectedFile = ref(null);
    const isUploading = ref(false);
    const uploadProgress = ref(0);
    const isDragging = ref(false);
    const error = ref('');
    const uploadResult = ref(null);
    const moreMenuOpen = ref(false);
    
    const handleFileChange = (event) => {
      const files = event.target.files;
      if (files.length > 0) {
        validateAndSetFile(files[0]);
      }
    };
    
    const handleFileDrop = (event) => {
      isDragging.value = false;
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        validateAndSetFile(files[0]);
      }
    };
    
    const validateAndSetFile = (file) => {
      error.value = '';
      
      // Check file type
      const fileType = file.type;
      const validTypes = ['text/csv', 'application/xml', 'text/xml'];
      const validExtensions = ['.csv', '.xml'];
      
      const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!validTypes.includes(fileType) && !validExtensions.includes(fileExtension)) {
        error.value = 'Please select a CSV or XML file';
        return;
      }
      
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        error.value = 'File size exceeds 10MB limit';
        return;
      }
      
      selectedFile.value = file;
      uploadResult.value = null;
    };
    
    const uploadFile = async () => {
      if (!selectedFile.value) {
        error.value = 'Please select a file first';
        return;
      }
      
      try {
        isUploading.value = true;
        uploadProgress.value = 0;
        error.value = '';
        
        // Simulate upload progress (since fetch doesn't provide progress)
        const progressInterval = setInterval(() => {
          if (uploadProgress.value < 90) {
            uploadProgress.value += 10;
          }
        }, 300);
        
        const result = await transactionsApi.upload(selectedFile.value);
        
        clearInterval(progressInterval);
        uploadProgress.value = 100;
        
        uploadResult.value = result;
        selectedFile.value = null;
        
        // Notify parent that upload is complete
        emit('upload-complete', result);
        
        // Reset file input to allow uploading the same file again
        if (fileInput.value) {
          fileInput.value.value = '';
        }
      } catch (err) {
        error.value = err.message || 'Failed to upload file';
      } finally {
        setTimeout(() => {
          isUploading.value = false;
        }, 500); // Give a little time to show 100% progress
      }
    };
    
    // Add methods to handle user confirmation or cancellation
    const confirmUpload = async () => {
      try {
        // This will start the enrichment flow but NOT save transactions yet
        emit('upload-complete', uploadResult.value);
        uploadResult.value = null;
      } catch (err) {
        error.value = err.message || 'Failed to process upload';
      }
    };
    
    const cancelUpload = async () => {
      try {
        if (uploadResult.value && uploadResult.value.uploadId) {
          await transactionsApi.cancelUpload(uploadResult.value.uploadId);
        }
        uploadResult.value = null;
      } catch (err) {
        console.error('Error canceling upload:', err);
        // Still clear the UI even if the cancel API fails
        uploadResult.value = null;
      }
    };
    
    return {
      fileInput,
      selectedFile,
      isUploading,
      uploadProgress,
      isDragging,
      error,
      uploadResult,
      moreMenuOpen,
      handleFileChange,
      handleFileDrop,
      uploadFile,
      confirmUpload,
      cancelUpload
    };
  }
});
</script>
