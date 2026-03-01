#!/bin/bash

# 코드 업데이트
git pull origin main

# 의존성 설치
npm install

# 빌드
npm run build

# PM2로 재시작
pm2 restart mateyou-backend

