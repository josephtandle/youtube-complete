# YouTube Complete MCP Server

You're spending hours copying video IDs, switching tabs, checking analytics dashboards, and manually moderating comments. Your AI assistant should handle all of that.

**YouTube Complete** gives your AI assistant full control over your YouTube presence: search, analytics, playlist management, comment moderation, live streams, and more, all through a single MCP server.

---

## Tools

| Tool | Description | Auth Required |
|------|-------------|---------------|
| `search_videos` | Search YouTube by keyword, filter by duration/region/order | API Key |
| `get_video` | Get full video details including statistics and content info | API Key |
| `list_videos` | List trending videos or videos by chart/category | API Key |
| `update_video` | Update title, description, tags, privacy | OAuth |
| `delete_video` | Delete a video permanently | OAuth |
| `get_channel` | Get channel details by ID or username | API Key |
| `list_channel_videos` | List all uploads from a channel | API Key |
| `get_channel_analytics` | Get subscriber count, view count, video count | API Key |
| `create_playlist` | Create a new playlist | OAuth |
| `list_playlists` | List playlists for a channel or your account | API Key / OAuth |
| `add_to_playlist` | Add a video to a playlist | OAuth |
| `remove_from_playlist` | Remove a video from a playlist | OAuth |
| `list_comments` | List top-level comments on a video | API Key |
| `post_comment` | Post a comment on a video | OAuth |
| `delete_comment` | Delete a comment | OAuth |
| `moderate_comment` | Hold, publish, reject, or mark comment as spam | OAuth |
| `list_captions` | List available caption tracks for a video | OAuth |
| `download_caption` | Download captions in SRT, VTT, TTML, or SBV format | OAuth |
| `get_video_analytics` | Get views, likes, comments for a specific video | API Key |
| `get_channel_report` | Full channel statistics report | API Key |
| `get_audience_demographics` | Top videos by view count (audience interest proxy) | API Key |
| `create_live_stream` | Schedule a new live broadcast | OAuth |
| `get_live_broadcast` | Get details for a live broadcast | OAuth |
| `list_live_streams` | List your active/upcoming live streams | OAuth |

---

## Quick Start

### 1. Get your YouTube Data API v3 key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable **YouTube Data API v3**
3. Create an API key under Credentials

### 2. (Optional) Get an OAuth token for write operations

For uploading, posting comments, managing playlists, and live streams, you need an OAuth 2.0 token with the `https://www.googleapis.com/auth/youtube` scope.

### 3. Configure the MCP server

Set environment variables:

```
YOUTUBE_API_KEY=your_api_key_here
YOUTUBE_OAUTH_TOKEN=your_oauth_token_here  # optional, for write ops
```

### 4. Connect to your AI assistant

Add to your MCP client config:

```json
{
  "mcpServers": {
    "youtube-complete": {
      "url": "https://mcpize.com/mcp/youtube-complete"
    }
  }
}
```

---

## Example Prompts

- "Search for the top 10 TypeScript tutorial videos from the last month"
- "Get analytics for my last 5 videos and tell me which one performed best"
- "Add all videos tagged 'tutorial' to my Learning playlist"
- "Show me all comments on video X and delete any that contain spam keywords"
- "Schedule a live stream for next Friday at 6 PM UTC"

---

## Built with MCPize

This server was built and deployed using [MCPize](https://mcpize.com), the fastest way to turn any API into an MCP server.

Looking to build your own automations on top of YouTube or any other platform? The team behind this server also runs workshops at [mastermindshq.business](https://mastermindshq.business) covering AI automation, API integrations, and building with MCP.

---

## License

MIT
