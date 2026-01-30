# 部署指南：Hugging Face Spaces (Docker)

由于 Render 的免费层有休眠机制，且您的应用需要 Docker 环境，**Hugging Face Spaces** 是目前最稳定、完全免费且支持 Docker 的最佳替代方案。

## 步骤一：创建 Space

1.  访问 [Hugging Face](https://huggingface.co/) 并注册/登录账号。
2.  点击顶部导航栏的 **New Space**。
3.  **Space name**: 起个名字（例如 `gaoding-checker`）。
4.  **License**: 随便选一个（例如 `MIT`）。
5.  **Select the Space SDK**: 选择 **Docker** (这步很关键)。
6.  **Docker Template**: 选择 **Blank**。
7.  **Space hardware**: 保持默认的 **CPU Basic (Free)**。
8.  点击 **Create Space**。

## 步骤二：上传代码

创建好 Space 后，您会看到一个类似 GitHub 的页面。您需要将代码上传上去。

### 方法 A：通过网页上传 (适合小白，最简单)
1.  在 Space 页面，点击 **Files** 标签页。
2.  点击 **Add file** -> **Upload files**。
3.  将您本地 `gaoding-checker-web` 文件夹里的**所有文件**（除了 `.git`, `node_modules`, `.venv`）拖进去。
    *   **重点**：一定要包含 `Dockerfile`, `package.json`, `server.js`, `public/`, `extension/` 这些核心文件/目录。
4.  在下方的 "Commit changes" 里随便写点啥（比如 "Initial deploy"），点击 **Commit changes to main**。

### 方法 B：通过 Git 命令行 (如果您已经熟悉 Git)
1.  Space 页面右上角点击 **Clone repository**，复制命令。
2.  在本地终端运行：
    ```bash
    git clone https://huggingface.co/spaces/您的用户名/gaoding-checker
    cd gaoding-checker
    # 将您的代码复制到这里
    git add .
    git commit -m "Deploy"
    git push
    ```

## 步骤三：等待构建

上传完成后，点击 **App** 标签页。
*   您会看到 "Building..." 的状态。
*   等待几分钟（第一次会比较慢，因为要下载 Chrome）。
*   当状态变成 **Running** 时，您就能看到熟悉的界面了！

## 常见问题

*   **端口**：我已经帮您将端口改为 `7860`（Hugging Face 的默认端口），您不需要做任何修改。
*   **登录**：和 Render 一样，Docker 容器重启后登录态会丢失。Hugging Face Spaces 提供了 "Persistent Storage" (持久化存储) 选项（在 Settings -> Storage 里），如果您需要长期保存登录状态，可以开启它（免费层好像有少量额度，或者付费）。
