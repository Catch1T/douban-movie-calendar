const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const ics = require('ics');

const DOUBAN_LATER_URL = 'https://movie.douban.com/cinema/later/beijing/';

async function fetchComingMovies() {
  try {
    const { data: html } = await axios.get(DOUBAN_LATER_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://movie.douban.com/',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    const $ = cheerio.load(html);
    const movies = [];

    $('#showing-soon .item').each((_, el) => {
      const $el = $(el);
      const title = $el.find('.title a').text().trim();
      const url = $el.find('.title a').attr('href') || '';
      const dateStr = $el.find('.release-date').text().trim();
      const wishText = $el.find('.wish-count').text().trim();
      const wishCount = parseInt(wishText.replace(/[^\d]/g, ''), 10) || 0;

      if (!title || !dateStr) return;

      let year, month, day;

      // 匹配 "08月22日" 或 "2026年08月22日"
      const fullMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (fullMatch) {
        year = parseInt(fullMatch[1]);
        month = parseInt(fullMatch[2]);
        day = parseInt(fullMatch[3]);
      } else {
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

      if (!year || !month || !day) {
        console.warn(`⚠️ 无法解析日期: "${dateStr}" (${title})`);
        return;
      }

      movies.push({
        title,
        releaseDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        year, month, day,
        wishCount,
        url: url.startsWith('http') ? url : `https://movie.douban.com${url}`,
      });
    });

    console.log(`📥 共获取 ${movies.length} 部即将上映电影`);
    return movies;

  } catch (err) {
    console.error('❌ 请求豆瓣页面失败:', err.message);
    return [];
  }
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
