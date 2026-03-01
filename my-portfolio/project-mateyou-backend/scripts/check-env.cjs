#!/usr/bin/env node

/**
 * 환경 변수 진단 스크립트
 * EC2 서버에서 실행: node scripts/check-env.js
 */

const path = require('path');
const fs = require('fs');

// .env 파일 로드
const envPath = path.join(__dirname, '..', '.env');
console.log('📂 .env 파일 경로:', envPath);
console.log('📂 .env 파일 존재 여부:', fs.existsSync(envPath) ? '✅ 있음' : '❌ 없음');
console.log('');

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ .env 파일 로드 완료\n');
} else {
  console.error('❌ .env 파일을 찾을 수 없습니다!');
  console.log('');
  process.exit(1);
}

// 필수 환경 변수 체크리스트
const requiredVars = {
  'Supabase': [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
  ],
  'Email (SMTP)': [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ],
  'Email (Resend)': [
    'RESEND_API_KEY',
  ],
  'Toss Payments': [
    'TOSS_CLIENT_KEY',
    'TOSS_SECRET_KEY',
  ],
  'Push Notifications': [
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ],
  'Server': [
    'PORT',
  ],
};

console.log('🔍 환경 변수 체크 결과:\n');
console.log('='.repeat(80));

let totalMissing = 0;
let totalFound = 0;

for (const [category, vars] of Object.entries(requiredVars)) {
  console.log(`\n📦 ${category}`);
  console.log('-'.repeat(80));

  for (const varName of vars) {
    const value = process.env[varName];
    const exists = !!value;

    if (exists) {
      totalFound++;
      // 민감한 정보는 마스킹
      const maskedValue = value.length > 20
        ? `${value.substring(0, 10)}...${value.substring(value.length - 5)}`
        : value.substring(0, 10) + '...';

      console.log(`  ✅ ${varName.padEnd(30)} = ${maskedValue}`);
    } else {
      totalMissing++;
      console.log(`  ❌ ${varName.padEnd(30)} = <없음>`);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 결과: ${totalFound}/${totalFound + totalMissing} 개의 환경 변수 설정됨`);

if (totalMissing > 0) {
  console.log(`\n⚠️  경고: ${totalMissing}개의 환경 변수가 설정되지 않았습니다!`);
  console.log('\n해결 방법:');
  console.log('1. .env 파일이 서버에 업로드되었는지 확인');
  console.log('2. .env 파일에 누락된 변수를 추가');
  console.log('3. PM2 재시작: pm2 restart mateyou-backend');
  process.exit(1);
} else {
  console.log('\n✅ 모든 환경 변수가 정상적으로 설정되었습니다!');
  process.exit(0);
}
