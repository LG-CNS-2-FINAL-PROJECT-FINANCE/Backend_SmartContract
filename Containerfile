# Node.js LTS 기반 이미지
FROM node:18-alpine

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 파일 먼저 복사
COPY package.json ./
COPY package-lock.json ./

# 종속성 설치
RUN npm ci

# 전체 프로젝트 복사
COPY . .

# curl 설치
RUN apk add --no-cache curl

# 디버그나 로컬 실행용 CMD (Jenkins에서는 보통 무시됨)
CMD ["npx", "hardhat"]
