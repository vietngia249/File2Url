-- ---------------------------------------------------------------------------
-- migration_v2.sql — File2Url V2 Database Schema Updates
-- ---------------------------------------------------------------------------

-- 1. TẠO BẢNG USERS (Người dùng có tài khoản)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- 2. TẠO BẢNG OAUTH TOKENS (Cấu hình liên kết Google Drive)
CREATE TABLE IF NOT EXISTS user_storage_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- vd: 'google_drive'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    UNIQUE(user_id, provider)
);

-- 3. CẬP NHẬT BẢNG FILES CHO DUAL-KILL LƯỢT TRUY CẬP VÀ G-DRIVE
-- Thêm tuỳ chọn Giới hạn số lượt xem
ALTER TABLE files ADD COLUMN IF NOT EXISTS max_views INT DEFAULT NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS current_views INT NOT NULL DEFAULT 0;

-- Phân vùng Provider (Phân biệt file đang cất ở R2 Server hay ổ cá nhân của người dùng)
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_provider VARCHAR(50) NOT NULL DEFAULT 'r2';
-- ID File bên Google Drive. (Sẽ dùng storage_key nếu nằm ở R2)
ALTER TABLE files ADD COLUMN IF NOT EXISTS provider_file_id VARCHAR(255);

-- Hạn xóa ổ cứng bắt buộc của R2 (Nhằm dọn rác, file G-Drive sẽ không có hạn này)
ALTER TABLE files ADD COLUMN IF NOT EXISTS retention_until TIMESTAMP; 

-- Gắn định danh chủ sở hữu file nếu là file do tài khoản tải lên
ALTER TABLE files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 4. TẠO INDEX TỐI ƯU HIỆU SUẤT XÓA RÁC VÀ TÌM KIẾM
CREATE INDEX IF NOT EXISTS idx_retention_until ON files(retention_until);
CREATE INDEX IF NOT EXISTS idx_user_id ON files(user_id);

-- Lưu ý: Những file cũ từ v1 đang tồn tại vẫn dùng được bình thường do storage_provider tự gán mặc định là 'r2'.
