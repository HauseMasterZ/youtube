export default {
  async fetch(request, env) {
    // 1. Security: Strictly Allowed Origins (Production Only)
    const allowedOrigins = [
      "https://hausemasterz.github.io"
    ];
    
    const origin = request.headers.get("Origin") || request.headers.get("Referer");
    
    let isAllowed = false;
    let matchedOrigin = allowedOrigins[0]; // Default fallback
    
    if (origin) {
      for (const allowed of allowedOrigins) {
        if (origin.startsWith(allowed)) {
          isAllowed = true;
          matchedOrigin = allowed;
          break;
        }
      }
    }

    // Handle browser Preflight (CORS) requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": isAllowed ? matchedOrigin : allowedOrigins[0],
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    // 2. Strict Origin Checking
    if (!isAllowed) {
      return new Response("403 Forbidden - Direct access not allowed.", { status: 403 });
    }

    // 3. Define the hidden GitHub Repository Details
    // These are stored strictly on the server-side, completely invisible to the frontend!
    const owner = "HauseMasterZ";
    const repo = "youtube_playlist_tracker_downloader";
    const branch = "main";
    
    // Extract the requested file path (e.g., "/Songs/_Playlist_Database.json")
    const url = new URL(request.url);
    const filePath = url.pathname.replace(/^\//, ''); // Removes the leading slash

    // 4. Construct the proper GitHub RAW URL for extremely fast edge caching
    const apiUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;

    // 5. Fetch from Private GitHub Repo using your Secret Token
    // We clone the original request to preserve Range headers natively!
    const newRequest = new Request(apiUrl, request);
    newRequest.headers.set("Authorization", `Bearer ${env.GITHUB_PAT}`);
    newRequest.headers.delete("Origin");
    newRequest.headers.delete("Referer");

    const githubResponse = await fetch(newRequest, {
      cf: {
        cacheTtl: 86400,
        cacheEverything: true
      }
    });

    // 6. Forward the media stream back to the user perfectly
    let response;
    if (filePath.endsWith("Database.json") && githubResponse.ok) {
        try {
            const rawJson = await githubResponse.json();
            const minified = rawJson.map(t => {
                const filename = t.file_path ? t.file_path.split('/').pop().replace(/\.webm$/, '') : '';
                return [
                    t.id || t.video_id,
                    t.title,
                    t.channel || "",
                    t.duration || t.duration_string || 0,
                    filename
                ];
            });
            const minifiedStr = JSON.stringify(minified);
            response = new Response(minifiedStr, {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": matchedOrigin,
                    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                    "Cache-Control": "public, max-age=86400"
                }
            });
            return response; // Return early since we fully constructed the headers
        } catch (e) {
            response = new Response(githubResponse.body, githubResponse);
        }
    } else {
        response = new Response(githubResponse.body, githubResponse);
    }
    // Ensure CORS allows your frontend to play the audio and extract canvas pixels
    response.headers.set("Access-Control-Allow-Origin", matchedOrigin);
    response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    response.headers.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");
    
    // Cache the media files on Cloudflare's global edge network for 24 hours
    response.headers.set("Cache-Control", "public, max-age=86400");
    
    return response;
  }
};
