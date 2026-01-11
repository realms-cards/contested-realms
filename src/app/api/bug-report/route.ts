import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_BUG_REPORT_TOKEN;
const GITHUB_REPO = "realms-cards/issues";
const GITHUB_SNAPSHOTS_REPO = "realms-cards/issues"; // Repo for storing screenshots

interface BugReportPayload {
  title: string;
  description: string;
  consoleLogs: string;
  screenshotBase64?: string;
  userAgent: string;
  url: string;
  timestamp: string;
  matchId?: string;
  userId?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!GITHUB_TOKEN) {
      console.error("[BugReport] GITHUB_BUG_REPORT_TOKEN not configured");
      return NextResponse.json(
        { error: "Bug reporting is not configured on this server" },
        { status: 503 }
      );
    }

    const body = (await req.json()) as BugReportPayload;
    const {
      title,
      description,
      consoleLogs,
      screenshotBase64,
      userAgent,
      url,
      timestamp,
      matchId,
      userId,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required" },
        { status: 400 }
      );
    }

    // Build the issue body
    let issueBody = `## Bug Report

**Submitted:** ${timestamp}
**URL:** ${url}
**User Agent:** ${userAgent}
${matchId ? `**Match ID:** ${matchId}` : ""}
${userId ? `**User ID:** ${userId}` : ""}

## Description

${description}

`;

    // Add console logs section if available
    if (consoleLogs && consoleLogs.trim().length > 0) {
      // Truncate logs if too long (GitHub has issue body limits)
      const maxLogLength = 50000;
      const truncatedLogs =
        consoleLogs.length > maxLogLength
          ? consoleLogs.slice(-maxLogLength) +
            "\n\n... (truncated, showing last 50KB)"
          : consoleLogs;

      issueBody += `## Console Logs

<details>
<summary>Click to expand console logs</summary>

\`\`\`
${truncatedLogs}
\`\`\`

</details>

`;
    }

    // Upload screenshot to snapshots repo and link in issue
    if (screenshotBase64) {
      try {
        // Strip any existing data URL prefix
        const cleanBase64 = screenshotBase64.replace(
          /^data:image\/\w+;base64,/,
          ""
        );

        // Generate unique filename
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const isJpeg =
          screenshotBase64.startsWith("/9j/") ||
          screenshotBase64.startsWith("data:image/jpeg");
        const ext = isJpeg ? "jpg" : "png";
        const filename = `screenshot-${uid}.${ext}`;

        // Upload to snapshots repository
        const uploadResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_SNAPSHOTS_REPO}/contents/${filename}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({
              message: `Bug report screenshot: ${title}`,
              branch: "main",
              content: cleanBase64,
            }),
          }
        );

        if (uploadResponse.ok) {
          const uploadData = await uploadResponse.json();
          // Get raw URL for the image
          const screenshotUrl = uploadData.content.html_url + "?raw=true";
          issueBody += `## Screenshot

![Bug Report Screenshot](${screenshotUrl})

`;
        } else {
          const errorData = await uploadResponse.json().catch(() => ({}));
          console.error(
            "[BugReport] Screenshot upload failed:",
            uploadResponse.status,
            errorData
          );
          issueBody += `## Screenshot

*Screenshot upload failed. Please request manually if needed.*

`;
        }
      } catch (err) {
        console.error("[BugReport] Screenshot upload error:", err);
        issueBody += `## Screenshot

*Screenshot upload failed. Please request manually if needed.*

`;
      }
    }

    // Create the GitHub issue
    const issueResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: `[Bug] ${title}`,
          body: issueBody,
          labels: ["bug", "user-reported"],
        }),
      }
    );

    if (!issueResponse.ok) {
      const errorData = await issueResponse.json().catch(() => ({}));
      console.error(
        "[BugReport] GitHub API error:",
        issueResponse.status,
        errorData
      );

      // Provide more specific error messages
      if (issueResponse.status === 401) {
        return NextResponse.json(
          {
            error:
              "GitHub token is invalid or expired. Please update GITHUB_BUG_REPORT_TOKEN.",
          },
          { status: 500 }
        );
      }
      if (issueResponse.status === 404) {
        return NextResponse.json(
          {
            error:
              "GitHub repository not found. Check that realms-cards/issues exists and the token has access.",
          },
          { status: 500 }
        );
      }
      if (issueResponse.status === 403) {
        return NextResponse.json(
          {
            error:
              "GitHub token lacks permission. Ensure it has 'repo' or 'public_repo' scope.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: `GitHub API error (${issueResponse.status}): ${
            errorData.message || "Unknown error"
          }`,
        },
        { status: 500 }
      );
    }

    const issueData = await issueResponse.json();

    return NextResponse.json({
      success: true,
      issueUrl: issueData.html_url,
      issueNumber: issueData.number,
    });
  } catch (error) {
    console.error("[BugReport] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
