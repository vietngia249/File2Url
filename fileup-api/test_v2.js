// test_v2.js - Chạy thử các API của Backend hệ thống V2 Đã Deploy
import fs from 'fs';

const API_URL = 'https://file2url-nsdd.onrender.com';

async function runTests() {
  console.log(`🚀 Bắt đầu test luồng V2 trên: ${API_URL}`);

  try {
    // -------------------------------------------------------------
    // 1. Khởi động và Health Check
    // -------------------------------------------------------------
    const healthRes = await fetch(`${API_URL}/health`);
    const healthData = await healthRes.json();
    console.log(`\n[1] Health Check: ${healthRes.status}`, healthData);

    // -------------------------------------------------------------
    // 2. Test luồng Upload Cơ Bản (Anonymous -> R2 Vault_
    // -------------------------------------------------------------
    // Tạo 1 file rác bé xíu
    fs.writeFileSync('test_junk.txt', 'Day la file test 123');
    
    const form = new FormData();
    const fileBuffer = fs.readFileSync('test_junk.txt');
    const blob = new Blob([fileBuffer], { type: 'text/plain' });
    
    form.append('file', blob, 'test_junk.txt');
    form.append('max_views', '5'); // Limit = 5 views
    form.append('exact_expires_at', new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()); 

    console.log(`\n[2] Đang Upload File ẩn danh lên R2...`);
    const uploadRes = await fetch(`${API_URL}/upload`, { method: 'POST', body: form });
    const uploadData = await uploadRes.json();
    console.log(`=> Upload Status: ${uploadRes.status}`, uploadData);

    const mKey = uploadData.management_key;
    const fileUrl = uploadData.url;

    // Lọc lại rác
    fs.unlinkSync('test_junk.txt');

    // -------------------------------------------------------------
    // 3. Test API Quản Trị (PATCH max views)
    // -------------------------------------------------------------
    if (mKey) {
      console.log(`\n[3] Đang Sửa Cấu hình File qua Management Key: ${mKey}...`);
      const patchRes = await fetch(`${API_URL}/manage/${mKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_views: 10 }) // Nâng lượt truy cập lên 10
      });
      const patchData = await patchRes.json();
      console.log(`=> Update Status: ${patchRes.status}`, patchData);

      // Xem file details sau update
      const viewRes = await fetch(`${API_URL}/manage/${mKey}`);
      const viewData = await viewRes.json();
      console.log(`=> Tình trạng file sau sửa: Lượt view tối đa: ${viewData.max_views}, Lượt tải / xem: ${viewData.current_views}`);
    }

    // -------------------------------------------------------------
    // 4. Test Đăng Ký Tài khoản Người dùng Mới
    // -------------------------------------------------------------
    console.log(`\n[4] Tự tạo account Mới để test Authenticator`);
    const mockEmail = `test_${Date.now()}@test.com`;
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mockEmail, password: "superpassword123" })
    });
    const regData = await regRes.json();
    console.log(`=> Register Status: ${regRes.status}`, regData);

    // -------------------------------------------------------------
    // 5. Test Đăng nhập & Lấy URL Google Drive
    // -------------------------------------------------------------
    console.log(`\n[5] Test luồng Đăng nhập -> Lấy đường link cấu hình GDrive`);
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mockEmail, password: "superpassword123" })
    });
    const loginData = await loginRes.json();
    
    if (loginData.token) {
       console.log('=> Login Thành công! Nhận được JWT Token.');

       const urlRes = await fetch(`${API_URL}/auth/google/url`, {
         headers: { 'Authorization': `Bearer ${loginData.token}` }
       });
       const urlData = await urlRes.json();
       console.log(`\n⭐ ĐỂ THỬ TÍNH NĂNG GOOGLE DRIVE, BẠN CẦN CLICK VÀO LINK NÀY:\n${urlData.url}`);
    }

  } catch (err) {
    console.error("LỖI KHI CHẠY TEST:", err);
  }
}

runTests();
