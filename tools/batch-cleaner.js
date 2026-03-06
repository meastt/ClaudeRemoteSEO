#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllPosts, fetchPost, updatePost, check21DayRule } from './wp-client.js';
import { scanContent, stripBoilerplate, identifyBoilerplateBlock } from './slop-detector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.join(__dirname, 'backups');
const AUDIT_DIR = path.join(__dirname, 'audit-logs');

// Parse CLI flags
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const postIdFilter = parseInt(args.find(a => a.startsWith('--post-id='))?.split('=')[1] || '0', 10);
const delay = parseInt(args.find(a => a.startsWith('--delay='))?.split('=')[1] || '1000', 10);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log(`=== TigerTribe Batch Cleaner ===`);
  console.log(`Mode: ${execute ? '🔴 EXECUTE (live writes)' : '🟢 DRY RUN (no changes)'}`);
  if (limit) console.log(`Limit: ${limit} posts`);
  if (postIdFilter) console.log(`Filtering: post #${postIdFilter} only`);
  console.log('');

  // Fetch posts
  let posts;
  if (postIdFilter) {
    const post = await fetchPost(postIdFilter);
    posts = [post];
  } else {
    console.log('Fetching all published posts...');
    posts = await fetchAllPosts();
  }
  console.log(`Found ${posts.length} posts.\n`);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(AUDIT_DIR, { recursive: true });

  const log = [];
  let processed = 0;
  let cleaned = 0;
  let skipped21Day = 0;
  let skippedClean = 0;

  for (const post of posts) {
    if (limit && processed >= limit) break;

    const html = post.content?.raw || post.content?.rendered || '';
    const scan = scanContent(html);

    if (scan.verdict === 'CLEAN') {
      skippedClean++;
      continue;
    }

    processed++;
    const title = post.title?.raw || post.title?.rendered || '';
    console.log(`--- Post #${post.id}: ${title}`);
    console.log(`    Score: ${scan.score} (${scan.verdict})`);

    // 21-day rule check
    const maturation = check21DayRule(post.modified || post.modified_gmt);
    if (!maturation.eligible) {
      console.log(`    SKIPPED — 21-day rule: only ${maturation.daysSinceUpdate} days since last edit`);
      skipped21Day++;
      log.push({ id: post.id, slug: post.slug, action: 'skipped_21day', daysSinceUpdate: maturation.daysSinceUpdate });
      continue;
    }

    // Identify and strip boilerplate
    const detection = identifyBoilerplateBlock(html);
    if (!detection.found) {
      console.log(`    No structural boilerplate block found (violations are inline). Manual review recommended.`);
      log.push({ id: post.id, slug: post.slug, action: 'manual_review', score: scan.score });
      continue;
    }

    const cleanedHtml = detection.cleanContent;
    const removedLength = detection.removedContent.length;
    const originalLength = html.length;
    const reduction = ((removedLength / originalLength) * 100).toFixed(1);

    console.log(`    Removing ${removedLength} chars (${reduction}% of content)`);

    // Re-scan cleaned content to verify
    const postCleanScan = scanContent(cleanedHtml);
    console.log(`    Post-clean score: ${postCleanScan.score} (${postCleanScan.verdict})`);

    // Backup original
    const backupPath = path.join(BACKUP_DIR, `${post.id}.json`);
    const backup = {
      id: post.id,
      slug: post.slug,
      title: title,
      modified: post.modified,
      originalContent: html,
      originalScore: scan.score,
      backupDate: new Date().toISOString(),
    };
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`    Backup saved: ${backupPath}`);

    if (execute) {
      try {
        await updatePost(post.id, { content: cleanedHtml });
        console.log(`    ✅ UPDATED on WordPress`);
        cleaned++;
        log.push({
          id: post.id,
          slug: post.slug,
          action: 'cleaned',
          originalScore: scan.score,
          newScore: postCleanScan.score,
          charsRemoved: removedLength,
          reduction: `${reduction}%`,
        });
      } catch (err) {
        console.error(`    ❌ FAILED: ${err.message}`);
        log.push({ id: post.id, slug: post.slug, action: 'error', error: err.message });
      }
      await sleep(delay);
    } else {
      console.log(`    [DRY RUN] Would update post #${post.id}`);
      log.push({
        id: post.id,
        slug: post.slug,
        action: 'dry_run',
        originalScore: scan.score,
        newScore: postCleanScan.score,
        charsRemoved: removedLength,
        reduction: `${reduction}%`,
      });
    }
    console.log('');
  }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Posts scanned:      ${posts.length}`);
  console.log(`Already clean:      ${skippedClean}`);
  console.log(`Infected processed: ${processed}`);
  console.log(`Skipped (21-day):   ${skipped21Day}`);
  if (execute) {
    console.log(`Successfully cleaned: ${cleaned}`);
  }

  // Save audit log
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(AUDIT_DIR, `batch-${execute ? 'execute' : 'dryrun'}-${timestamp}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), mode: execute ? 'execute' : 'dry_run', log }, null, 2));
  console.log(`\nAudit log: ${logPath}`);
}

run().catch(err => {
  console.error('Batch cleaner error:', err.message);
  process.exit(1);
});
