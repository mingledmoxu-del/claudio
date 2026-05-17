import pkg from 'NeteaseCloudMusicApi';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { login_qr_key, login_qr_create, login_qr_check } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');

async function saveToEnv(cookie: string) {
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8');
  }

  const cookieLine = `NETEASE_COOKIE=${cookie}`;
  
  if (content.includes('NETEASE_COOKIE=')) {
    // 替换现有的
    content = content.replace(/NETEASE_COOKIE=.*/, cookieLine);
  } else {
    // 追加新的
    content += `\n${cookieLine}\n`;
  }

  fs.writeFileSync(envPath, content.trim() + '\n', 'utf-8');
  console.log('✅ Cookie 已成功保存到 server/.env 文件中！');
}

async function login() {
  try {
    console.log('正在初始化扫码登录...');
    
    // 1. 获取 key
    const res1 = await login_qr_key({});
    // @ts-ignore
    const key = res1.body.data.unikey;

    // 2. 生成二维码链接
    const res2 = await login_qr_create({ key, qrimg: true });
    // @ts-ignore
    const qrUrl = res2.body.data.qrurl;
    
    console.log('\n--------------------------------------------------');
    console.log('请在浏览器打开以下链接，并使用网易云音乐 APP 扫码：');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`);
    console.log('--------------------------------------------------\n');

    // 3. 轮询状态
    const timer = setInterval(async () => {
      const res3 = await login_qr_check({ key });
      const status = res3.body.code;

      if (status === 800) {
        console.log('❌ 二维码已过期，请重新运行脚本。');
        clearInterval(timer);
        process.exit(0);
      } else if (status === 803) {
        console.log('🎉 登录成功！');
        // @ts-ignore
        const cookie = res3.body.cookie;
        await saveToEnv(cookie);
        clearInterval(timer);
        process.exit(0);
      } else if (status === 801) {
        // 等待扫码，不打印以防刷屏
      } else if (status === 802) {
        console.log('👌 已扫码，请在手机上确认登录...');
      }
    }, 3000);
  } catch (error) {
    console.error('登录出错:', error);
    process.exit(1);
  }
}

login();
