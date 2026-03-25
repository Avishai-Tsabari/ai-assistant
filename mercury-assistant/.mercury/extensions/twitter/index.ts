export default function (mercury: {
  skill(relativePath: string): void;
  permission(opts: { defaultRoles: string[] }): void;
  on(event: string, handler: (event: any, ctx: any) => Promise<any>): void;
}) {
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.env({ from: "MERCURY_TWITTER_BEARER_TOKEN" });
  mercury.skill("./skill");

  mercury.on("before_container", async () => {
    return {
      systemPrompt: `## Fetching X/Twitter Posts

Use the official Twitter API v2 to get real-time posts from any public account. The bearer token is available as \`$TWITTER_BEARER_TOKEN\` in the container (set via \`MERCURY_TWITTER_BEARER_TOKEN\` in Mercury's .env).

### Get recent posts by username

\`\`\`bash
twitter_latest() {
  local username="\${1}"   # X handle without @
  local count="\${2:-3}"

  if [ -z "\${TWITTER_BEARER_TOKEN:-}" ]; then
    echo "TWITTER_BEARER_TOKEN is not set. Add MERCURY_TWITTER_BEARER_TOKEN to Mercury's .env file." >&2
    return 1
  fi

  # Step 1: resolve username → numeric user ID
  local user_resp
  user_resp=$(curl -sS "https://api.twitter.com/2/users/by/username/$username" \\
    -H "Authorization: Bearer $TWITTER_BEARER_TOKEN")
  local user_id
  user_id=$(echo "$user_resp" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -z "$user_id" ]; then
    echo "Error looking up @$username: $user_resp" >&2
    return 1
  fi

  # Step 2: fetch recent tweets
  curl -sS "https://api.twitter.com/2/users/$user_id/tweets?max_results=$count&tweet.fields=created_at,text&exclude=retweets,replies" \\
    -H "Authorization: Bearer $TWITTER_BEARER_TOKEN" \\
    | grep -o '"id":"[^"]*"\\|"text":"[^"]*"\\|"created_at":"[^"]*"' \\
    | paste - - - \\
    | awk -F'"' '{
        id=$4; text=$8; date=$12
        gsub(/T/, " ", date); gsub(/\\.000Z/, "", date)
        print NR". "text
        print "   "date"  https://x.com/'$username'/status/"id
        print ""
      }'
}
\`\`\`

**Usage:**
\`\`\`bash
twitter_latest elonmusk 3
twitter_latest realDonaldTrump 5
\`\`\`

**Finding the username:** If the user gives a display name, use Brave Search to find the handle:
\`\`\`bash
curl -sS "https://api.search.brave.com/res/v1/web/search?q=DISPLAY+NAME+site:x.com&count=3" \\
  -H "Accept: application/json" -H "X-Subscription-Token: $BRAVE_API_KEY" \\
  | grep -o '"url":"https://x.com/[^/"]*"' | grep -o '/[^/"]*"$' | tr -d '/"'
\`\`\``,
    };
  });
}
