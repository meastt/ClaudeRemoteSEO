#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllPosts } from './wp-client.js';
import { scanContent } from './slop-detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = path.join(__dirname, 'audit-logs');

// Parse CLI flags
const args = process.argv.slice(2);
const minScore = parseInt(args.find(a => a.startsWith('--min-score='))?.split('=')[1] || '0', 10);
const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'table';

async function run() {
  console.log('Fetching all published posts (context=edit)...\n');

  const posts = await fetchAllPosts();
  console.log(`Found ${posts.length} posts. Scanning...\n`);

  const results = [];

  for (const post of posts) {
    const html = post.content?.raw || post.content?.rendered || '';
    const scan = scanContent(html);

    if (scan.score >= minScore) {
      results.push({
        id: post.id,
        slug: post.slug,
        title: post.title?.raw || post.title?.rendered || '',
        score: scan.score,
        verdict: scan.verdict,
        violations: scan.violations,
        modified: post.modified,
        contentLength: html.length,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Summary
  const blocked = results.filter(r => r.verdict === 'BLOCK').length;
  const warned = results.filter(r => r.verdict === 'WARN').length;
  const clean = posts.length - blocked - warned;

  console.log(`=== Scan Summary ===`);
  console.log(`Total posts:  ${posts.length}`);
  console.log(`BLOCK (≥10):  ${blocked}`);
  console.log(`WARN (≥3):    ${warned}`);
  console.log(`CLEAN (<3):   ${clean}\n`);

  if (format === 'table') {
    // Console table
    console.log('ID     | Score | Verdict | Title');
    console.log('-------|-------|---------|------');
    for (const r of results) {
      if (r.score > 0) {
        const title = r.title.length > 50 ? r.title.substring(0, 47) + '...' : r.title;
        console.log(
          `${String(r.id).padEnd(6)} | ${String(r.score).padEnd(5)} | ${r.verdict.padEnd(7)} | ${title}`
        );
      }
    }
  } else {
    console.log(JSON.stringify(results, null, 2));
  }

  // Save JSON report
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(AUDIT_DIR, `scan-${timestamp}.json`);
  const report = {
    scanDate: new Date().toISOString(),
    totalPosts: posts.length,
    summary: { blocked, warned, clean },
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

run().catch(err => {
  console.error('Scanner error:', err.message);
  process.exit(1);
});
