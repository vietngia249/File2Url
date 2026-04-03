import './style.css'
// Lucide icons init
if (window.lucide) {
  lucide.createIcons();
}

// --- Các element của UPLOAD ---
const elDropzone = document.getElementById('dropzone');
const elFileInput = document.getElementById('fileInput');
const elUploadPanel = document.getElementById('upload-panel');
const elLoadingPanel = document.getElementById('upload-progress-panel');
const elSuccessPanel = document.getElementById('success-modal');

const elSelectedName = document.getElementById('selected-filename');
const elSelectedSize = document.getElementById('selected-filesize');
const btnRemoveFile = document.getElementById('btn-remove-file');
const btnUpload = document.getElementById('btn-upload');

const inputExpire = document.getElementById('input-expire');
const inputBurn = document.getElementById('input-burn');

// --- Các element của SUCCESS UPLOAD ---
const elResultUrl = document.getElementById('result-url');
const elResultKey = document.getElementById('result-key');
const btnCopyUrl = document.getElementById('btn-copy-url');
const btnCopyKey = document.getElementById('btn-copy-key');
const btnNewUpload = document.getElementById('btn-new-upload');

// API Server 
const API_URL = 'https://file2url-nsdd.onrender.com';

let currentFile = null;

// ==========================================
// 1. ROUTER ĐƠN GIẢN
// ==========================================
function handleRouting() {
  const hash = window.location.hash || '#';
  const urlParams = new URLSearchParams(window.location.search);

  // Reset tab (Với Tailwind, display:none đc quản lý qua class 'hidden')
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('section-active');
    v.classList.add('hidden');
  });
  document.getElementById('nav-upload')?.classList.remove('border-b-2');
  document.getElementById('nav-manage')?.classList.remove('border-b-2');

  elDropzone.classList.remove('hidden');

  if (urlParams.has('dl')) {
    // Mode Download
    document.getElementById('view-download').classList.remove('hidden');
    handleDownloadMode(urlParams.get('dl'));
  } else if (hash === '#manage' || urlParams.has('manage')) {
    // Mode Manage
    document.getElementById('view-manage').classList.remove('hidden');
    document.getElementById('nav-manage')?.classList.add('border-b-2');
    handleManageMode();
  } else {
    // Mode Upload (Default)
    document.getElementById('view-upload').classList.remove('hidden');
    document.getElementById('nav-upload')?.classList.add('border-b-2');
    resetUploadState();
  }
}
window.addEventListener('hashchange', handleRouting);
window.addEventListener('popstate', handleRouting);
handleRouting();

// ==========================================
// 2. CHỨC NĂNG UPLOAD FILE
// ==========================================
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024, dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function handleFileSelect(file) {
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) {
    alert("File của bạn vượt quá giới hạn 100MB cho phép.");
    return;
  }
  currentFile = file;
  elSelectedName.textContent = file.name;
  elSelectedSize.textContent = formatBytes(file.size);

  document.getElementById('dropzone-text').textContent = "Upload Sẵn Sàng";
  document.getElementById('dropzone-subtext').textContent = "Hãy tinh chỉnh mật khẩu đính kèm nếu cần thiết.";
  document.getElementById('icon-upload-state').textContent = "task";

  elUploadPanel.classList.remove('hidden');
}

function resetUploadState() {
  currentFile = null;
  document.getElementById('dropzone-text').textContent = "Kéo thả file vào đây hoặc Click để duyệt";
  document.getElementById('dropzone-subtext').textContent = "Hỗ trợ 100MB cho khách ngoài hệ thống.";
  document.getElementById('icon-upload-state').textContent = "cloud_upload";
  
  elUploadPanel.classList.add('hidden');
  elLoadingPanel.classList.add('hidden');
  
  // Hide success modal with animation
  elSuccessPanel.classList.add('opacity-0');
  setTimeout(()=> elSuccessPanel.classList.add('hidden'), 300);
  
  elFileInput.value = '';
}

// Event Listeners Drag n Drop
elDropzone.addEventListener('click', () => elFileInput.click());
elFileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

elDropzone.addEventListener('dragover', (e) => { e.preventDefault(); elDropzone.classList.add('border-primary'); });
elDropzone.addEventListener('dragleave', () => { elDropzone.classList.remove('border-primary'); });
elDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  elDropzone.classList.remove('border-primary');
  if (e.dataTransfer.files.length) handleFileSelect(e.dataTransfer.files[0]);
});

btnRemoveFile.addEventListener('click', resetUploadState);
btnNewUpload.addEventListener('click', resetUploadState);

// Trigger API Upload
btnUpload.addEventListener('click', async () => {
  if (!currentFile) return;

  const formData = new FormData();
  formData.append('file', currentFile);
  formData.append('expire', inputExpire.value);
  formData.append('delete_after_expiry', inputBurn.checked ? 'true' : 'false');

  elUploadPanel.classList.add('opacity-50', 'pointer-events-none');
  elLoadingPanel.classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Upload failed');

    elLoadingPanel.classList.add('hidden');
    elUploadPanel.classList.remove('opacity-50', 'pointer-events-none');

    // Show Success Modal
    elSuccessPanel.classList.remove('hidden');
    // Animate pop
    setTimeout(()=> elSuccessPanel.classList.remove('opacity-0'), 10);

    // Xử lý URL
    const encodedName = encodeURIComponent(currentFile.name);
    const viewUrl = window.location.origin + '/?dl=' + data.url.split('/').pop() + `&n=${encodedName}&s=${currentFile.size}&t=${currentFile.type.split('/')[0]}`;
    elResultUrl.value = viewUrl;
    elResultKey.value = data.management_key || 'No Key Generated';

  } catch (err) {
    alert('Lỗi Upload: ' + err.message);
    elLoadingPanel.classList.add('hidden');
    elUploadPanel.classList.remove('opacity-50', 'pointer-events-none');
  }
});

// Copy logic
const copyToClip = (input, btn) => {
  input.select();
  document.execCommand('copy');
  const tempHtml = btn.innerHTML;
  btn.innerHTML = `<span class="material-symbols-outlined text-sm">check</span> Copied!`;
  setTimeout(() => btn.innerHTML = tempHtml, 2000);
}
btnCopyUrl.addEventListener('click', () => copyToClip(elResultUrl, btnCopyUrl));
btnCopyKey.addEventListener('click', () => copyToClip(elResultKey, btnCopyKey));


// ==========================================
// 3. CHỨC NĂNG DOWNLOAD / VIEW
// ==========================================
function handleDownloadMode(fileId) {
  const elStateLoading = document.getElementById('dl-state-loading');
  const elStateReady = document.getElementById('dl-state-ready');
  const elStateError = document.getElementById('dl-state-error');

  const urlParams = new URLSearchParams(window.location.search);
  const rawName = urlParams.get('n');
  const rawSize = urlParams.get('s');
  const fileType = urlParams.get('t');

  const fileName = rawName ? decodeURIComponent(rawName) : "File được chia sẻ ẩn danh";
  const fileSize = rawSize ? formatBytes(parseInt(rawSize)) : "--";
  const fileApiUrl = `${API_URL}/file/${fileId}`;

  // Tạm ẩn các container
  elStateLoading.classList.remove('hidden');
  elStateReady.classList.add('hidden');
  elStateError.classList.add('hidden');

  // Setup Action Buttons
  // Setup Action Buttons
  const btnDownload = document.getElementById('btn-download');
  const btnView = document.getElementById('btn-view');
  
  // Link tải sẽ truyền cờ ?download=1 để Backend tự động chuyển Header thành File Tải Xuống
  btnDownload.href = fileApiUrl + "?download=1";
  
  // Logic hiển thị nút "Xem Trực Tiếp" cho các file hỗ trợ Inline
  const inlineTypes = ['image', 'video', 'audio', 'text', 'pdf'];
  if (inlineTypes.includes(fileType)) {
    btnView.classList.remove('hidden');
    // Nút xem trực tiếp không có cờ download=1 nên chọc thẳng vào API gốc
    btnView.onclick = () => window.open(fileApiUrl, '_blank');
  } else {
    btnView.classList.add('hidden');
  }

  // Hiển thị thông tin
  document.getElementById('dl-filename').textContent = fileName;
  document.getElementById('dl-filesize').textContent = fileSize;

  // Preview Media (Ảnh / Video)
  const previewContainer = document.getElementById('dl-preview-container');
  if (previewContainer) {
    previewContainer.innerHTML = '';
    
    if (fileType === 'image') {
      previewContainer.innerHTML = `<img src="${fileApiUrl}" style="max-width:100%; border-radius:12px;" alt="Preview"/>`;
      previewContainer.classList.remove('hidden');
      document.querySelector('#dl-icon-container').classList.add('hidden'); 
    } else if (fileType === 'video') {
      previewContainer.innerHTML = `<video src="${fileApiUrl}" controls style="max-width:100%; border-radius:12px;"></video>`;
      previewContainer.classList.remove('hidden');
      document.querySelector('#dl-icon-container').classList.add('hidden');
    } else {
      document.querySelector('#dl-icon-container').classList.remove('hidden');
      previewContainer.classList.add('hidden');
    }
  }

  // Quá trình Fake loading cho mượt
  setTimeout(() => {
    elStateLoading.classList.add('hidden');
    elStateReady.classList.remove('hidden');
    elStateReady.classList.add('flex');
  }, 1200);
}

// ==========================================
// 4. CHỨC NĂNG GỌI QUẢN LÝ
// ==========================================
function handleManageMode() {
  document.getElementById('btn-manage-search').addEventListener('click', async () => {
    const key = document.getElementById('input-manage-key').value;
    if (!key) return;

    // Reset view
    const manageResultNode = document.getElementById('manage-result');
    manageResultNode.innerHTML = '<div class="flex justify-center p-8"><span class="material-symbols-outlined animate-spin text-4xl text-primary">sync</span></div>';
    manageResultNode.classList.remove('hidden');

    try {
      const res = await fetch(`${API_URL}/manage/${key}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      const html = `
        <div class="flex items-center gap-4 border-b border-slate-100 pb-4">
          <div class="w-12 h-12 bg-primary/10 flex items-center justify-center rounded-lg">
            <span class="material-symbols-outlined text-primary">draft</span>
          </div>
          <div class="flex flex-col">
            <span class="font-headline font-bold text-slate-800 text-lg">${data.filename}</span>
            <span class="text-xs text-slate-500 font-label uppercase tracking-widest">${formatBytes(data.size_bytes)}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 mt-2">
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <p class="text-[10px] font-label uppercase tracking-widest text-slate-400 mb-1">Trạng Thái</p>
            <p class="text-sm font-bold ${data.is_expired ? 'text-rose-500' : 'text-emerald-500'}">
              ${data.is_expired ? 'Đã Hết Hạn / Khoá' : 'Đang Lưu Trữ Hoạt Động'}
            </p>
          </div>
          <div class="bg-rose-50 p-4 rounded-xl border border-red-100 cursor-pointer hover:bg-rose-100 active:scale-95 transition-all" id="force-delete">
            <p class="text-[10px] font-label uppercase tracking-widest text-red-400 mb-1">Cảnh Báo</p>
            <p class="text-sm font-bold text-red-600 flex items-center gap-1">
              TIÊU HUỶ <span class="material-symbols-outlined text-sm">local_fire_department</span>
            </p>
          </div>
        </div>
      `;
      manageResultNode.innerHTML = html;

      // Bind delete action
      document.getElementById('force-delete').addEventListener('click', async () => {
        if (!confirm('Hành động này sẽ xoá tệp mãi mãi trên R2 Cloudflare. Bạn chắc chứ?')) return;
        
        await fetch(`${API_URL}/manage/${key}`, { method: 'DELETE' });
        manageResultNode.innerHTML = `
          <div class="p-8 text-center bg-rose-50 rounded-xl border border-rose-200">
            <span class="material-symbols-outlined text-4xl text-rose-500 mb-2">delete_history</span>
            <p class="text-rose-600 font-bold font-headline">FILE ĐÃ BỊ XOÁ KHỎI HỆ THỐNG.</p>
          </div>
        `;
      });

    } catch (err) {
      manageResultNode.innerHTML = `
        <div class="p-4 text-center bg-red-50 rounded-xl border border-red-100 text-red-600 text-sm font-bold">
          ${err.message || 'Key không hợp lệ hoặc lỗi mạng'}
        </div>
      `;
    }
  });
}
