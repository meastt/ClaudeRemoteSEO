import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DASHBOARD_JS_PATH = path.join(__dirname, 'dashboard-data.js');

async function fetchGscData() {
    try {
        const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
        const match = envContent.match(/GSC_SERVICE_ACCOUNT_JSON="(.*)"/);
        if (!match) throw new Error("GSC_SERVICE_ACCOUNT_JSON not found in .env");
        const rawJson = match[1].replace(/\\"/g, '"').replace(/\\\\n/g, '\\n');
        const creds = JSON.parse(rawJson);
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: creds.client_email,
                private_key: creds.private_key,
            },
            scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
        });

        const webmasters = google.webmasters({ version: 'v3', auth });

        // We want last 30 days
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 3); // GSC data is usually 2-3 days behind
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 29);

        const siteUrl = process.env.WP_TIGERTRIBE_NET_GSC_SITE_URL || 'https://tigertribe.net/';

        const res = await webmasters.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                dimensions: ['date'],
            },
        });

        // Top movers (last 7 days vs previous 7) -> simplify by just getting last 7 days queries and comparing to fake history or just sorting by impressions for now
        const moversRes = await webmasters.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                dimensions: ['query'],
                rowLimit: 10,
            },
        });

        const rows = res.data.rows || [];

        // Fill in missing dates
        const series = {
            labels: [],
            impressions: [],
            clicks: [],
            avgPosition: []
        };

        const rowMap = new Map();
        rows.forEach(r => rowMap.set(r.keys[0], r));

        let totalImps = 0;
        let totalClicks = 0;
        let sumPos = 0;

        for (let i = 0; i < 30; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];

            series.labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));

            if (rowMap.has(dateStr)) {
                const data = rowMap.get(dateStr);
                series.impressions.push(data.impressions);
                series.clicks.push(data.clicks);
                series.avgPosition.push(data.position);

                totalImps += data.impressions;
                totalClicks += data.clicks;
                sumPos += data.position;
            } else {
                series.impressions.push(0);
                series.clicks.push(0);
                series.avgPosition.push(100);
                sumPos += 100;
            }
        }

        const avgPos = rows.length ? (sumPos / 30).toFixed(1) : 0;

        const movers = (moversRes.data.rows || []).map(r => ({
            query: r.keys[0],
            position: r.position,
            delta: Math.random() > 0.5 ? 1.2 : -0.8, // Without 2 date ranges, mock delta for now
            direction: Math.random() > 0.5 ? 'up' : 'down'
        }));

        return { series, totalImps, avgPos, movers };
    } catch (err) {
        console.error('Error fetching GSC data:', err.message);
        return null;
    }
}

async function fetchWpData() {
    try {
        const url = process.env.WP_TIGERTRIBE_NET_URL + '/wp-json/wp/v2/posts?per_page=10&_embed';
        const auth = Buffer.from(`${process.env.WP_TIGERTRIBE_NET_USERNAME}:${process.env.WP_TIGERTRIBE_NET_PASSWORD}`).toString('base64');

        const res = await fetch(url, {
            headers: { 'Authorization': `Basic ${auth}` }
        });

        if (!res.ok) throw new Error(`WP API returned ${res.status}`);
        const posts = await res.json();

        return posts.map(p => {
            // Find time ago
            const date = new Date(p.date);
            const diffMs = new Date() - date;
            const diffHrs = Math.round(diffMs / (1000 * 60 * 60));
            let timeStr = `${diffHrs}h ago`;
            if (diffHrs > 24) timeStr = `${Math.round(diffHrs / 24)}d ago`;

            return {
                slug: '/' + p.slug + '/',
                action: 'updated',
                agent: 'Writer',
                time: timeStr,
                tokens: Math.floor(Math.random() * 5000) + 3000 // Mocking token usage since it's not in WP
            };
        });
    } catch (err) {
        console.error('Error fetching WP data:', err.message);
        return [];
    }
}

async function run() {
    console.log('Fetching live TigerTribe data...');
    const gscData = await fetchGscData();
    const wpData = await fetchWpData();

    // Assemble the payload
    // Using some placeholder Agent data where actual DB isn't available
    const payload = {
        kpis: [
            { label: 'Tokens Today', value: '18.4K', change: '+2%', direction: 'up' },
            { label: 'Monthly Spend', value: '$2.11', change: '-1%', direction: 'down' },
            { label: 'Posts Published', value: wpData.length.toString(), change: '+0', direction: 'up' },
            { label: 'Impressions (30d)', value: gscData ? gscData.totalImps.toLocaleString() : '0', change: '--', direction: 'up' },
            { label: 'Avg Position', value: gscData ? gscData.avgPos.toString() : '0', change: '--', direction: 'down' },
        ],
        tokenBurn: [
            { agent: 'Analyst', model: 'claude-sonnet-4', dotClass: 'analyst', inputTokens: 4200, outputTokens: 1100, cost: 0.28, barColor: 'var(--accent-blue)', barPercent: 30 },
            { agent: 'Writer', model: 'claude-sonnet-4', dotClass: 'writer', inputTokens: 12100, outputTokens: 4300, cost: 1.15, barColor: 'var(--accent-purple)', barPercent: 60 },
            { agent: 'Technician', model: 'gemini-1.5-flash', dotClass: 'technician', inputTokens: 2100, outputTokens: 800, cost: 0.01, barColor: 'var(--accent-green)', barPercent: 10 },
            { agent: 'Art Director', model: 'google-nano-banana-pro-2', dotClass: 'art', images: 14, cost: 0.12, barColor: 'var(--accent-orange)', barPercent: 5 }
        ],
        gsc: gscData ? gscData.series : null,
        movers: gscData ? gscData.movers : [],
        wpPublishes: wpData,
        health: {
            status: 200,
            ttfb: 1102,
            uptime: 99.8,
            lcp: 4.2,
            cls: 0.05,
            inp: 210,
        },
        costs: {
            analyst: 0.28,
            writer: 1.15,
            technician: 0.01,
            artDirector: 0.12,
            failover: 0,
            monthlyBudget: 25.0,
            monthlySpent: 2.11,
            costPerPost: 1.15,
            projectedMonthly: 14.50
        },
        activity: [
            { type: 'heartbeat', icon: '💓', text: 'HB-60-PING — site healthy, TTFB 1102ms', time: '12 min ago', agent: 'Technician' },
            { type: 'publish', icon: '✅', text: 'Daily cron: checked WP for updates', time: '1h ago', agent: 'Technician' }
        ]
    };

    const scriptContent = `window.dashboardData = ${JSON.stringify(payload, null, 2)};`;
    fs.writeFileSync(DASHBOARD_JS_PATH, scriptContent);
    console.log('✅ dashboard-data.js generated.');
}

run();
