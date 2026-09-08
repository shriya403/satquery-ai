import type { AnalysisResponse, DemoDataset } from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export async function fetchDemoDatasets(): Promise<DemoDataset[]> {
  const response = await fetch(`${API_BASE}/api/demo-datasets`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json();
}

export async function runAnalysis(question: string, datasetId: string): Promise<AnalysisResponse> {
  const response = await fetch(`${API_BASE}/api/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      dataset_id: datasetId
    })
  });
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }
  return response.json();
}

export function previewUrl(datasetId: string): string {
  return `${API_BASE}/api/demo-datasets/${encodeURIComponent(datasetId)}/preview.png`;
}
