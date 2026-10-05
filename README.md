# 班级网站基础架构

这是一个不依赖前端框架和第三方包的班级网站脚手架，包含：

- 顶部固定导航：首页、班级总览、科学研究。
- 首页班级新闻：优先读取微信公众号接口，未配置时展示示例数据。
- 班级总览：29 张成员资料卡，桌面端为 5 列、最多 6 行，移动端自动响应式排列。
- 科学研究：预留空栏目与后续扩展位置。
- 页面下滑后右下角显示“返回顶部”按钮。
- 灰色底部信息公示：版权、备案、地址、邮编、电话、邮箱、合作伙伴。
- 同源 Node API：站点信息、新闻、成员资料、微信文章。

## 启动

需要 Node.js 18 或更高版本。

```powershell
node server.js
```

然后打开 <http://localhost:3000>。

也可以使用：

```powershell
npm start
```

如果 PowerShell 禁止执行 `npm.ps1`，直接运行 `node server.js` 即可。

## 微信公众号配置

不要把 AppSecret 写进前端。启动服务前设置服务器环境变量：

```powershell
$env:WECHAT_APP_ID="你的AppID"
$env:WECHAT_APP_SECRET="你的AppSecret"
node server.js
```

微信公众号需要满足以下条件：

1. 公众号具备调用 `freepublish/batchget` 的权限。
2. 当前服务器出口 IP 已加入微信公众平台的 IP 白名单。
3. 服务器可以访问 `api.weixin.qq.com`。

前端调用的接口是：

```text
GET /api/wechat/articles?limit=6
```

接口会自动换取并缓存 `access_token`，再把公众号发布内容整理为以下前端格式：

```json
{
  "source": "wechat",
  "updatedAt": "2026-09-26T00:00:00.000Z",
  "items": [
    {
      "id": "文章ID",
      "title": "标题",
      "summary": "摘要",
      "author": "作者",
      "publishedAt": "发布时间",
      "url": "微信文章地址",
      "coverImage": "封面地址"
    }
  ]
}
```

## API 一览

| 方法 | 地址 | 用途 |
| --- | --- | --- |
| GET | `/api/site` | 读取底部公示和站点名称 |
| GET | `/api/news` | 读取本地示例/备用新闻 |
| GET | `/api/members` | 读取 29 位成员资料 |
| PUT | `/api/members/:id` | 修改指定成员资料 |
| GET | `/api/wechat/articles?limit=6` | 获取微信公众号已发布文章 |
| GET | `/api/health` | 服务健康检查 |

成员数据保存在 `data/members.json`。生产环境建议把本地文件替换为数据库或后台 CMS。修改接口默认用于本地开发；在生产环境应设置 `ADMIN_API_TOKEN`：

```powershell
$env:ADMIN_API_TOKEN="请替换为高强度随机令牌"
```

调用示例：

```powershell
$headers = @{
  Authorization = "Bearer 请替换为高强度随机令牌"
  "Content-Type" = "application/json"
}
$body = @{
  name = "张三"
  major = "计算机科学与技术"

  position = "班长"
  avatar = "https://example.com/avatar.jpg"
} | ConvertTo-Json

Invoke-RestMethod -Method Put -Uri "http://localhost:3000/api/members/member-01" -Headers $headers -Body $body
```

## 目录说明

```text
.
├── index.html          # 页面结构
├── styles.css          # 响应式样式
├── script.js           # 标签切换、API 数据渲染、返回顶部
├── server.js           # 静态服务与同源 API
├── data/
│   ├── site.json       # 底部公示信息
│   ├── news.json       # 新闻备用数据
│   └── members.json    # 29 位成员占位资料
└── favicon.svg
```

如果部署为纯静态站点，HTML/CSS 可以正常展示，但需要另外部署 `server.js` 中的 API，并配置同源反向代理；微信 AppSecret 不能放置在浏览器代码中。

## 部署到 GitHub Pages

仓库已内置 `.github/workflows/deploy-pages.yml`，推送到 `master` 分支后会自动发布静态站点。

1. 打开 GitHub 仓库的 **Settings → Pages**。
2. 在 **Build and deployment** 的 **Source** 中选择 **GitHub Actions**。
3. 推送到 `master`，或在 **Actions** 中手动运行 **Deploy to GitHub Pages**。
4. 工作流完成后，通过 `https://<用户名>.github.io/<仓库名>/` 访问站点。
5. 如需自定义域名，可在 **Settings → Pages → Custom domain** 中设置。

### 静态托管说明

GitHub Pages 只提供静态文件，`server.js` 中的 API（微信公众号文章、成员资料写入等）不会运行。前端已支持自动回退：

- 页面数据依次尝试 `/api/...`，失败后读取 `data/` 目录下的静态 JSON（`site.json`、`news.json`、`members.json`）。
- 微信公众号文章无法在纯静态环境实时同步，将展示 `data/news.json` 中的示例新闻。
- 需要实时 API 时，请单独部署 `server.js`（Node 服务器或 Serverless），再把前端 API 地址改为同源地址。

更新成员资料或站点信息时，直接修改 `data/` 下的 JSON 并推送到 `master` 即可重新发布。
