import fs from 'node:fs/promises';
import path from 'path';

async function updateStatsCache() {
  try {
    const contactEmail = process.env.PUBLIC_EXILE_CONTACT_EMAIL;

    if (!contactEmail) {
      throw new Error('PUBLIC_EXILE_CONTACT_EMAIL is required');
    }

    const response = await fetch('https://www.pathofexile.com/api/trade2/data/stats', {
      headers: {
        'User-Agent': `OAuth oriath-scales/1.0.0 (contact: ${contactEmail})`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const cache = {
      lastUpdated: new Date().toISOString(),
      data
    };

    const cachePath = path.join(
      process.cwd(),
      'src',
      'lib',
      'server',
      'cache',
      'stats.json'
    );
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
    console.log('Stats cache updated successfully');
  } catch (error) {
    console.error('Failed to update stats cache:', error);
    process.exit(1);
  }
}

updateStatsCache();
