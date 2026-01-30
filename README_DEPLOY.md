# 部署指南

您的项目因为依赖 **Headful Chrome (有头模式)** 和 **Chrome 插件**，以及需要 **持久化浏览器状态**，因此**无法**部署到 Vercel、Netlify 或 AWS Lambda 等 Serverless 平台。这些平台不支持图形界面和长期运行的进程。

**推荐的部署方案：Docker**

我已经为您准备了 `Dockerfile`，您可以将此项目部署到支持 Docker 的平台，如 **Render**、**Railway** 或 **Fly.io**，或者您自己的 VPS。

## 方案一：部署到 Render (推荐，有免费层)

1.  将代码推送到 GitHub。
2.  在 [Render.com](https://render.com) 注册账号。
3.  点击 **New +** -> **Web Service**。
4.  连接您的 GitHub 仓库。
5.  Render 会自动检测到 `Dockerfile`。
6.  选择 **Free** 套餐（注意：Free 套餐可能会休眠，且内存有限，如果 Chrome 崩溃可能需要升级到 Starter，$7/月）。
7.  点击 **Create Web Service**。

## 方案二：部署到 Railway

1.  安装 Railway CLI 或直接在 [Railway.app](https://railway.app) 网页操作。
2.  连接 GitHub 仓库。
3.  Railway 会自动构建 Docker 镜像并部署。
4.  Railway 提供更灵活的资源配额。

## 方案三：部署到 VPS (使用 Docker Compose)

如果您有自己的服务器（Ubuntu/CentOS），可以使用 Docker Compose 一键启动：

1.  确保服务器安装了 Docker 和 Docker Compose。
2.  创建 `docker-compose.yml`:

```yaml
version: '3'
services:
  gaoding-checker:
    build: .
    ports:
      - "3000:3000"
    restart: always
    # 挂载用户数据目录以持久化登录状态
    volumes:
      - ./chrome-user-data:/tmp/gaoding-chrome-data
```

3.  运行 `docker-compose up -d --build`。

## 注意事项

*   **性能**：运行 Chrome 比较消耗内存，建议分配至少 1GB 内存。
*   **登录**：部署后首次使用，您可能需要访问部署后的 URL 并扫码登录。如果使用了持久化卷（如方案三），登录态会保存；如果使用 Render/Railway 的临时文件系统，每次重新部署可能需要重新登录。
