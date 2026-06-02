import cors from "cors";
import express from "express";
import pg from "pg";
import { z } from "zod";
import {
  componentCatalog,
  createStarterProject,
  simulateStep,
  validateCircuit,
  type CircuitModel,
  type CircuitProject,
  type SimulationPreset
} from "./domain";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
const memoryProjects = new Map<string, CircuitProject>();
const memorySimulationPresets = new Map<string, SimulationPreset[]>();

memoryProjects.set("project-seq-001", createStarterProject());

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const projectInputSchema = z.object({
  name: z.string().min(1),
  model: z.custom<CircuitModel>(),
  standardsProfile: z.literal("IEC_KR_INDUSTRIAL").default("IEC_KR_INDUSTRIAL")
});

const simulationInputsSchema = z.object({
  startPressed: z.boolean(),
  startContactStuck: z.boolean().default(false),
  stopPressed: z.boolean(),
  limitClosed: z.boolean(),
  overloadHealthy: z.boolean(),
  controlFuseHealthy: z.boolean()
});

const simulationPresetInputSchema = z.object({
  name: z.string().min(1),
  inputs: simulationInputsSchema
});

async function ensureSchema() {
  if (!pool) return;
  await pool.query(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      owner_id text not null,
      active_revision integer not null,
      standards_profile text not null,
      updated_at timestamptz not null,
      model jsonb not null
    );
    create table if not exists validation_runs (
      id bigserial primary key,
      project_id text,
      created_at timestamptz not null default now(),
      findings jsonb not null
    );
    create table if not exists simulation_presets (
      id text primary key,
      project_id text not null,
      name text not null,
      inputs jsonb not null,
      created_at timestamptz not null
    );
  `);
}

async function saveProject(project: CircuitProject) {
  if (!pool) {
    memoryProjects.set(project.id, project);
    return project;
  }

  await pool.query(
    `
      insert into projects (id, name, owner_id, active_revision, standards_profile, updated_at, model)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (id) do update set
        name = excluded.name,
        owner_id = excluded.owner_id,
        active_revision = excluded.active_revision,
        standards_profile = excluded.standards_profile,
        updated_at = excluded.updated_at,
        model = excluded.model
    `,
    [
      project.id,
      project.name,
      project.ownerId,
      project.activeRevision,
      project.standardsProfile,
      project.updatedAt,
      JSON.stringify(project.model)
    ]
  );
  return project;
}

async function loadProject(id: string) {
  if (!pool) {
    return memoryProjects.get(id);
  }

  const result = await pool.query("select * from projects where id = $1", [id]);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    activeRevision: row.active_revision,
    standardsProfile: row.standards_profile,
    updatedAt: row.updated_at.toISOString(),
    model: row.model
  } satisfies CircuitProject;
}

async function saveSimulationPresetRecord(preset: SimulationPreset) {
  if (!pool) {
    const items = memorySimulationPresets.get(preset.projectId) ?? [];
    memorySimulationPresets.set(preset.projectId, [preset, ...items].slice(0, 20));
    return preset;
  }

  await pool.query(
    `
      insert into simulation_presets (id, project_id, name, inputs, created_at)
      values ($1, $2, $3, $4, $5)
    `,
    [preset.id, preset.projectId, preset.name, JSON.stringify(preset.inputs), preset.createdAt]
  );
  return preset;
}

async function listSimulationPresetRecords(projectId: string) {
  if (!pool) {
    return memorySimulationPresets.get(projectId) ?? [];
  }

  const result = await pool.query(
    `
      select id, project_id, name, inputs, created_at
      from simulation_presets
      where project_id = $1
      order by created_at desc
      limit 20
    `,
    [projectId]
  );
  return result.rows.map(
    (row) =>
      ({
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        inputs: row.inputs,
        createdAt: row.created_at.toISOString()
      }) satisfies SimulationPreset
  );
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    storage: pool ? "postgres" : "memory",
    safety: "Rule-based engineering aid; not regulatory certification."
  });
});

app.get("/api/components", (_request, response) => {
  response.json({ data: componentCatalog });
});

app.get("/api/projects/:id", async (request, response) => {
  const project = await loadProject(request.params.id);
  if (!project) {
    response.status(404).json({ error: "project_not_found" });
    return;
  }
  response.json({ data: project });
});

app.post("/api/projects", async (request, response) => {
  const parsed = projectInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_project", details: parsed.error.flatten() });
    return;
  }

  const now = new Date().toISOString();
  const project: CircuitProject = {
    id: `project-${Date.now()}`,
    name: parsed.data.name,
    ownerId: "single-user",
    activeRevision: 1,
    standardsProfile: parsed.data.standardsProfile,
    updatedAt: now,
    model: parsed.data.model
  };
  response.status(201).json({ data: await saveProject(project) });
});

app.post("/api/projects/:id/revisions", async (request, response) => {
  const existing = await loadProject(request.params.id);
  if (!existing) {
    response.status(404).json({ error: "project_not_found" });
    return;
  }

  const model = request.body?.model as CircuitModel | undefined;
  if (!model?.components || !model?.conductors) {
    response.status(400).json({ error: "invalid_model" });
    return;
  }

  const nextProject: CircuitProject = {
    ...existing,
    activeRevision: existing.activeRevision + 1,
    updatedAt: new Date().toISOString(),
    model
  };
  response.json({ data: await saveProject(nextProject) });
});

app.post("/api/projects/:id/simulation-presets", async (request, response) => {
  const existing = await loadProject(request.params.id);
  if (!existing) {
    response.status(404).json({ error: "project_not_found" });
    return;
  }

  const parsed = simulationPresetInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_simulation_preset", details: parsed.error.flatten() });
    return;
  }

  const preset: SimulationPreset = {
    id: `preset-${Date.now()}`,
    projectId: existing.id,
    name: parsed.data.name,
    inputs: parsed.data.inputs,
    createdAt: new Date().toISOString()
  };
  response.status(201).json({ data: await saveSimulationPresetRecord(preset) });
});

app.get("/api/projects/:id/simulation-presets", async (request, response) => {
  const existing = await loadProject(request.params.id);
  if (!existing) {
    response.status(404).json({ error: "project_not_found" });
    return;
  }

  response.json({ data: await listSimulationPresetRecords(existing.id) });
});

app.post("/api/validate", async (request, response) => {
  const model = request.body?.model as CircuitModel | undefined;
  if (!model?.components || !model?.conductors) {
    response.status(400).json({ error: "invalid_model" });
    return;
  }

  const findings = validateCircuit(model);
  if (pool && request.body?.projectId) {
    await pool.query("insert into validation_runs (project_id, findings) values ($1, $2)", [
      request.body.projectId,
      JSON.stringify(findings)
    ]);
  }
  response.json({ data: { findings } });
});

app.post("/api/simulate/step", (request, response) => {
  const model = request.body?.model as CircuitModel | undefined;
  if (!model?.components || !model?.conductors) {
    response.status(400).json({ error: "invalid_model" });
    return;
  }
  response.json({ data: simulateStep(model, request.body?.previous, request.body?.inputs) });
});

await ensureSchema();

app.listen(port, "127.0.0.1", () => {
  console.log(`Sequence Editor API listening on http://127.0.0.1:${port}`);
});
