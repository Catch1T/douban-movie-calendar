const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ics = require('ics');

const DOUBAN_API = 'https://movie.douban.com/j/search_subjects';

async function fetchComingMovies() {
  const allMovies = [];
  let pageStart = 0;
  const pageLimit = 50;

  while (true) {
    const { data } = await axios.get(DOUBAN_API, {
      params: {
        type: 'movie',
        tag: '即将上映',
        sort: 'recommend',
        page_limit: pageLimit,
        page_start: pageStart,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com/cinema/later/beijing/',
      },
    });

    const subjects = data.subjects || [];
    if (subjects.length === 0) break;
    allMovies.push(...subjects);
    pageStart += pageLimit;
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`📥 共获取 ${allMovies.length} 部即将上映电影`);
  return allMovies.filter(m => m.release_date).map(m => ({
    title: m.title,
    releaseDate: m.release_date,
    wishCount: m.wish_count,
    rating: m.rate ? `${m.rate}分` : '暂无评分',
    url: m.url,
  }));
}

function generateICS(movies) {
  const events = movies.map(m => {
    const [year, month, day] = m.releaseDate.split('-').map(Number);
    return {
      title: `🎬 ${m.title} 上映`,
      start: [year, month, day],
      duration: { hours: 2 },
      description: [`想看: ${m.wishCount}人`, `评分: ${m.rating}`, `豆瓣链接: ${m.url}`].join('\n'),
      url: m.url,
      alarms: [{ action: 'display', trigger: { hours: 1, before: true } }],
    };
  });

  const { error, value } = ics.createEvents(events);
  if (error) throw new Error(`ICS生成失败: ${error.message}`);
  return value;
}

async function main() {
  const movies = await fetchComingMovies();
  if (movies.length === 0) {
    console.warn('⚠️ 没有已定档电影，跳过生成');
    return;
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
