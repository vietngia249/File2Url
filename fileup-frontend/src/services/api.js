const BASE_URL = 'https://file2url-nsdd.onrender.com';

function getAuthHeader() {
  const token = localStorage.getItem('jwt_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const api = {
  // ---------------------------------------------------------
  // Auth & User
  // ---------------------------------------------------------
  async login(email, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  async register(email, password) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  async getGoogleOAuthUrl() {
    const returnTo = window.location.origin;
    const res = await fetch(`${BASE_URL}/auth/google/url?returnTo=${encodeURIComponent(returnTo)}`, {
      headers: { ...getAuthHeader() }
    });
    return res.json();
  },

  // ---------------------------------------------------------
  // File Upload
  // ---------------------------------------------------------
  async uploadFile(file, options, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options.max_views) formData.append('max_views', options.max_views);
    if (options.exact_expires_at) formData.append('exact_expires_at', options.exact_expires_at);
    // storageConfig should be "r2" or "google_drive"
    if (options.storageConfig) formData.append('storageConfig', options.storageConfig);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/upload`, true);
      
      const headers = getAuthHeader();
      if (headers.Authorization) {
        xhr.setRequestHeader('Authorization', headers.Authorization);
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch(e) {
            resolve(xhr.responseText);
          }
        } else {
          try {
            reject(JSON.parse(xhr.responseText));
          } catch(e) {
            reject({ error: `Upload failed: ${xhr.status}` });
          }
        }
      };

      xhr.onerror = () => reject({ error: "Network Error" });
      xhr.send(formData);
    });
  },

  // ---------------------------------------------------------
  // File Retrieval & Management
  // ---------------------------------------------------------
  async getFile(id) {
    const res = await fetch(`${BASE_URL}/file/${id}/info`);
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async getManagementInfo(managementKey) {
    const res = await fetch(`${BASE_URL}/manage/${managementKey}`);
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async updateFileSettings(managementKey, updates) {
    const res = await fetch(`${BASE_URL}/manage/${managementKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw await res.json();
    return res.json();
  },

  async deleteFile(managementKey) {
    const res = await fetch(`${BASE_URL}/manage/${managementKey}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }
};
