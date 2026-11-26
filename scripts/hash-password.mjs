// Dùng: npm run hash-password -- "mat-khau-cua-ban"
// In ra ADMIN_PASSWORD_HASH và một SESSION_SECRET ngẫu nhiên để dán vào Vercel.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Hãy nhập mật khẩu dài ít nhất 10 ký tự: npm run hash-password -- "matkhau..."');
  process.exit(1);
}
console.log('ADMIN_PASSWORD_HASH=' + bcrypt.hashSync(pw, 12));
console.log('SESSION_SECRET=' + randomBytes(32).toString('hex'));
console.log('CRON_SECRET=' + randomBytes(24).toString('hex'));
