#!/usr/bin/env node
import { fetchPost, fetchCurrentUser, updatePost, fetchAllPosts } from './wp-client.js';

async function run() {
  console.log('=== TigerTribe WP Auth Test ===\n');

  // Test 1: Authenticated GET with context=edit
  console.log('1. Testing authenticated GET (context=edit)...');
  try {
    const posts = await fetchAllPosts({ query: { per_page: '1' }, perPage: 1 });
    if (posts.length === 0) {
      console.log('   WARNING: No posts returned. Site may be empty.');
    } else {
      const post = posts[0];
      console.log(`   OK — Post #${post.id}: "${post.title.raw}"`);
      console.log(`   Content length: ${post.content.raw.length} chars`);
    }
  } catch (err) {
    console.error(`   FAIL — ${err.message}`);
    process.exit(1);
  }

  // Test 2: GET /users/me to verify capabilities
  console.log('\n2. Testing GET /users/me...');
  try {
    const user = await fetchCurrentUser();
    console.log(`   OK — Logged in as: ${user.name} (ID: ${user.id})`);
    console.log(`   Roles: ${user.roles.join(', ')}`);
    const caps = user.capabilities || {};
    const canEdit = caps.edit_posts || false;
    const canPublish = caps.publish_posts || false;
    console.log(`   edit_posts: ${canEdit}, publish_posts: ${canPublish}`);
    if (!canEdit) {
      console.error('   WARNING: User cannot edit posts!');
    }
  } catch (err) {
    console.error(`   FAIL — ${err.message}`);
    process.exit(1);
  }

  // Test 3: No-op PUT to confirm write access
  console.log('\n3. Testing no-op PUT (write access)...');
  try {
    const posts = await fetchAllPosts({ query: { per_page: '1' }, perPage: 1 });
    if (posts.length === 0) {
      console.log('   SKIP — No posts to test with.');
    } else {
      const post = posts[0];
      // PUT with identical title — effectively a no-op
      const result = await updatePost(post.id, { title: post.title.raw });
      console.log(`   OK — PUT succeeded on post #${result.id}`);
    }
  } catch (err) {
    console.error(`   FAIL — ${err.message}`);
    process.exit(1);
  }

  console.log('\n=== All auth tests passed ===');
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
