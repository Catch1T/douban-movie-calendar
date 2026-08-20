const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const ics = require('ics');

// ✅ 新版即将上映页面地址
const DOUBAN_COMING_URL = 'https://movie.douban.com/coming';

async function fetchComingMovies() {
  try {
    const { data: html } = await axios.get(DOUBAN_COMING_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://movie.douban.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const $ = cheerio.load(html);
    const movies = [];

    // ✅ 新版页面使用 table 结构，尝试多种可能的选择器
    // 优先尝试 tbody tr（标准表格）
    let rows = $('table tbody tr');

    // 如果表格没匹配到，尝试其他可能的列表结构
    if (rows.length === 0) {
      rows = $('.list-item, .item, [class*="movie"], [class*="film"]');
    }

    // 如果仍然没匹配到，把整个 HTML 打印出来用于调试
    if (rows.length === 0) {
      console.warn('⚠️ 未匹配到任何电影元素，输出页面前2000字符用于调试：');
      console.warn(html.substring(0, 2000));
      return [];
    }

    rows.each((_, el) => {
      const $el = $(el);
      const cells = $el.find('td');

      // 表格模式：td[0]=日期, td[1]=片名, td[2]=类型, td[3]=国家, td[4]=想看
      if (cells.length >= 2) {
        const dateStr = $(cells[0]).text().trim();
        const titleEl = $(cells[1]).find('a').first();
        const title = titleEl.text().trim() || $(cells[1]).text().trim();
        const url = titleEl.attr('href') || '';
        const wishText = cells.length >= 5 ? $(cells[4]).text().trim() : '';
        const wishCount = parseInt(wishText.replace(/[^\d]/g, ''), 10) || 0;

        if (!title || !dateStr) return;

        const parsed = parseDate(dateStr);
        if (!parsed) {
          console.warn(`⚠️ 无法解析日期: "${dateStr}" (${title})`);
          return;
        }

        movies.push({
          title,
          releaseDate: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`,
          ...parsed,
          wishCount,
          url: url.startsWith('http') ? url : `https://movie.douban.com${url}`,
        });
      } else {
        // 非表格模式：尝试从文本中提取
        const text = $el.text().trim();
        const linkEl = $el.find('a').first();
        const title = linkEl.text().trim() || text.split(/\s+/)[1] || '';
        const url = linkEl.attr('href') || '';
        const dateMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
        const wishMatch = text.match(/(\d+)\s*人\s*想看/);

        if (!title || !dateMatch) return;

        const parsed = parseDate(`${dateMatch[1]}月${dateMatch[2]}日`);
        if (!parsed) return;

        movies.push({
          title,
          releaseDate: `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`,
          ...parsed,
          wishCount: wishMatch ? parseInt(wishMatch[1], 10) : 0,
          url: url.startsWith('http') ? url : `https://movie.douban.com${url}`,
        });
      }
    });

    console.log(`📥 共获取 ${movies.length} 部即将上映电影`);
    return movies;

  } catch (err) {
    console.error('❌ 请求豆瓣页面失败:', err.message);
    return [];
  }
}

function parseDate(dateStr) {
  let year, month, day;

  // 匹配 "2026年08月22日" 或 "2026-08-22"
  const fullMatch = dateStr.match(/(\d{4})[年\-](\d{1,2})[月\-](\d{1,2})/);
  if (fullMatch) {
    year = parseInt(fullMatch[1]);
    month = parseInt(fullMatch[2]);
    day = parseInt(fullMatch[3]);
  } else {
    // 匹配 "08月22日"
    const shortMatch = dateStr.match(/(\d{1,2})月(\d{1,2})日/);
    if (shortMatch) {
      const now = new Date();
      year = now.getFullYear();
      month = parseInt(shortMatch[1]);
      day = parseInt(shortMatch[2]);
      if (month < now.getMonth() + 1) {
        year += 1;
      }
    }
  }

  if (!year || !month || !day) return null;
  return { year, month, day };
}

function generateICS(movies) {
  const events = movies.map(m => ({
    title: `🎬 ${m.title} 上映`,
    start: [m.year, m.month, m.day],
    duration: { hours: 2 },
    description: [
      `想看: ${m.wishCount}人`,
      `豆瓣链接: ${m.url}`
    ].join('\n'),
    url: m.url,
    alarms: [{ action: 'display', trigger: { hours: 1, before: true } }],
  }));

  const { error, value } = ics.createEvents(events);
  if (error) throw new Error(`ICS生成失败: ${error.message}`);
  return value;
}

async function main() {
  const movies = await fetchComingMovies();

  if (movies.length === 0) {
    console.warn('⚠️ 没有已定档电影，跳过生成');
    process.exit(0);
  }

  const icsContent = generateICS(movies);
  const outputDir = path.join(__dirname, 'calendar');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'douban-upcoming.ics');
  fs.writeFileSync(outputPath, icsContent);
  console.log(`✅ ICS已生成: ${outputPath} (${movies.length}部电影)`);
}

main().catch(err => {
  console.error('❌ 执行失败:', err.message);
  process.exit(1);
});
