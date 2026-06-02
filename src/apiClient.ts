import type {
  CircuitModel,
  CircuitProject,
  SimulationInputs,
  SimulationPreset,
  SimulationSnapshot,
  ValidationFinding
} from "./domain";

const API_BASE_URL =
  (import.meta as ImportMeta & { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? "http://127.0.0.1:8787/api";
const REQUEST_TIMEOUT_MS = 900;

interface ApiEnvelope<T> {
  data: T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}: ${response.statusText}`);
    }

    const envelope = (await response.json()) as ApiEnvelope<T>;
    return envelope.data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadProject(projectId: string): Promise<CircuitProject> {
  return requestJson<CircuitProject>(`/projects/${projectId}`);
}

export async function createProject(input: {
  name: string;
  model: CircuitModel;
  standardsProfile: "IEC_KR_INDUSTRIAL";
}): Promise<CircuitProject> {
  return requestJson<CircuitProject>("/projects", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function saveProjectRevision(projectId: string, model: CircuitModel): Promise<CircuitProject> {
  return requestJson<CircuitProject>(`/projects/${projectId}/revisions`, {
    method: "POST",
    body: JSON.stringify({ model })
  });
}

export async function validateModel(projectId: string | undefined, model: CircuitModel): Promise<ValidationFinding[]> {
  const payload = await requestJson<{ findings: ValidationFinding[] }>("/validate", {
    method: "POST",
    body: JSON.stringify({ projectId, model })
  });
  return payload.findings;
}

export async function simulateModelStep(
  model: CircuitModel,
  previous?: SimulationSnapshot,
  inputs?: Partial<SimulationInputs>
): Promise<SimulationSnapshot> {
  return requestJson<SimulationSnapshot>("/simulate/step", {
    method: "POST",
    body: JSON.stringify({ model, previous, inputs })
  });
}

export async function saveSimulationPreset(
  projectId: string,
  input: { name: string; inputs: SimulationInputs }
): Promise<SimulationPreset> {
  return requestJson<SimulationPreset>(`/projects/${projectId}/simulation-presets`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listSimulationPresets(projectId: string): Promise<SimulationPreset[]> {
  return requestJson<SimulationPreset[]>(`/projects/${projectId}/simulation-presets`);
}
