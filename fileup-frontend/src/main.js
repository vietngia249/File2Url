import './style.css'
// Lucide icons init
lucide.createIcons();

// --- Các element của UPLOAD ---
const elDropzone = document.getElementById('dropzone');
const elFileInput = document.getElementById('fileInput');
const elUploadPanel = document.getElementById('upload-panel');
const elLoadingPanel = document.getElementById('loading-panel');
const elSuccessPanel = document.getElementById('success-panel');

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

// API Server (Change this to your Render URL later)
const API_URL = 'https://file2url-nsdd.onrender.com';

let currentFile = null;

// ==========================================
// 1. ROUTER ĐƠN GIẢN
// ==========================================
function handleRouting() {
  const hash = window.location.hash;
  const urlParams = new URLSearchParams(window.location.search);

  // Hide all sections
  document.querySelectorAll('.view').forEach(v => v.classList.remove('section-active'));

  if (urlParams.has('dl')) {
    // Mode Download
    document.getElementById('view-download').classList.add('section-active');
    handleDownloadMode(urlParams.get('dl'));
  } else if (urlParams.has('manage')) {
    // Mode Manage
    document.getElementById('view-manage').classList.add('section-active');
    handleManageMode();
  } else {
    // Mode Upload (Default)
    document.getElementById('view-upload').classList.add('section-active');
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

  elDropzone.classList.add('hidden');
  elUploadPanel.classList.remove('hidden');
}

function resetUploadState() {
  currentFile = null;
  elDropzone.classList.remove('hidden');
  elUploadPanel.classList.add('hidden');
  elLoadingPanel.classList.add('hidden');
  elSuccessPanel.classList.add('hidden');
  elFileInput.value = '';
}

// Event Listeners Drag n Drop
elDropzone.addEventListener('click', () => elFileInput.click());
elFileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0]));

elDropzone.addEventListener('dragover', (e) => { e.preventDefault(); elDropzone.style.borderColor = '#bd00ff'; });
elDropzone.addEventListener('dragleave', () => { elDropzone.style.borderColor = 'rgba(0, 243, 255, 0.4)'; });
elDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  elDropzone.style.borderColor = 'rgba(0, 243, 255, 0.4)';
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

  elUploadPanel.classList.add('hidden');
  elLoadingPanel.classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Upload failed');

    elLoadingPanel.classList.add('hidden');
    elSuccessPanel.classList.remove('hidden');

    // Gán dữ liệu trả về URL mới cho local web (chứ ko phải trả url api thẳng)
    const viewUrl = window.location.origin + '/?dl=' + data.url.split('/').pop();
    elResultUrl.value = viewUrl;
    elResultKey.value = data.management_key || 'No Key Generated';

  } catch (err) {
    alert('Lỗi Upload: ' + err.message);
    elLoadingPanel.classList.add('hidden');
    elUploadPanel.classList.remove('hidden');
  }
});

// Copy logic
const copyToClip = (input, btn) => {
  input.select();
  document.execCommand('copy');
  const oldText = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => btn.textContent = oldText, 2000);
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

  // Setup link tải trực tiếp (Chỉ ấn download mới gọi lên server)
  document.getElementById('btn-download').href = `${API_URL}/file/${fileId}`;

  // Fake loading một chút cho UI mượt
  setTimeout(() => {
    elStateLoading.classList.add('hidden');
    // Với File2Url hiện tại, GET /file/:id trực tiếp stream ra file nên không check metadata qua api được bằng CORS 
    // Trừ khi bạn xây endpoint GET /file/meta/:id. Tạm thời show state ready luôn.

    document.getElementById('dl-filename').textContent = "File được bảo vệ";
    document.getElementById('dl-expiry-text').textContent = "Chú ý: File có tính năng tự động bị tiêu huỷ!";
    elStateReady.classList.remove('hidden');
  }, 1000);
}

// ==========================================
// 4. CHỨC NĂNG GỌI QUẢN LÝ
// ==========================================
function handleManageMode() {
  document.getElementById('btn-manage-search').addEventListener('click', async () => {
    const key = document.getElementById('input-manage-key').value;
    if (!key) return;

    try {
      const res = await fetch(`${API_URL}/manage/${key}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      const html = `
        <div class="result-box mt-20">
          <p>Tên file: <b>${data.filename}</b></p>
          <p>Kích thước: <b>${formatBytes(data.size_bytes)}</b></p>
          <p>Tình trạng: ${data.is_expired ? '<span class="neon-red">Đã hết hạn</span>' : '<span class="success-icon">Còn sống</span>'}</p>
          <button class="btn-primary" style="background:var(--danger); margin-top:20px" id="force-delete">TIÊU HUỶ FILES</button>
        </div>
      `;
      document.getElementById('manage-result').innerHTML = html;
      document.getElementById('manage-result').classList.remove('hidden');

      // Bind delete action
      document.getElementById('force-delete').addEventListener('click', async () => {
        await fetch(`${API_URL}/manage/${key}`, { method: 'DELETE' });
        alert('File đã tan tành mây khói!');
        window.location.reload();
      });

    } catch (err) {
      alert("Không tìm thấy file với key này, hoặc đã bị dọn rác xoá bỏ!");
    }
  });
}
