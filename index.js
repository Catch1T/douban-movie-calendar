const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ics = require('ics');

const DOUBAN_API = 'https://movie.douban.com/j/cinema/later/beijing/';

async function fetchComingMovies() {
  try {
    const { data } = await axios.get(DOUBAN_API, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com/cinema/later/beijing/',
      },
    });

    const subjects = data.subjects || [];
    console.log(`📥 共获取 ${subjects.length} 部即将上映电影`);

    return subjects
      .filter(m => m.release_date)
      .map(m => {
        let year, month, day;
        const dateStr = m.release_date;

        const fullMatch = dateStr.match(/(\d{4})[年\-](\d{1,2})[月\-](\d{1,2})/);
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
          console.warn(`⚠️ 无法解析日期: "${dateStr}" (${m.title})`);
          return null;
        }

        return {
          title: m.title,
          releaseDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          year, month, day,
          wishCount: m.wish || 0,
          rating: m.rate ? `${m.rate}分` : '暂无评分',
          url: m.url || `https://movie.douban.com/subject/${m.id}/`,
        };
      })
      .filter(m => m !== null);

  } catch (err) {
    console.error('❌ 请求豆瓣API失败:', err.message);
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
      `评分: ${m.rating}`,
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
