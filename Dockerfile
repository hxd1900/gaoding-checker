FROM node:18-slim

# 安装 Chrome 依赖和 Xvfb
# 使用 chromium 而不是 google-chrome-stable 以减小体积并提高兼容性
# 注意：插件需要 Headful 模式，所以我们需要 xvfb
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DISPLAY=:99

# 创建工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制应用代码 (包括 extension 文件夹)
COPY . .

# 暴露端口
EXPOSE 7860

# 创建启动脚本，用于启动 Xvfb 和 Node 应用
RUN echo '#!/bin/bash\nXvfb :99 -screen 0 1024x768x16 &\nnode server.js' > /start.sh && chmod +x /start.sh

# 启动命令
CMD ["/start.sh"]
