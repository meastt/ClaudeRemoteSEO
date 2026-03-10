/**
 * gsc-fetch.js — Google Search Console data fetcher for TigerTribe
 *
 * Usage: node gsc-fetch.js [--rows 100] [--days 28]
 * Output: JSON { site, dateRange, rows: [{query, impressions, clicks, position}] }
 *
 * Auth: service account JSON inline via GSC_SERVICE_ACCOUNT_JSON env var
 */

import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SITE_URL = process.env.WP_TIGERTRIBE_NET_GSC_SITE_URL;
if (!SITE_URL) {
  throw new Error('Missing WP_TIGERTRIBE_NET_GSC_SITE_URL in .env');
}
if (!process.env.GSC_SERVICE_ACCOUNT_JSON) {
  throw new Error('Missing GSC_SERVICE_ACCOUNT_JSON in .env');
}
const serviceAccountKey = JSON.parse(
  process.env.GSC_SERVICE_ACCOUNT_JSON
    .replace(/\\\n/g, '\\n')   // format A: backslash + actual-newline → \n JSON escape
    .replace(/\\\\n/g, '\\n')  // format B: double-backslash+n → \n JSON escape
    .replace(/\\"/g, '"')      // \" → "
);

// Parse CLI args
const args = process.argv.slice(2);
const rowsArg = args.indexOf('--rows');
const daysArg = args.indexOf('--days');
const rowLimit = rowsArg !== -1 ? parseInt(args[rowsArg + 1], 10) : 100;
const daysBack = daysArg !== -1 ? parseInt(args[daysArg + 1], 10) : 28;

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchGSC() {
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const authClient = await auth.getClient();
  const webmasters = google.searchconsole({ version: 'v1', auth: authClient });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const dateRange = { startDate: isoDate(startDate), endDate: isoDate(endDate) };

  const res = await webmasters.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      dimensions: ['query'],
      rowLimit,
      dataState: 'all',
    },
  });

  const rows = (res.data.rows || []).map(r => ({
    query: r.keys[0],
    impressions: r.impressions,
    clicks: r.clicks,
    position: Math.round(r.position * 10) / 10,
  }));

  const output = { site: SITE_URL, dateRange, rows };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

fetchGSC().catch(err => {
  process.stderr.write(`gsc-fetch error: ${err.message}\n`);
  process.exit(1);
});
