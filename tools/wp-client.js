import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const WP_URL = process.env.WP_TIGERTRIBE_NET_URL;
const WP_USER = process.env.WP_TIGERTRIBE_NET_USERNAME;
const WP_PASS = process.env.WP_TIGERTRIBE_NET_PASSWORD;

if (!WP_URL || !WP_USER || !WP_PASS) {
  throw new Error('Missing WP_TIGERTRIBE_NET_URL, WP_TIGERTRIBE_NET_USERNAME, or WP_TIGERTRIBE_NET_PASSWORD in .env');
}

const AUTH_HEADER = `Basic ${Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64')}`;
const API_BASE = `${WP_URL}/wp-json/wp/v2`;

async function wpFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': AUTH_HEADER,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WP API ${res.status} ${res.statusText}: ${url}\n${body}`);
  }
  return { data: await res.json(), headers: res.headers };
}

/**
 * Fetch all posts with pagination. Uses context=edit for raw content.
 */
export async function fetchAllPosts(params = {}) {
  const allPosts = [];
  let page = 1;
  const perPage = params.perPage || 100;

  while (true) {
    const query = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      context: 'edit',
      status: 'publish',
      ...params.query,
    });

    const { data, headers } = await wpFetch(`/posts?${query}`);
    allPosts.push(...data);

    const totalPages = parseInt(headers.get('x-wp-totalpages') || '1', 10);
    if (page >= totalPages) break;
    page++;
  }

  return allPosts;
}

/**
 * Fetch a single post by ID with context=edit.
 */
export async function fetchPost(id) {
  const { data } = await wpFetch(`/posts/${id}?context=edit`);
  return data;
}

/**
 * Update a post's content.
 */
export async function updatePost(id, fields) {
  const { data } = await wpFetch(`/posts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
  return data;
}

/**
 * Check if a post respects the 21-day maturation rule.
 * Returns { eligible, daysSinceUpdate, modifiedDate }.
 */
export function check21DayRule(modifiedDateStr) {
  const modified = new Date(modifiedDateStr);
  const now = new Date();
  const diffMs = now - modified;
  const daysSinceUpdate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return {
    eligible: daysSinceUpdate >= 21,
    daysSinceUpdate,
    modifiedDate: modified.toISOString(),
  };
}

/**
 * Verify current user capabilities (GET /users/me).
 */
export async function fetchCurrentUser() {
  const { data } = await wpFetch('/users/me?context=edit');
  return data;
}

export { wpFetch, API_BASE, WP_URL };
