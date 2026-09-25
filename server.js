'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(ROOT, 'data');
const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/script.js', 'script.js'],
  ['/favicon.svg', 'favicon.svg']
]);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};
const MEMBER_FIELDS = ['name', 'major', 'position', 'avatar'];
const MAX_BODY_SIZE = 256 * 1024;

let tokenCache = {
  value: '',
  expiresAt: 0
};

function sendJson(response, data, statusCode = 200) {
  const body = JSON.stringify(data);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function sendText(response, message, statusCode = 200) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(message);
}

async function readDataFile(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content.replace(/^\uFEFF/, ''));
}

async function writeDataFile(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        reject(new Error('请求内容过大'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function isAdminAuthorized(request) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    return true;
  }

  return request.headers.authorization === `Bearer ${expectedToken}`;
}

function sanitizeMember(member, source) {
  const sanitized = { ...member };
  for (const field of MEMBER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      sanitized[field] = String(source[field] ?? '').trim().slice(0, 240);
    }
  }
  return sanitized;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getWechatAccessToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt > now + 60000) {
    return tokenCache.value;
  }
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('未配置 WECHAT_APP_ID 或 WECHAT_APP_SECRET');
  }
  const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
  tokenUrl.searchParams.set('grant_type', 'client_credential');
  tokenUrl.searchParams.set('appid', appId);
  tokenUrl.searchParams.set('secret', appSecret);
  const response = await fetchWithTimeout(tokenUrl);
  const payload = await response.json();
  if (!response.ok || payload.errcode || !payload.access_token) {
    throw new Error(`微信 access_token 获取失败：${payload.errmsg || response.status}`);
  }
  tokenCache = {
    value: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 7200) * 1000
  };
  return tokenCache.value;
}
async function fetchWechatArticles(limit) {
  const accessToken = await getWechatAccessToken();
  const apiUrl = new URL('https://api.weixin.qq.com/cgi-bin/freepublish/batchget');
  apiUrl.searchParams.set('access_token', accessToken);
  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offset: 0,
      count: Math.min(Math.max(limit, 1), 20),
      no_content: 1
    })
  });
  const payload = await response.json();
  if (!response.ok || payload.errcode) {
    throw new Error(`微信公众号文章获取失败：${payload.errmsg || response.status}`);
  }
  const articles = [];
  for (const publication of payload.item || []) {
    for (const [index, article] of (publication.content?.news_item || []).entries()) {
      articles.push({
        id: `${publication.article_id || 'wechat'}-${index}`,
        title: article.title || '未命名文章',
        summary: article.digest || '',
        author: article.author || '微信公众号',
        publishedAt: publication.update_time
          ? new Date(publication.update_time * 1000).toISOString()
          : '',
        url: article.url || '',
        coverImage: article.thumb_url || ''
      });
    }
  }
  return articles.slice(0, limit);
}
async function handleApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, { ok: true, service: 'class-website' });
  }
  if (request.method === 'GET' && url.pathname === '/api/site') {
    return sendJson(response, await readDataFile('site.json'));
  }
  if (request.method === 'GET' && url.pathname === '/api/news') {
    return sendJson(response, await readDataFile('news.json'));
  }
  if (request.method === 'GET' && url.pathname === '/api/members') {
    return sendJson(response, await readDataFile('members.json'));
  }
  if (request.method === 'GET' && url.pathname === '/api/wechat/articles') {
    const requestedLimit = Number(url.searchParams.get('limit')) || 6;
    const limit = Math.min(Math.max(requestedLimit, 1), 20);
    if (!process.env.WECHAT_APP_ID || !process.env.WECHAT_APP_SECRET) {
      const fallback = await readDataFile('news.json');
      return sendJson(response, {
        ...fallback,
        source: 'sample',
        notice: '尚未配置微信公众号凭证，当前显示示例新闻。'
      });
    }
    try {
      const articles = await fetchWechatArticles(limit);
      return sendJson(response, {
        source: 'wechat',
        updatedAt: new Date().toISOString(),
        items: articles
      });
    } catch (error) {
      console.error(error);
      const fallback = await readDataFile('news.json');
      return sendJson(response, {
        ...fallback,
        source: 'sample-fallback',
        notice: '微信公众号接口暂不可用，当前显示示例新闻。'
      });
    }
  }
  if (request.method === 'PUT' && url.pathname.startsWith('/api/members/')) {
    if (!isAdminAuthorized(request)) {
      return sendJson(response, { ok: false, message: '无权修改成员信息' }, 401);
    }
    const memberId = decodeURIComponent(url.pathname.slice('/api/members/'.length));
    const body = await readRequestBody(request);
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      return sendJson(response, { ok: false, message: '请求内容不是有效 JSON' }, 400);
    }
    const memberData = await readDataFile('members.json');
    const memberIndex = memberData.members.findIndex((member) => member.id === memberId);
    if (memberIndex === -1) {
      return sendJson(response, { ok: false, message: '未找到该成员' }, 404);
    }
    memberData.members[memberIndex] = sanitizeMember(
      memberData.members[memberIndex],
      payload
    );
    memberData.updatedAt = new Date().toISOString();
    await writeDataFile('members.json', memberData);
    return sendJson(response, {
      ok: true,
      member: memberData.members[memberIndex]
    });
  }
  return sendJson(response, { ok: false, message: '接口不存在' }, 404);
}
async function handleStatic(request, response, url) {
  const relativePath = STATIC_FILES.get(url.pathname);
  if (!relativePath) {
    return sendText(response, 'Not found', 404);
  }
  const filePath = path.join(ROOT, relativePath);
  const extension = path.extname(filePath);
  try {
    const content = await fs.readFile(filePath);
    const headers = {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-cache'
    };
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    sendText(response, 'Not found', 404);
  }
}
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 'Method not allowed', 405);
      return;
    }
    await handleStatic(request, response, url);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, { ok: false, message: '服务器内部错误' }, 500);
    } else {
      response.end();
    }
  }
});
server.listen(PORT, () => {
  console.log(`班级网站已启动：http://localhost:${PORT}`);
});