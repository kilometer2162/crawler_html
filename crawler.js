import { CheerioCrawler } from 'crawlee';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取命令行参数
const args = process.argv.slice(2);
const defaultUrl = 'https://www.baidu.com';
let startUrl;

// 判空检查
if (args.length === 0) {
  console.log(`未提供 URL，使用默认 URL: ${defaultUrl}`);
  startUrl = defaultUrl;
} else {
  startUrl = args[0];
}

// 验证 URL 并提取域名
let baseDomain;
try {
  const urlObj = new URL(startUrl);
  baseDomain = urlObj.hostname; // e.g., "example.com"
} catch (err) {
  console.error(`错误: 无效的 URL "${startUrl}"。请提供有效的 URL，例如 https://example.com`);
  console.error(`示例: node crawler.js https://example.com`);
  process.exit(1);
}

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 定义保存目录
const outputDir = path.join(__dirname, 'output');
const htmlDir = path.join(outputDir, './');
const jsDir = path.join(outputDir, 'js');
const cssDir = path.join(outputDir, 'css');
const imgDir = path.join(outputDir, 'img');

// 提取干净的文件名，防止中文转义
function getCleanFileName(url) {
  try {
    const parsedUrl = new URL(url, startUrl);
    // 提取 pathname 并解码 URL 编码（如 %E8%83%8C%E6%99%AF 转为 背景）
    const decodedPath = decodeURIComponent(parsedUrl.pathname);
    // 获取文件名
    let fileName = path.basename(decodedPath);
    // 如果文件名为空或无效，使用时间戳
    if (!fileName || fileName === '.') {
      fileName = `file-${Date.now()}`;
    }
    return fileName;
  } catch (err) {
    // 如果 URL 无效，手动处理并解码
    const decodedUrl = decodeURIComponent(url.split('?')[0]);
    let fileName = path.basename(decodedUrl);
    if (!fileName || fileName === '.') {
      fileName = `file-${Date.now()}`;
    }
    return fileName;
  }
}

// 提取 style 中的 url() 资源
function extractUrlsFromStyle(styleText, baseUrl) {
  const urls = [];
  // 匹配 url()，支持单引号、双引号或无引号
  const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
  let match;
  while ((match = urlRegex.exec(styleText)) !== null) {
    const relativeUrl = match[1].trim();
    try {
      const absoluteUrl = new URL(relativeUrl, baseUrl).href;
      urls.push(absoluteUrl);
    } catch (err) {
      console.warn(`无效的 URL: ${relativeUrl} 在 ${baseUrl}`);
    }
  }
  return urls;
}

// 创建目录
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    console.error(`创建目录 ${dir} 失败:`, err);
  }
}

// 初始化目录
await Promise.all([
  ensureDir(htmlDir),
  ensureDir(jsDir),
  ensureDir(cssDir),
  ensureDir(imgDir),
]);

// 创建爬虫
const crawler = new CheerioCrawler({
  maxRequestsPerCrawl: 500, // 限制爬取的请求数
  // 自定义允许的 Content-Type
  additionalMimeTypes: [
    'application/javascript', // 允许 JS 文件
    'text/javascript',
    'text/css', // 允许 CSS 文件
    'image/jpeg', // 允许图片
    'image/png',
    'image/gif',
    'image/webp'
  ],
  async requestHandler({ request, response, body, $ }) {
    console.log(`正在处理: ${request.url}`);

    // 处理 HTML
    if (request.url.match(/\.(html|htm)$/) || request.label === 'html' || response.headers['content-type']?.includes('text/html')) {
      try {
        const fileName = getCleanFileName(request.url) || `page-${Date.now()}.html`;
        const filePath = path.join(htmlDir, fileName);
        await fs.writeFile(filePath, body);
        console.log(`保存 HTML: ${filePath}`);
      } catch (err) {
        console.error(`save HTML error: ${err}`);
      }

    }

    // 处理 JavaScript
    if (request.url.match(/\.js(\?.*)?$/) || response.headers['content-type']?.includes('javascript')) {
      const fileName = getCleanFileName(request.url) || `script-${Date.now()}.js`;
      const filePath = path.join(jsDir, fileName);
      await fs.writeFile(filePath, body);
      console.log(`保存 JS: ${filePath}`);
    }

    // 处理 CSS
    if (request.url.match(/\.(css|scss)(\?.*)?$/) || response.headers['content-type']?.includes('css')) {
      const fileName = getCleanFileName(request.url) || `script-${Date.now()}.js`;
      const filePath = path.join(cssDir, fileName);
      await fs.writeFile(filePath, body);
      console.log(`保存 CSS: ${filePath}`);

      // 提取 CSS 中的 url() 资源
      const cssUrls = extractUrlsFromStyle(body.toString(), request.url);
      for (const url of cssUrls) {
        crawler.addRequests([{ url, label: 'image' }]);
      }
    }

    // 处理图片
    if (
      request.url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/) ||
      response.headers['content-type']?.includes('image')
    ) {
      const fileName = getCleanFileName(request.url) || `script-${Date.now()}.js`;
      const filePath = path.join(imgDir, fileName);
      // 确保 body 是 Buffer
      if (Buffer.isBuffer(body)) {
        await fs.writeFile(filePath, body);
        console.log(`保存图片: ${filePath}`);
      } else {
        console.warn(`跳过图片 ${request.url}: 响应不是二进制数据`);
      }
    }

    // 提取 HTML 中的资源链接
    if ($) {
      // 提取 JS 文件
      $('script[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          const url = new URL(src, request.url).href;
          crawler.addRequests([{ url, label: 'js' }]);
        }
      });

      // 提取 CSS 文件
      $('link[rel="stylesheet"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          const url = new URL(href, request.url).href;
          crawler.addRequests([{ url, label: 'css' }]);
        }
      });

      // 提取图片
      $('img[src]').each((i, el) => {
        const src = $(el).attr('src');
        if (src) {
          const url = new URL(src, request.url).href;
          crawler.addRequests([{ url, label: 'image' }]);
        }
      });

      // 提取 <style> 标签中的 url()
      $('style').each((i, el) => {
        const styleText = $(el).html();
        if (styleText) {
          const styleUrls = extractUrlsFromStyle(styleText, request.url);
          for (const url of styleUrls) {
            crawler.addRequests([{ url, label: 'image' }]);
          }
        }
      });

      // 提取内联 style 属性中的 url()
      $('[style]').each((i, el) => {
        const styleText = $(el).attr('style');
        if (styleText) {
          const styleUrls = extractUrlsFromStyle(styleText, request.url);
          for (const url of styleUrls) {
            crawler.addRequests([{ url, label: 'image' }]);
          }
        }
      });

      // 提取本地 HTML 文件（<a> 标签）
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href) {
          const decodedHref = decodeURIComponent(href);
          try {
            const urlObj = new URL(decodedHref, request.url);
            const url = urlObj.href;

            // 检查是否为本地 HTML 文件（同一域名，且以 .html 或 .htm 结尾）
            if (urlObj.hostname === baseDomain) {
              // 宽松匹配 HTML 文件
              if (url.match(/\.(html|htm)(\?.*)?$/) || decodedHref.includes('.html') || decodedHref.includes('.htm')) {
                crawler.addRequests([{ url, label: 'html' }]);
                console.log(`添加 HTML 链接: ${url}`);
              } else {
                console.log(`跳过非本地 HTML 链接: ${url} `);
              }
            }
          } catch (err) {
            console.warn(`跳过无效 HTML URL: ${decodedHref}`);
          }
        }
      });


    }
  },
  failedRequestHandler({ request, error }) {
    console.error(`请求失败 ${request.url}: ${error.message}`);
  },
});

// 启动爬虫
await crawler.run([
  {
    url: startUrl, // 使用你提供的网站
    label: 'html',
  },
]);

console.log('爬取完成！');