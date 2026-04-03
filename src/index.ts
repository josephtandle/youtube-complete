// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import fetch from "node-fetch";
import { z } from "zod";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_OAUTH_TOKEN = process.env.YOUTUBE_OAUTH_TOKEN;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

if (!YOUTUBE_API_KEY) {
  console.warn("WARNING: YOUTUBE_API_KEY not set — tools will return errors until configured");
}

function apiHeaders(oauth = false) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (oauth && YOUTUBE_OAUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${YOUTUBE_OAUTH_TOKEN}`;
  }
  return headers;
}

async function ytFetch(path: string, params: Record<string, any> = {}, opts: any = {}) {
  if (!YOUTUBE_API_KEY) throw new Error("YOUTUBE_API_KEY is not configured. Set it in your MCPize server environment.");
  const url = new URL(`${BASE_URL}${path}`);
  params.key = YOUTUBE_API_KEY;
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers: apiHeaders(opts.oauth),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`YouTube API error ${res.status}: ${JSON.stringify((data as any).error?.message || data)}`);
  }
  return data;
}

const server = new McpServer({
  name: "youtube-complete",
  version: "1.0.0",
});

// --- VIDEOS ---

server.tool(
  "search_videos",
  "Search YouTube videos by keyword. Example: search_videos({ query: 'typescript tutorial', maxResults: 10 })",
  {
    query: z.string().describe("Search query, e.g. 'typescript tutorial 2024'"),
    maxResults: z.number().min(1).max(50).optional().default(10).describe("Number of results (1-50)"),
    order: z.enum(["relevance", "date", "rating", "viewCount", "title"]).optional().default("relevance").describe("Sort order"),
    type: z.enum(["video", "channel", "playlist"]).optional().default("video").describe("Result type filter"),
    pageToken: z.string().optional().describe("Pagination token from previous response"),
    regionCode: z.string().optional().describe("ISO 3166-1 alpha-2 country code, e.g. 'US'"),
    language: z.string().optional().describe("BCP-47 language code, e.g. 'en'"),
    videoDuration: z.enum(["any", "long", "medium", "short"]).optional().describe("Filter by duration"),
  },
  async ({ query, maxResults, order, type, pageToken, regionCode, language, videoDuration }) => {
    const data = await ytFetch("/search", {
      part: "snippet",
      q: query,
      maxResults,
      order,
      type,
      pageToken,
      regionCode,
      relevanceLanguage: language,
      videoDuration,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_video",
  "Get full details for a YouTube video by ID. Example: get_video({ videoId: 'dQw4w9WgXcQ' })",
  {
    videoId: z.string().describe("YouTube video ID, e.g. 'dQw4w9WgXcQ'"),
    parts: z.array(z.string()).optional().default(["snippet", "statistics", "contentDetails", "status"]).describe("Resource parts to include"),
  },
  async ({ videoId, parts }) => {
    const data = await ytFetch("/videos", { part: parts.join(","), id: videoId });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_videos",
  "List videos by chart or filter. Example: list_videos({ chart: 'mostPopular', regionCode: 'US', maxResults: 25 })",
  {
    chart: z.enum(["mostPopular"]).optional().describe("Chart type to retrieve"),
    myRating: z.enum(["like", "dislike"]).optional().describe("Filter by user rating (requires OAuth)"),
    maxResults: z.number().min(1).max(50).optional().default(25),
    pageToken: z.string().optional(),
    regionCode: z.string().optional().describe("ISO 3166-1 alpha-2 country code"),
    videoCategoryId: z.string().optional().describe("YouTube video category ID"),
  },
  async ({ chart, myRating, maxResults, pageToken, regionCode, videoCategoryId }) => {
    const data = await ytFetch("/videos", {
      part: "snippet,statistics,contentDetails",
      chart,
      myRating,
      maxResults,
      pageToken,
      regionCode,
      videoCategoryId,
    }, { oauth: !!myRating });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_video",
  "Update video metadata (title, description, tags, category). Requires OAuth token. Example: update_video({ videoId: 'abc123', title: 'New Title', description: 'Updated desc' })",
  {
    videoId: z.string().describe("Video ID to update"),
    title: z.string().optional().describe("New video title"),
    description: z.string().optional().describe("New video description"),
    tags: z.array(z.string()).optional().describe("List of tags"),
    categoryId: z.string().optional().describe("YouTube category ID (e.g. '22' for People & Blogs)"),
    privacyStatus: z.enum(["public", "private", "unlisted"]).optional().describe("Video privacy setting"),
  },
  async ({ videoId, title, description, tags, categoryId, privacyStatus }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for update_video");
    const snippet: any = {};
    if (title) snippet.title = title;
    if (description) snippet.description = description;
    if (tags) snippet.tags = tags;
    if (categoryId) snippet.categoryId = categoryId;

    const body: any = { id: videoId };
    if (Object.keys(snippet).length) body.snippet = snippet;
    if (privacyStatus) body.status = { privacyStatus };

    const parts = [];
    if (Object.keys(snippet).length) parts.push("snippet");
    if (privacyStatus) parts.push("status");

    const data = await ytFetch("/videos", { part: parts.join(",") }, {
      method: "PUT",
      oauth: true,
      body,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_video",
  "Delete a YouTube video. Requires OAuth token. Example: delete_video({ videoId: 'abc123' })",
  {
    videoId: z.string().describe("YouTube video ID to delete"),
  },
  async ({ videoId }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for delete_video");
    const url = new URL(`${BASE_URL}/videos`);
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", YOUTUBE_API_KEY!);
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: apiHeaders(true),
    });
    if (res.status === 204) return { content: [{ type: "text", text: JSON.stringify({ success: true, videoId }) }] };
    const data = await res.json();
    throw new Error(`Delete failed: ${JSON.stringify(data)}`);
  }
);

// --- CHANNELS ---

server.tool(
  "get_channel",
  "Get details for a YouTube channel. Example: get_channel({ channelId: 'UCxxxxxx' }) or get_channel({ username: 'MrBeast' })",
  {
    channelId: z.string().optional().describe("YouTube channel ID, e.g. 'UCxxxxxx'"),
    username: z.string().optional().describe("YouTube username/handle, e.g. 'MrBeast'"),
    mine: z.boolean().optional().describe("Get authenticated user's own channel (requires OAuth)"),
  },
  async ({ channelId, username, mine }) => {
    if (!channelId && !username && !mine) throw new Error("Provide channelId, username, or mine=true");
    const data = await ytFetch("/channels", {
      part: "snippet,statistics,contentDetails,brandingSettings",
      id: channelId,
      forUsername: username,
      mine: mine ? "true" : undefined,
    }, { oauth: !!mine });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_channel_videos",
  "List all videos from a channel's uploads playlist. Example: list_channel_videos({ channelId: 'UCxxxxxx', maxResults: 20 })",
  {
    channelId: z.string().describe("YouTube channel ID"),
    maxResults: z.number().min(1).max(50).optional().default(20),
    pageToken: z.string().optional().describe("Pagination token"),
    order: z.enum(["date", "relevance", "rating", "viewCount", "title"]).optional().default("date"),
  },
  async ({ channelId, maxResults, pageToken, order }) => {
    // First get the uploads playlist ID
    const channelData: any = await ytFetch("/channels", {
      part: "contentDetails",
      id: channelId,
    });
    const uploadsPlaylistId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) throw new Error(`No uploads playlist found for channel: ${channelId}`);

    const data = await ytFetch("/playlistItems", {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults,
      pageToken,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_channel_analytics",
  "Get analytics summary for a channel (views, subscribers, videos). Example: get_channel_analytics({ channelId: 'UCxxxxxx' })",
  {
    channelId: z.string().describe("YouTube channel ID"),
  },
  async ({ channelId }) => {
    const data: any = await ytFetch("/channels", {
      part: "statistics,snippet",
      id: channelId,
    });
    const item = data?.items?.[0];
    if (!item) throw new Error(`Channel not found: ${channelId}`);
    const summary = {
      channelId,
      title: item.snippet?.title,
      subscriberCount: item.statistics?.subscriberCount,
      viewCount: item.statistics?.viewCount,
      videoCount: item.statistics?.videoCount,
      hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount,
    };
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  }
);

// --- PLAYLISTS ---

server.tool(
  "create_playlist",
  "Create a new YouTube playlist. Requires OAuth token. Example: create_playlist({ title: 'My Favorites', description: 'Best videos', privacyStatus: 'public' })",
  {
    title: z.string().describe("Playlist title"),
    description: z.string().optional().describe("Playlist description"),
    privacyStatus: z.enum(["public", "private", "unlisted"]).optional().default("private"),
    tags: z.array(z.string()).optional(),
  },
  async ({ title, description, privacyStatus, tags }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for create_playlist");
    const data = await ytFetch("/playlists", { part: "snippet,status" }, {
      method: "POST",
      oauth: true,
      body: {
        snippet: { title, description, tags },
        status: { privacyStatus },
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_playlists",
  "List playlists for a channel or the authenticated user. Example: list_playlists({ channelId: 'UCxxxxxx', maxResults: 10 })",
  {
    channelId: z.string().optional().describe("Channel ID to list playlists for"),
    mine: z.boolean().optional().describe("List authenticated user's playlists (requires OAuth)"),
    maxResults: z.number().min(1).max(50).optional().default(10),
    pageToken: z.string().optional(),
  },
  async ({ channelId, mine, maxResults, pageToken }) => {
    const data = await ytFetch("/playlists", {
      part: "snippet,status,contentDetails",
      channelId,
      mine: mine ? "true" : undefined,
      maxResults,
      pageToken,
    }, { oauth: !!mine });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "add_to_playlist",
  "Add a video to a playlist. Requires OAuth token. Example: add_to_playlist({ playlistId: 'PLxxxxxx', videoId: 'dQw4w9WgXcQ' })",
  {
    playlistId: z.string().describe("Playlist ID"),
    videoId: z.string().describe("Video ID to add"),
    position: z.number().optional().describe("Position in playlist (0-indexed)"),
  },
  async ({ playlistId, videoId, position }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for add_to_playlist");
    const snippet: any = {
      playlistId,
      resourceId: { kind: "youtube#video", videoId },
    };
    if (position !== undefined) snippet.position = position;
    const data = await ytFetch("/playlistItems", { part: "snippet" }, {
      method: "POST",
      oauth: true,
      body: { snippet },
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "remove_from_playlist",
  "Remove a video from a playlist by playlist item ID. Requires OAuth token. Example: remove_from_playlist({ playlistItemId: 'PLItemxxxxxx' })",
  {
    playlistItemId: z.string().describe("Playlist item ID (from list_playlists or add_to_playlist response)"),
  },
  async ({ playlistItemId }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for remove_from_playlist");
    const url = new URL(`${BASE_URL}/playlistItems`);
    url.searchParams.set("id", playlistItemId);
    url.searchParams.set("key", YOUTUBE_API_KEY!);
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: apiHeaders(true),
    });
    if (res.status === 204) return { content: [{ type: "text", text: JSON.stringify({ success: true, playlistItemId }) }] };
    const data = await res.json();
    throw new Error(`Remove failed: ${JSON.stringify(data)}`);
  }
);

// --- COMMENTS ---

server.tool(
  "list_comments",
  "List top-level comments on a video. Example: list_comments({ videoId: 'dQw4w9WgXcQ', maxResults: 20, order: 'relevance' })",
  {
    videoId: z.string().describe("YouTube video ID"),
    maxResults: z.number().min(1).max(100).optional().default(20),
    order: z.enum(["relevance", "time"]).optional().default("relevance"),
    pageToken: z.string().optional(),
    searchTerms: z.string().optional().describe("Filter comments containing this text"),
  },
  async ({ videoId, maxResults, order, pageToken, searchTerms }) => {
    const data = await ytFetch("/commentThreads", {
      part: "snippet,replies",
      videoId,
      maxResults,
      order,
      pageToken,
      searchTerms,
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "post_comment",
  "Post a top-level comment on a video. Requires OAuth token. Example: post_comment({ videoId: 'dQw4w9WgXcQ', text: 'Great video!' })",
  {
    videoId: z.string().describe("YouTube video ID to comment on"),
    text: z.string().describe("Comment text"),
  },
  async ({ videoId, text }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for post_comment");
    const data = await ytFetch("/commentThreads", { part: "snippet" }, {
      method: "POST",
      oauth: true,
      body: {
        snippet: {
          videoId,
          topLevelComment: {
            snippet: { textOriginal: text },
          },
        },
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_comment",
  "Delete a comment. Requires OAuth token and ownership. Example: delete_comment({ commentId: 'UgxxxxUGxxxxxx8' })",
  {
    commentId: z.string().describe("Comment ID to delete"),
  },
  async ({ commentId }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for delete_comment");
    const url = new URL(`${BASE_URL}/comments`);
    url.searchParams.set("id", commentId);
    url.searchParams.set("key", YOUTUBE_API_KEY!);
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: apiHeaders(true),
    });
    if (res.status === 204) return { content: [{ type: "text", text: JSON.stringify({ success: true, commentId }) }] };
    const data = await res.json();
    throw new Error(`Delete comment failed: ${JSON.stringify(data)}`);
  }
);

server.tool(
  "moderate_comment",
  "Set moderation status of a comment (hold for review, publish, reject, mark as spam). Requires OAuth. Example: moderate_comment({ commentId: 'UgxxxxUGxxxxxx8', moderationStatus: 'rejected' })",
  {
    commentId: z.string().describe("Comment ID to moderate"),
    moderationStatus: z.enum(["heldForReview", "published", "rejected"]).describe("New moderation status"),
    banAuthor: z.boolean().optional().describe("Ban the comment author from this channel"),
  },
  async ({ commentId, moderationStatus, banAuthor }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for moderate_comment");
    const url = new URL(`${BASE_URL}/comments/setModerationStatus`);
    url.searchParams.set("key", YOUTUBE_API_KEY!);
    url.searchParams.set("id", commentId);
    url.searchParams.set("moderationStatus", moderationStatus);
    if (banAuthor !== undefined) url.searchParams.set("banAuthor", String(banAuthor));
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: apiHeaders(true),
    });
    if (res.status === 204) return { content: [{ type: "text", text: JSON.stringify({ success: true, commentId, moderationStatus }) }] };
    const data = await res.json();
    throw new Error(`Moderation failed: ${JSON.stringify(data)}`);
  }
);

// --- CAPTIONS ---

server.tool(
  "list_captions",
  "List caption tracks for a video. Requires OAuth or video owner access. Example: list_captions({ videoId: 'dQw4w9WgXcQ' })",
  {
    videoId: z.string().describe("YouTube video ID"),
  },
  async ({ videoId }) => {
    const data = await ytFetch("/captions", { part: "snippet", videoId }, { oauth: true });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "download_caption",
  "Download a caption track in SRT or VTT format. Requires OAuth. Example: download_caption({ captionId: 'AUieDabxxxxxx', format: 'srt' })",
  {
    captionId: z.string().describe("Caption track ID from list_captions"),
    format: z.enum(["srt", "vtt", "ttml", "sbv"]).optional().default("srt").describe("Caption format"),
  },
  async ({ captionId, format }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for download_caption");
    const url = new URL(`${BASE_URL}/captions/${captionId}`);
    url.searchParams.set("key", YOUTUBE_API_KEY!);
    url.searchParams.set("tfmt", format);
    const res = await fetch(url.toString(), { headers: apiHeaders(true) });
    if (!res.ok) throw new Error(`Caption download failed: ${res.status}`);
    const text = await res.text();
    return { content: [{ type: "text", text }] };
  }
);

// --- ANALYTICS ---

server.tool(
  "get_video_analytics",
  "Get analytics for a specific video (views, likes, watchTime). Uses YouTube Data API statistics. Example: get_video_analytics({ videoId: 'dQw4w9WgXcQ' })",
  {
    videoId: z.string().describe("YouTube video ID"),
  },
  async ({ videoId }) => {
    const data: any = await ytFetch("/videos", {
      part: "statistics,snippet,contentDetails",
      id: videoId,
    });
    const item = data?.items?.[0];
    if (!item) throw new Error(`Video not found: ${videoId}`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          videoId,
          title: item.snippet?.title,
          publishedAt: item.snippet?.publishedAt,
          duration: item.contentDetails?.duration,
          viewCount: item.statistics?.viewCount,
          likeCount: item.statistics?.likeCount,
          commentCount: item.statistics?.commentCount,
          favoriteCount: item.statistics?.favoriteCount,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "get_channel_report",
  "Get a channel's overall statistics report. Example: get_channel_report({ channelId: 'UCxxxxxx' })",
  {
    channelId: z.string().describe("YouTube channel ID"),
  },
  async ({ channelId }) => {
    const data: any = await ytFetch("/channels", {
      part: "statistics,snippet,brandingSettings",
      id: channelId,
    });
    const item = data?.items?.[0];
    if (!item) throw new Error(`Channel not found: ${channelId}`);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          channelId,
          title: item.snippet?.title,
          description: item.snippet?.description,
          country: item.snippet?.country,
          subscriberCount: item.statistics?.subscriberCount,
          viewCount: item.statistics?.viewCount,
          videoCount: item.statistics?.videoCount,
          hiddenSubscriberCount: item.statistics?.hiddenSubscriberCount,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  "get_audience_demographics",
  "Get top videos by view count as a proxy for audience interest. Example: get_audience_demographics({ channelId: 'UCxxxxxx', maxResults: 10 })",
  {
    channelId: z.string().describe("YouTube channel ID"),
    maxResults: z.number().min(1).max(50).optional().default(10),
  },
  async ({ channelId, maxResults }) => {
    // Get channel uploads
    const channelData: any = await ytFetch("/channels", { part: "contentDetails", id: channelId });
    const uploadsId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) throw new Error(`No uploads found for channel: ${channelId}`);

    const playlistData: any = await ytFetch("/playlistItems", {
      part: "contentDetails",
      playlistId: uploadsId,
      maxResults: 50,
    });

    const videoIds = (playlistData?.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
    if (!videoIds.length) return { content: [{ type: "text", text: JSON.stringify({ message: "No videos found" }) }] };

    const statsData: any = await ytFetch("/videos", {
      part: "statistics,snippet",
      id: videoIds.join(","),
    });

    const sorted = (statsData?.items || [])
      .map((v: any) => ({
        videoId: v.id,
        title: v.snippet?.title,
        viewCount: parseInt(v.statistics?.viewCount || "0"),
        likeCount: parseInt(v.statistics?.likeCount || "0"),
        commentCount: parseInt(v.statistics?.commentCount || "0"),
      }))
      .sort((a: any, b: any) => b.viewCount - a.viewCount)
      .slice(0, maxResults);

    return { content: [{ type: "text", text: JSON.stringify({ topVideosByViews: sorted }, null, 2) }] };
  }
);

// --- LIVE STREAMS ---

server.tool(
  "create_live_stream",
  "Create a YouTube live broadcast and stream. Requires OAuth token. Example: create_live_stream({ title: 'My Live Stream', scheduledStartTime: '2024-12-01T18:00:00Z', privacyStatus: 'public' })",
  {
    title: z.string().describe("Stream title"),
    description: z.string().optional(),
    scheduledStartTime: z.string().describe("ISO 8601 start time, e.g. '2024-12-01T18:00:00Z'"),
    privacyStatus: z.enum(["public", "private", "unlisted"]).optional().default("public"),
    enableDvr: z.boolean().optional().default(true).describe("Allow viewers to rewind live stream"),
    enableEmbed: z.boolean().optional().default(true),
    recordFromStart: z.boolean().optional().default(true),
  },
  async ({ title, description, scheduledStartTime, privacyStatus, enableDvr, enableEmbed, recordFromStart }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for create_live_stream");
    const broadcast = await ytFetch("/liveBroadcasts", { part: "snippet,status,contentDetails" }, {
      method: "POST",
      oauth: true,
      body: {
        snippet: { title, description, scheduledStartTime },
        status: { privacyStatus },
        contentDetails: { enableDvr, enableEmbed, recordFromStart, monitorStream: { enableMonitorStream: false } },
      },
    });
    return { content: [{ type: "text", text: JSON.stringify(broadcast, null, 2) }] };
  }
);

server.tool(
  "get_live_broadcast",
  "Get details for a live broadcast. Example: get_live_broadcast({ broadcastId: 'xxxxxxxxxxx' })",
  {
    broadcastId: z.string().optional().describe("Specific broadcast ID"),
    broadcastStatus: z.enum(["active", "all", "completed", "upcoming"]).optional().default("upcoming").describe("Filter by status"),
    maxResults: z.number().min(1).max(50).optional().default(5),
  },
  async ({ broadcastId, broadcastStatus, maxResults }) => {
    const data = await ytFetch("/liveBroadcasts", {
      part: "snippet,status,contentDetails",
      id: broadcastId,
      broadcastStatus: broadcastId ? undefined : broadcastStatus,
      maxResults,
      mine: "true",
    }, { oauth: true });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_live_streams",
  "List active or upcoming live streams for the authenticated user. Requires OAuth. Example: list_live_streams({ maxResults: 10 })",
  {
    maxResults: z.number().min(1).max(50).optional().default(10),
    pageToken: z.string().optional(),
  },
  async ({ maxResults, pageToken }) => {
    if (!YOUTUBE_OAUTH_TOKEN) throw new Error("YOUTUBE_OAUTH_TOKEN required for list_live_streams");
    const data = await ytFetch("/liveStreams", {
      part: "snippet,cdn,status",
      mine: "true",
      maxResults,
      pageToken,
    }, { oauth: true });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// --- Express server setup ---

const app = express();
app.use(express.json());

app.get("/health", (_req: any, res: any) => {
  res.json({ status: "ok", server: "youtube-complete", version: "1.0.0" });
});

app.post("/mcp", async (req: any, res: any) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => transport.close());
  await transport.handleRequest(req, res, req.body);
  await server.connect(transport);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`youtube-complete MCP server running on port ${PORT}`);
});
