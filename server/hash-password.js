import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
const input = process.argv[2];
const password = input && input.length ? input : crypto.randomBytes(9).toString('base64url');
if (password.length < 8) {
  console.error('\n[错误] 密码太短，请至少使用 8 位字符。\n');
  process.exit(1);
}
const hash = hashPassword(password);
console.log('');
console.log('密码：' + password);
console.log('');
console.log('把下面这一行写入 .env（替换原有 APP_PASSWORD_HASH）：');
console.log('APP_PASSWORD_HASH=' + hash);
console.log('');
console.log('提示：哈希一旦生成无法反推密码，请自行保存好上面的明文密码。');
console.log('');
