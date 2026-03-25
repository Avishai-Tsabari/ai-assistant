---
name: twitter
description: Fetch the latest posts from any public X/Twitter account using the Twitter API v2 (requires MERCURY_TWITTER_BEARER_TOKEN).
metadata:
  short-description: Get real-time X/Twitter posts via Twitter API v2
---

# Twitter / X Post Fetching

Retrieve the latest posts from any public X/Twitter account using the official Twitter API v2. Requires `MERCURY_TWITTER_BEARER_TOKEN` set in Mercury's `.env`.

## Quick Reference

| Goal | Method |
|------|--------|
| Get latest posts by username | `twitter_latest USERNAME N` |
| Don't know the username? | Brave Search `DISPLAY_NAME site:x.com` |
| Token not set | Tell user to add `MERCURY_TWITTER_BEARER_TOKEN` to `.env` |

## How It Works

1. Resolves the username to a numeric user ID via `GET /2/users/by/username/{username}`
2. Fetches recent tweets via `GET /2/users/{id}/tweets`
3. Returns post text, date, and direct x.com link

## Examples

**"Get me the last 3 posts by Donald Trump"**
```bash
twitter_latest realDonaldTrump 3
```

**"What has Elon Musk posted recently?"**
```bash
twitter_latest elonmusk 5
```

## Token Cost

Two small API calls (~1KB each). Parsing and formatting 3 posts is ~200 tokens total.
