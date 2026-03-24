export const runtime = "edge";

interface ImagePayload {
  name: string;
  data: string;
  mimeType: string;
}

interface RequestBody {
  title: string;
  body: string;
  images?: ImagePayload[];
  labels?: string[];
}

const GITHUB_API = "https://api.github.com";

async function uploadImageToRepo(
  token: string,
  owner: string,
  repo: string,
  image: ImagePayload,
  timestamp: number,
): Promise<string | null> {
  const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `feedback-assets/${timestamp}-${safeName}`;

  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `chore: upload feedback asset ${safeName}`,
      content: image.data,
    }),
  });

  if (!res.ok) return null;

  const json = await res.json() as { content?: { download_url?: string } };
  return json.content?.download_url ?? null;
}

async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels?: string[],
): Promise<{ html_url: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title, body, labels: labels ?? [] }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `GitHub API error ${res.status}`);
  }

  return res.json() as Promise<{ html_url: string }>;
}

export async function POST(request: Request): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return Response.json(
      { error: "Server misconfigured: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO are required" },
      { status: 500 },
    );
  }

  let payload: RequestBody;
  try {
    payload = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, body, images = [], labels } = payload;

  if (!title?.trim() || !body?.trim()) {
    return Response.json({ error: "title and body are required" }, { status: 400 });
  }

  const timestamp = Date.now();
  const imageMarkdownParts: string[] = [];

  for (const image of images) {
    const url = await uploadImageToRepo(token, owner, repo, image, timestamp);
    if (url) {
      imageMarkdownParts.push(`![${image.name}](${url})`);
    } else {
      imageMarkdownParts.push(`> Image \`${image.name}\` could not be uploaded.`);
    }
  }

  const fullBody = imageMarkdownParts.length > 0
    ? `${body.trim()}\n\n---\n\n${imageMarkdownParts.join("\n\n")}`
    : body.trim();

  try {
    const issue = await createIssue(token, owner, repo, title.trim(), fullBody, labels);
    return Response.json({ issueUrl: issue.html_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create issue";
    return Response.json({ error: message }, { status: 500 });
  }
}
