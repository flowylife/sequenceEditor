import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Component,
  Gauge,
  Library,
  PanelTop,
  Play,
  Rows3,
  RotateCcw,
  Save,
  ShieldCheck,
  Square,
  StepForward,
  Wifi,
  WifiOff,
  Undo2,
  Zap
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps
} from "@xyflow/react";
import {
  addComponent,
  addConductor,
  analyzeElectricalPaths,
  buildNetlist,
  componentCatalog,
  createStarterProject,
  findDefinition,
  simulateStep,
  summarizeFindings,
  updateComponentReference,
  updateComponentSetting,
  validateCircuit,
  type CircuitComponent,
  type CircuitModel,
  type ComponentDefinition,
  type AddConductorInput,
  type ElectricalPathAnalysis,
  type LogicElement,
  type LogicModel,
  type NetlistModel,
  buildLogicModel,
  buildPanelLayout,
  type PanelLayoutModel,
  type SimulationInputs,
  type SimulationSnapshot,
  type ValidationFinding
} from "./domain";
import { createProject, loadProject, saveProjectRevision, simulateModelStep, validateModel } from "./apiClient";

interface CircuitNodeData extends Record<string, unknown> {
  component: CircuitComponent;
  definition: ComponentDefinition;
  state: string;
}

type InspectorTab = "specs" | "validation" | "simulation";
type WorkspaceMode = "cad" | "panel" | "ladder";
type CadViewMode = "schematic" | "graph";

const railLabels: Record<string, string> = {
  "control-rail": "Control DIN rail",
  "terminal-rail": "Terminal DIN rail",
  virtual: "Panel face"
};

const initialSimulationInputs: SimulationInputs = {
  startPressed: true,
  stopPressed: false
};

function DeviceNode({ data, selected }: NodeProps<Node<CircuitNodeData>>) {
  const nodeData = data as CircuitNodeData;
  const { component, definition, state } = nodeData;
  const isEnergized = state === "energized" || state === "closed";

  return (
    <div className={`device-node ${selected ? "is-selected" : ""} ${isEnergized ? "is-energized" : ""}`}>
      <Handle type="target" position={Position.Left} className="node-handle" />
      <div className="device-symbol">{definition.symbol}</div>
      <div className="device-body">
        <div className="device-reference">{component.reference}</div>
        <div className="device-name">{definition.name}</div>
        <div className="terminal-row">
          {definition.terminals.slice(0, 4).map((terminal) => (
            <span key={terminal.id}>{terminal.label}</span>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  );
}

const nodeTypes = { device: DeviceNode };

function modelToFlow(model: CircuitModel, snapshot?: SimulationSnapshot): { nodes: Node<CircuitNodeData>[]; edges: Edge[] } {
  const nodes = model.components.map((component) => {
    const definition = findDefinition(component.definitionId);
    return {
      id: component.id,
      type: "device",
      position: { x: component.x, y: component.y },
      data: {
        component,
        definition,
        state: snapshot?.componentStates[component.id] ?? component.state ?? "idle"
      }
    };
  });

  const edges = model.conductors.map((conductor) => {
    const energized = snapshot?.energizedNets.includes(conductor.net) ?? false;
    return {
      id: conductor.id,
      source: conductor.from,
      target: conductor.to,
      label: conductor.net,
      type: "smoothstep",
      animated: energized,
      className: energized ? "energized-edge" : "wire-edge",
      style: {
        stroke: energized ? "#2563eb" : "#94a3b8",
        strokeWidth: energized ? 2.8 : 1.6
      }
    };
  });

  return { nodes, edges };
}

function getFirstTerminal(definition: ComponentDefinition, preferred: "source" | "target") {
  if (preferred === "source") {
    return definition.terminals[definition.terminals.length - 1]?.id ?? "1";
  }
  return definition.terminals[0]?.id ?? "1";
}

const signalRows = [
  { key: "start", label: "SB1 START" },
  { key: "stop", label: "SB0 STOP" },
  { key: "k1", label: "K1 Coil" },
  { key: "seal", label: "K1 13-14" },
  { key: "timer", label: "KT1 TON" },
  { key: "y0", label: "Y0 Output" },
  { key: "hl1", label: "HL1 Lamp" }
] as const;

function signalActive(snapshot: SimulationSnapshot, key: (typeof signalRows)[number]["key"]) {
  switch (key) {
    case "start":
      return snapshot.inputs.startPressed;
    case "stop":
      return !snapshot.inputs.stopPressed;
    case "k1":
      return Object.entries(snapshot.componentStates).some(([componentId, state]) => componentId === "c-k1" && state === "energized");
    case "seal":
      return Object.entries(snapshot.componentStates).some(([componentId, state]) => componentId === "c-k1a" && state === "closed");
    case "timer":
      return snapshot.energizedNets.includes("TIMER-DONE");
    case "y0":
      return Object.entries(snapshot.componentStates).some(([componentId, state]) => componentId === "c-y0" && state === "energized");
    case "hl1":
      return Object.entries(snapshot.componentStates).some(([componentId, state]) => componentId === "c-hl1" && state === "energized");
  }
}

function App() {
  const starterProject = useMemo(() => createStarterProject(), []);
  const reactFlowNodeTypes = useMemo(() => nodeTypes, []);
  const [model, setModel] = useState<CircuitModel>(starterProject.model);
  const [projectName, setProjectName] = useState(starterProject.name);
  const [selectedId, setSelectedId] = useState<string | undefined>(starterProject.model.components[4]?.id);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("validation");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("cad");
  const [cadViewMode, setCadViewMode] = useState<CadViewMode>("schematic");
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [remoteFindings, setRemoteFindings] = useState<ValidationFinding[] | undefined>();
  const [simulationInputs, setSimulationInputs] = useState<SimulationInputs>(initialSimulationInputs);
  const initialSnapshot = useMemo(() => simulateStep(starterProject.model, undefined, initialSimulationInputs), [starterProject.model]);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | undefined>(initialSnapshot);
  const [simulationHistory, setSimulationHistory] = useState<SimulationSnapshot[]>([initialSnapshot]);
  const [history, setHistory] = useState<CircuitModel[]>([starterProject.model]);
  const [projectId, setProjectId] = useState<string | undefined>(starterProject.id);
  const [activeRevision, setActiveRevision] = useState(starterProject.activeRevision);
  const [syncStatus, setSyncStatus] = useState<"local" | "saving" | "saved" | "loading" | "api-fallback">("local");
  const [syncMessage, setSyncMessage] = useState("Local editor ready");

  const localFindings = useMemo(() => validateCircuit(model), [model]);
  const findings = remoteFindings ?? localFindings;
  const summary = useMemo(() => summarizeFindings(findings), [findings]);
  const selectedComponent = model.components.find((component) => component.id === selectedId) ?? model.components[0];
  const selectedDefinition = selectedComponent ? findDefinition(selectedComponent.definitionId) : undefined;
  const selectedPlacement = model.panelPlacements.find((placement) => placement.componentId === selectedComponent?.id);
  const flow = useMemo(() => modelToFlow(model, snapshot), [model, snapshot]);
  const logicModel = useMemo(() => buildLogicModel(model, snapshot), [model, snapshot]);
  const panelLayout = useMemo(() => buildPanelLayout(model, findings), [model, findings]);
  const electricalAnalysis = useMemo(() => analyzeElectricalPaths(model, snapshot), [model, snapshot]);
  const netlist = useMemo(() => buildNetlist(model), [model]);
  const timerDelayMs = useMemo(() => {
    const timer = model.components.find((component) => component.reference === "KT1");
    const delay = Number(timer?.settings?.delayMs ?? 3000);
    return Number.isFinite(delay) && delay > 0 ? delay : 3000;
  }, [model.components]);
  const activeWarnings = findings.filter((finding) => finding.severity !== "info");
  const isEmpty = model.components.length === 0;

  const commitModel = useCallback((nextModel: CircuitModel) => {
    setHistory((items) => [...items, nextModel].slice(-20));
    setModel(nextModel);
    setSnapshot(undefined);
    setSimulationHistory([]);
    setRemoteFindings(undefined);
    setSyncStatus("local");
    setSyncMessage("Unsaved local changes");
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const nextNodes = applyNodeChanges(changes, flow.nodes);
      const hasPositionChange = changes.some((change) => change.type === "position" && "position" in change);
      setModel((current) => ({
        ...current,
        components: current.components.map((component) => {
          const nextNode = nextNodes.find((node) => node.id === component.id);
          return nextNode ? { ...component, x: nextNode.position.x, y: nextNode.position.y } : component;
        })
      }));
      if (hasPositionChange) {
        setRemoteFindings(undefined);
        setSyncStatus("local");
        setSyncMessage("Unsaved local layout changes");
      }
    },
    [flow.nodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const source = model.components.find((component) => component.id === connection.source);
      const target = model.components.find((component) => component.id === connection.target);
      if (!source || !target) return;

      const sourceDefinition = findDefinition(source.definitionId);
      const targetDefinition = findDefinition(target.definitionId);
      commitModel({
        ...model,
        conductors: [
          ...model.conductors,
          {
            id: `w-${Date.now()}`,
            from: source.id,
            fromTerminal: getFirstTerminal(sourceDefinition, "source"),
            to: target.id,
            toTerminal: getFirstTerminal(targetDefinition, "target"),
            net: `${source.reference}-${target.reference}`
          }
        ]
      });
    },
    [commitModel, model]
  );

  const runValidation = async () => {
    setValidationError(null);
    setInspectorTab("validation");
    if (isEmpty) {
      setValidationError("No circuit objects exist. Add at least one control component before validation.");
      setSyncStatus("local");
      setSyncMessage("Validation stayed local because the circuit is empty");
      return;
    }

    try {
      setSyncStatus("loading");
      setSyncMessage("Running validation through API");
      const apiFindings = await validateModel(projectId, model);
      setRemoteFindings(apiFindings);
      setSyncStatus("saved");
      setSyncMessage("Validation run saved through API");
    } catch {
      setRemoteFindings(undefined);
      setSyncStatus("api-fallback");
      setSyncMessage("API unavailable; using local validation engine");
    }
  };

  const stepSimulation = async () => {
    setInspectorTab("simulation");
    try {
      setSyncStatus("loading");
      setSyncMessage("Requesting simulation step from API");
      const next = await simulateModelStep(model, snapshot, simulationInputs);
      setSnapshot(next);
      setSimulationHistory((items) => [...items, next].slice(-20));
      setSyncStatus("saved");
      setSyncMessage("Simulation step returned from API");
    } catch {
      const next = simulateStep(model, snapshot, simulationInputs);
      setSnapshot(next);
      setSimulationHistory((items) => [...items, next].slice(-20));
      setSyncStatus("api-fallback");
      setSyncMessage("API unavailable; simulation stepped locally");
    }
  };

  const resetSimulation = () => {
    setSnapshot(undefined);
    setSimulationHistory([]);
    setSimulationInputs({ startPressed: false, stopPressed: false });
    setInspectorTab("simulation");
  };

  const updateSimulationInputs = (nextInputs: SimulationInputs) => {
    setSimulationInputs(nextInputs);
    setSyncStatus("local");
    setSyncMessage("Simulation input state changed");
  };

  const addCatalogPart = (definitionId: string) => {
    const next = addComponent(model, definitionId);
    setValidationError(null);
    commitModel(next);
    setSelectedId(next.components[next.components.length - 1]?.id);
  };

  const addManualConductor = (input: AddConductorInput) => {
    const next = addConductor(model, input);
    setValidationError(null);
    commitModel(next);
    setSelectedId(input.fromComponentId);
  };

  const updateSelectedReference = (componentId: string, reference: string) => {
    const next = updateComponentReference(model, { componentId, reference });
    setValidationError(null);
    commitModel(next);
    setSelectedId(componentId);
  };

  const updateSelectedSetting = (componentId: string, key: string, value: string | number | boolean) => {
    const next = updateComponentSetting(model, { componentId, key, value });
    setValidationError(null);
    commitModel(next);
    setSelectedId(componentId);
  };

  const loadEmptyProject = () => {
    const emptyModel: CircuitModel = { components: [], conductors: [], panelPlacements: [] };
    setProjectName("Untitled sequence project");
    setProjectId(undefined);
    setActiveRevision(0);
    commitModel(emptyModel);
    setSelectedId(undefined);
    setSnapshot(undefined);
    setSimulationHistory([]);
    setInspectorTab("validation");
  };

  const reloadStarter = async () => {
    setLoading(true);
    setSyncStatus("loading");
    setSyncMessage("Loading starter project through API");
    try {
      const project = await loadProject("project-seq-001");
      setProjectName(project.name);
      setProjectId(project.id);
      setActiveRevision(project.activeRevision);
      setHistory([project.model]);
      setModel(project.model);
      setSelectedId(project.model.components[4]?.id);
      setSimulationInputs(initialSimulationInputs);
      {
        const nextSnapshot = simulateStep(project.model, undefined, initialSimulationInputs);
        setSnapshot(nextSnapshot);
        setSimulationHistory([nextSnapshot]);
      }
      setRemoteFindings(undefined);
      setValidationError(null);
      setSyncStatus("saved");
      setSyncMessage("Starter project loaded from API");
    } catch {
      const next = createStarterProject();
      setProjectName(next.name);
      setProjectId(next.id);
      setActiveRevision(next.activeRevision);
      setHistory([next.model]);
      setModel(next.model);
      setSelectedId(next.model.components[4]?.id);
      setSimulationInputs(initialSimulationInputs);
      {
        const nextSnapshot = simulateStep(next.model, undefined, initialSimulationInputs);
        setSnapshot(nextSnapshot);
        setSimulationHistory([nextSnapshot]);
      }
      setRemoteFindings(undefined);
      setValidationError(null);
      setSyncStatus("api-fallback");
      setSyncMessage("API unavailable; starter project loaded locally");
    } finally {
      setLoading(false);
    }
  };

  const saveProject = async () => {
    setValidationError(null);
    setSyncStatus("saving");
    setSyncMessage(projectId ? "Saving project revision through API" : "Creating project through API");
    try {
      const project = projectId
        ? await saveProjectRevision(projectId, model)
        : await createProject({
            name: projectName,
            model,
            standardsProfile: "IEC_KR_INDUSTRIAL"
          });

      setProjectId(project.id);
      setProjectName(project.name);
      setActiveRevision(project.activeRevision);
      setHistory([project.model]);
      setModel(project.model);
      setSnapshot(undefined);
      setSimulationHistory([]);
      setRemoteFindings(undefined);
      setSyncStatus("saved");
      setSyncMessage(`Saved revision ${project.activeRevision}`);
    } catch {
      setSyncStatus("api-fallback");
      setSyncMessage("API unavailable; changes remain local and unsaved");
    }
  };

  const undo = () => {
    setHistory((items) => {
      if (items.length < 2) return items;
      const nextHistory = items.slice(0, -1);
      setModel(nextHistory[nextHistory.length - 1]);
      setSnapshot(undefined);
      setSimulationHistory([]);
      return nextHistory;
    });
  };

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Zap size={18} />
            </div>
            <div>
              <strong>Sequence Editor</strong>
              <span>IEC/KR control-circuit CAD and simulation</span>
            </div>
          </div>
          <div className="project-title">
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} aria-label="Project name" />
            <span>Revision {activeRevision} · engineering aid only</span>
          </div>
          <div className="command-group">
            <button type="button" className="icon-button" onClick={undo} aria-label="Undo">
              <Undo2 size={16} />
            </button>
            <button type="button" className="icon-button" onClick={saveProject} aria-label="Save project">
              <Save size={16} />
            </button>
            <button type="button" onClick={runValidation} className="primary-command">
              <ShieldCheck size={16} />
              Validate
            </button>
            <button type="button" onClick={stepSimulation} className="primary-command is-blue">
              <Play size={16} />
              Run
            </button>
          </div>
        </header>

        <main className="workspace">
          <aside className={`library-panel ${libraryOpen ? "" : "is-collapsed"}`}>
            <button className="panel-toggle" type="button" onClick={() => setLibraryOpen((open) => !open)} aria-label="Toggle library">
              {libraryOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
            {libraryOpen && (
              <>
                <div className="panel-heading">
                  <Library size={17} />
                  <div>
                    <strong>Component Library</strong>
                    <span>Curated + custom-ready parts</span>
                  </div>
                </div>
                <div className="library-list">
                  {componentCatalog.map((definition) => (
                    <button key={definition.id} type="button" className="catalog-item" onClick={() => addCatalogPart(definition.id)}>
                      <span className="catalog-symbol">{definition.symbol}</span>
                      <span>
                        <strong>{definition.name}</strong>
                        <small>{definition.kind.replace("-", " ")} · {definition.mechanical.mount}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>

          <section className="canvas-region">
            <div className="canvas-toolbar">
              <div className="status-cluster">
                <span className="status-pill is-ok">
                  <CheckCircle2 size={14} />
                  {summary.errors} errors
                </span>
                <span className="status-pill is-warning">
                  <AlertTriangle size={14} />
                  {summary.warnings} warnings
                </span>
                <span className="status-pill">
                  <Activity size={14} />
                  {snapshot?.mode ?? "paused"} · step {snapshot?.step ?? 0}
                </span>
                <span className={`status-pill ${syncStatus === "api-fallback" ? "is-warning" : syncStatus === "saved" ? "is-ok" : ""}`}>
                  {syncStatus === "api-fallback" ? <WifiOff size={14} /> : <Wifi size={14} />}
                  {syncMessage}
                </span>
              </div>
              <div className="toolbar-actions">
                <div className="mode-switch" role="group" aria-label="Workspace mode">
                  <button
                    type="button"
                    aria-label="Show CAD workspace"
                    className={workspaceMode === "cad" ? "is-active" : ""}
                    onClick={() => setWorkspaceMode("cad")}
                  >
                    CAD
                  </button>
                  <button
                    type="button"
                    aria-label="Show panel workspace"
                    className={workspaceMode === "panel" ? "is-active" : ""}
                    onClick={() => setWorkspaceMode("panel")}
                  >
                    Panel
                  </button>
                  <button
                    type="button"
                    aria-label="Show PLC workspace"
                    className={workspaceMode === "ladder" ? "is-active" : ""}
                    onClick={() => setWorkspaceMode("ladder")}
                  >
                    PLC
                  </button>
                </div>
                {workspaceMode === "cad" && (
                  <div className="mode-switch" role="group" aria-label="CAD view mode">
                    <button
                      type="button"
                      aria-label="Show schematic CAD view"
                      className={cadViewMode === "schematic" ? "is-active" : ""}
                      onClick={() => setCadViewMode("schematic")}
                    >
                      Schematic
                    </button>
                    <button
                      type="button"
                      aria-label="Show graph CAD view"
                      className={cadViewMode === "graph" ? "is-active" : ""}
                      onClick={() => setCadViewMode("graph")}
                    >
                      Graph
                    </button>
                  </div>
                )}
                <button type="button" onClick={loadEmptyProject}>New empty</button>
                <button type="button" onClick={reloadStarter}>Reload sample</button>
              </div>
            </div>

            <div className="canvas-card">
              {loading && (
                <div className="state-overlay">
                  <Gauge size={28} />
                  <strong>Loading project model</strong>
                  <span>Restoring semantic circuit data and panel placements.</span>
                </div>
              )}
              {isEmpty ? (
                <div className="empty-state">
                  <Component size={42} />
                  <h1>Start a sequence circuit</h1>
                  <p>Add IEC/KR control parts from the library to build a circuit, then validate and simulate it.</p>
                  <button type="button" onClick={reloadStarter}>Load starter circuit</button>
                </div>
              ) : workspaceMode === "panel" ? (
                <PanelWorkspace panelLayout={panelLayout} selectedId={selectedId} onSelect={setSelectedId} />
              ) : workspaceMode === "ladder" ? (
                <LadderWorkspace logicModel={logicModel} />
              ) : cadViewMode === "schematic" ? (
                <SchematicWorkspace model={model} snapshot={snapshot} selectedId={selectedId} onSelect={setSelectedId} />
              ) : (
                <ReactFlow
                  nodes={flow.nodes}
                  edges={flow.edges}
                  nodeTypes={reactFlowNodeTypes}
                  onNodesChange={onNodesChange}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => setSelectedId(node.id)}
                  fitView
                  fitViewOptions={{ padding: 0.18, maxZoom: 0.95 }}
                  snapToGrid
                  snapGrid={[20, 20]}
                  minZoom={0.35}
                  maxZoom={1.8}
                >
                  <Background color="#dbe4ee" gap={20} size={1} variant={BackgroundVariant.Dots} />
                  <Controls position="bottom-left" />
                  <MiniMap pannable zoomable position="bottom-right" nodeColor="#dbeafe" maskColor="rgba(248,250,252,.74)" />
                </ReactFlow>
              )}
            </div>

          <SimulationStrip
            snapshot={snapshot}
            history={simulationHistory}
            inputs={simulationInputs}
            timerDelayMs={timerDelayMs}
            onInputsChange={updateSimulationInputs}
            onStep={stepSimulation}
            onReset={resetSimulation}
          />
          </section>

          <aside className={`inspector-panel ${rightPanelOpen ? "" : "is-collapsed"}`}>
            <button className="panel-toggle right" type="button" onClick={() => setRightPanelOpen((open) => !open)} aria-label="Toggle inspector">
              {rightPanelOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            {rightPanelOpen && (
              <>
                <div className="panel-heading">
                  <Boxes size={17} />
                  <div>
                    <strong>Inspector</strong>
                    <span>{selectedComponent ? selectedComponent.reference : "No selection"}</span>
                  </div>
                </div>
                <div className="tabs">
                  {(["specs", "validation", "simulation"] as InspectorTab[]).map((tab) => (
                    <button key={tab} type="button" className={inspectorTab === tab ? "is-active" : ""} onClick={() => setInspectorTab(tab)}>
                      {tab}
                    </button>
                  ))}
                </div>
                {inspectorTab === "specs" && selectedComponent && selectedDefinition && (
                  <SpecsPanel
                    key={selectedComponent.id}
                    component={selectedComponent}
                    definition={selectedDefinition}
                    placement={selectedPlacement}
                    components={model.components}
                    conductors={model.conductors}
                    onAddConductor={addManualConductor}
                    onUpdateReference={updateSelectedReference}
                    onUpdateSetting={updateSelectedSetting}
                  />
                )}
                {inspectorTab === "validation" && (
                  <ValidationPanel findings={findings} error={validationError} selectedId={selectedComponent?.id} netlist={netlist} />
                )}
                {inspectorTab === "simulation" && <SimulationPanel snapshot={snapshot} findings={findings} analysis={electricalAnalysis} />}
              </>
            )}
          </aside>
        </main>
      </div>
    </ReactFlowProvider>
  );
}

function SchematicWorkspace({
  model,
  snapshot,
  selectedId,
  onSelect
}: {
  model: CircuitModel;
  snapshot?: SimulationSnapshot;
  selectedId?: string;
  onSelect: (componentId: string) => void;
}) {
  const byRef = new Map(model.components.map((component) => [component.reference, component]));
  const stateOf = (reference: string) => {
    const component = byRef.get(reference);
    return component ? snapshot?.componentStates[component.id] ?? component.state ?? "idle" : "idle";
  };
  const isClosed = (reference: string) => stateOf(reference) === "closed" || stateOf(reference) === "energized";
  const isEnergized = (reference: string) => stateOf(reference) === "energized";
  const netOn = (net: string) => snapshot?.energizedNets.includes(net) ?? false;
  const isSelected = (reference: string) => selectedId === byRef.get(reference)?.id;
  const select = (reference: string) => {
    const component = byRef.get(reference);
    if (component) onSelect(component.id);
  };

  return (
    <div className="schematic-workspace" aria-label="IEC sequence schematic CAD view">
      <div className="schematic-sheet">
        <svg viewBox="0 0 1040 650" role="img" aria-label="Motor start stop sequence schematic">
          <defs>
            <pattern id="schematic-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e6edf5" strokeWidth="1" />
            </pattern>
            <marker id="wire-dot" markerWidth="6" markerHeight="6" refX="3" refY="3">
              <circle cx="3" cy="3" r="2.4" fill="#172033" />
            </marker>
          </defs>
          <rect className="schematic-background" aria-hidden="true" width="1040" height="650" fill="#fbfdff" />
          <rect className="schematic-background" aria-hidden="true" width="1040" height="650" fill="url(#schematic-grid)" />
          {Array.from({ length: 12 }, (_, index) => (
            <text key={index} x={120 + index * 70} y="34" className="grid-label">{index + 1}</text>
          ))}
          {["A", "B", "C", "D", "E", "F"].map((label, index) => (
            <text key={label} x="28" y={92 + index * 88} className="grid-label">{label}</text>
          ))}
          <text x="68" y="56" className="schematic-title">IEC/KR Sequence CAD · Motor Start/Stop Seal-in Circuit</text>
          <text x="68" y="76" className="schematic-subtitle">Semantic circuit projection · energized paths update from simulation inputs</text>

          <line x1="72" y1="126" x2="72" y2="530" className={netOn("L24") ? "schematic-wire is-hot" : "schematic-wire"} />
          <line x1="948" y1="126" x2="948" y2="530" className="schematic-wire" />
          <text x="56" y="118" className="rail-label">L24</text>
          <text x="932" y="118" className="rail-label">N24</text>

          <SchematicWire d="M72 170 H142" energized={netOn("L24")} />
          <SchematicDevice reference="QF1" label="MCCB" x={142} y={170} kind="breaker" energized={isClosed("QF1")} selected={isSelected("QF1")} onSelect={() => select("QF1")} />
          <SchematicWire d="M182 170 H234" energized={netOn("L24")} />
          <SchematicDevice reference="FU1" label="Fuse 2A" x={234} y={170} kind="fuse" energized={isClosed("FU1")} selected={isSelected("FU1")} onSelect={() => select("FU1")} />
          <SchematicWire d="M274 170 H336" energized={netOn("L24-CONTROL")} />
          <SchematicContact reference="SB0" label="STOP NC" x={336} y={170} normallyClosed closed={isClosed("SB0")} selected={isSelected("SB0")} onSelect={() => select("SB0")} />
          <SchematicWire d="M386 170 H466" energized={netOn("STOP-CHAIN")} />
          <SchematicContact reference="SB1" label="START NO" x={466} y={170} closed={isClosed("SB1")} selected={isSelected("SB1")} onSelect={() => select("SB1")} />
          <SchematicWire d="M516 170 H760" energized={netOn("START-LATCH") || netOn("SEAL-IN")} />
          <SchematicCoil reference="K1" label="Relay coil" x={760} y={170} energized={isEnergized("K1")} selected={isSelected("K1")} onSelect={() => select("K1")} />
          <SchematicWire d="M820 170 H948" energized={isEnergized("K1")} />

          <SchematicWire d="M414 170 V258 H466" energized={netOn("SEAL-IN")} />
          <SchematicContact reference="K1.13" label="Seal-in NO" x={466} y={258} closed={isClosed("K1.13")} selected={isSelected("K1.13")} onSelect={() => select("K1.13")} />
          <SchematicWire d="M516 258 H610 V170" energized={netOn("SEAL-IN")} />

          <SchematicWire d="M72 354 H326" energized={isEnergized("K1")} />
          <SchematicContact reference="K1" label="K1 enabled" x={326} y={354} closed={isEnergized("K1")} selected={isSelected("K1")} onSelect={() => select("K1")} />
          <SchematicWire d="M376 354 H636" energized={isEnergized("K1")} />
          <SchematicTimer reference="KT1" x={636} y={354} elapsedMs={snapshot?.timerElapsedMs ?? 0} energized={isEnergized("KT1")} done={netOn("TIMER-DONE")} selected={isSelected("KT1")} onSelect={() => select("KT1")} />
          <SchematicWire d="M708 354 H948" energized={isEnergized("KT1")} />

          <SchematicWire d="M72 478 H330" energized={netOn("TIMER-DONE")} />
          <SchematicContact reference="KT1" label="TON done" x={330} y={478} closed={netOn("TIMER-DONE")} selected={isSelected("KT1")} onSelect={() => select("KT1")} />
          <SchematicWire d="M380 478 H520" energized={netOn("TIMER-DONE")} />
          <SchematicCoil reference="Y0" label="PLC output stub" x={520} y={478} energized={isEnergized("Y0")} selected={isSelected("Y0")} onSelect={() => select("Y0")} />
          <SchematicWire d="M580 478 H702" energized={netOn("PLC-Y0")} />
          <SchematicLamp reference="HL1" x={702} y={478} energized={isEnergized("HL1")} selected={isSelected("HL1")} onSelect={() => select("HL1")} />
          <SchematicWire d="M748 478 H948" energized={netOn("PLC-Y0")} />

          <g className="schematic-legend">
            <circle cx="72" cy="594" r="6" className="legend-hot" />
            <text x="86" y="599">Energized path</text>
            <circle cx="232" cy="594" r="6" className="legend-open" />
            <text x="246" y="599">Open or idle path</text>
            <text x="700" y="599">START {snapshot?.inputs.startPressed ? "closed" : "open"} · STOP {snapshot?.inputs.stopPressed ? "open" : "closed"} · Timer {snapshot?.timerElapsedMs ?? 0} ms</text>
          </g>
        </svg>
      </div>
    </div>
  );
}

function SchematicWire({ d, energized }: { d: string; energized: boolean }) {
  return <path d={d} className={energized ? "schematic-wire is-hot" : "schematic-wire"} markerStart="url(#wire-dot)" markerEnd="url(#wire-dot)" />;
}

function SchematicDevice({
  reference,
  label,
  x,
  y,
  kind,
  energized,
  selected,
  onSelect
}: {
  reference: string;
  label: string;
  x: number;
  y: number;
  kind: "breaker" | "fuse";
  energized: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g className={`schematic-symbol ${energized ? "is-hot" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} tabIndex={0} role="button" aria-label={`${reference} ${label}`}>
      <rect x={x - 16} y={y - 21} width="48" height="42" rx="4" />
      {kind === "breaker" ? (
        <path d={`M${x - 6} ${y + 13} L${x + 16} ${y - 13}`} />
      ) : (
        <path d={`M${x - 4} ${y - 12} H${x + 14} M${x + 5} ${y - 12} V${y + 12} M${x - 4} ${y + 12} H${x + 14}`} />
      )}
      <text x={x + 2} y={y - 34} className="component-ref">{reference}</text>
      <text x={x + 2} y={y + 40} className="component-caption">{label}</text>
    </g>
  );
}

function SchematicContact({
  reference,
  label,
  x,
  y,
  normallyClosed = false,
  closed,
  selected,
  onSelect
}: {
  reference: string;
  label: string;
  x: number;
  y: number;
  normallyClosed?: boolean;
  closed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g className={`schematic-symbol ${closed ? "is-hot" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} tabIndex={0} role="button" aria-label={`${reference} ${label}`}>
      <rect className="schematic-hit-area" x={x - 18} y={y - 38} width="86" height="82" rx="8" />
      <line x1={x} y1={y - 22} x2={x} y2={y + 22} />
      <line x1={x + 50} y1={y - 22} x2={x + 50} y2={y + 22} />
      <line x1={x - 18} y1={y} x2={x} y2={y} />
      <line x1={x + 50} y1={y} x2={x + 68} y2={y} />
      <line x1={x + 8} y1={y + (closed ? 0 : 18)} x2={x + 42} y2={y - 18} />
      {normallyClosed && <line x1={x + 9} y1={y - 18} x2={x + 40} y2={y + 18} />}
      <text x={x + 25} y={y - 34} className="component-ref">{reference}</text>
      <text x={x + 25} y={y + 42} className="component-caption">{label}</text>
    </g>
  );
}

function SchematicCoil({
  reference,
  label,
  x,
  y,
  energized,
  selected,
  onSelect
}: {
  reference: string;
  label: string;
  x: number;
  y: number;
  energized: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g className={`schematic-symbol ${energized ? "is-hot" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} tabIndex={0} role="button" aria-label={`${reference} ${label}`}>
      <line x1={x - 18} y1={y} x2={x} y2={y} />
      <path d={`M${x} ${y - 22} C${x + 18} ${y - 22}, ${x + 18} ${y + 22}, ${x} ${y + 22} M${x + 42} ${y - 22} C${x + 24} ${y - 22}, ${x + 24} ${y + 22}, ${x + 42} ${y + 22}`} />
      <line x1={x + 42} y1={y} x2={x + 62} y2={y} />
      <text x={x + 21} y={y - 36} className="component-ref">{reference}</text>
      <text x={x + 21} y={y + 44} className="component-caption">{label}</text>
    </g>
  );
}

function SchematicTimer({
  reference,
  x,
  y,
  elapsedMs,
  energized,
  done,
  selected,
  onSelect
}: {
  reference: string;
  x: number;
  y: number;
  elapsedMs: number;
  energized: boolean;
  done: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g className={`schematic-symbol ${energized ? "is-hot" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} tabIndex={0} role="button" aria-label={`${reference} on-delay timer`}>
      <rect x={x - 10} y={y - 32} width="72" height="64" rx="6" />
      <text x={x + 26} y={y - 6} className="component-ref">TON</text>
      <text x={x + 26} y={y + 16} className="component-caption">{done ? "Q done" : `${elapsedMs} ms`}</text>
      <text x={x + 26} y={y - 46} className="component-ref">{reference}</text>
    </g>
  );
}

function SchematicLamp({
  reference,
  x,
  y,
  energized,
  selected,
  onSelect
}: {
  reference: string;
  x: number;
  y: number;
  energized: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <g className={`schematic-symbol ${energized ? "is-hot" : ""} ${selected ? "is-selected" : ""}`} onClick={onSelect} tabIndex={0} role="button" aria-label={`${reference} pilot lamp`}>
      <circle cx={x + 22} cy={y} r="22" />
      <line x1={x + 6} y1={y - 16} x2={x + 38} y2={y + 16} />
      <line x1={x + 6} y1={y + 16} x2={x + 38} y2={y - 16} />
      <text x={x + 22} y={y - 36} className="component-ref">{reference}</text>
      <text x={x + 22} y={y + 44} className="component-caption">Run lamp</text>
    </g>
  );
}

function PanelWorkspace({
  panelLayout,
  selectedId,
  onSelect
}: {
  panelLayout: PanelLayoutModel;
  selectedId?: string;
  onSelect: (componentId: string) => void;
}) {
  return (
    <div className="panel-workspace" aria-label="Mechanical panel layout">
      <div className="panel-layout-header">
        <div>
          <strong>Sequence Panel Fit</strong>
          <span>{panelLayout.standard} · {panelLayout.source}</span>
        </div>
        <div className="panel-metrics">
          <span>{panelLayout.rails.length} placement zones</span>
          <span>{panelLayout.warningCount} fit warnings</span>
          <span>max depth {panelLayout.totalDepthMm} mm</span>
        </div>
        <PanelTop size={18} />
      </div>
      <div className="enclosure-frame">
        <div className="wire-duct top">Wire duct · control wiring clearance</div>
        {panelLayout.rails.map((rail) => (
          <section key={rail.id} className={`panel-rail ${rail.id}`}>
            <div className="rail-title">
              <strong>{rail.label}</strong>
              <span>{rail.usedWidthMm.toFixed(0)} mm used · {rail.warningCount} warnings</span>
            </div>
            <div className="rail-track">
              {rail.items.map((item) => {
                const width = Math.max(44, item.widthMm * 2.2);
                const left = item.xMm * 2.2;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`panel-device ${item.status} ${selectedId === item.componentId ? "is-selected" : ""}`}
                    style={{ width, left }}
                    onClick={() => onSelect(item.componentId)}
                  >
                    <span className="panel-symbol">{item.symbol}</span>
                    <strong>{item.reference}</strong>
                    <small>{item.widthMm}w x {item.depthMm}d mm</small>
                    <em>{item.mount}</em>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div className="wire-duct bottom">Terminal routes · field cable separation</div>
      </div>
      {panelLayout.unplaced.length > 0 && (
        <div className="unplaced-bin">
          <strong>Unplaced parts</strong>
          {panelLayout.unplaced.map((item) => (
            <span key={item.id}>{item.reference} · {item.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function LadderWorkspace({ logicModel }: { logicModel: LogicModel }) {
  if (logicModel.rungs.length === 0) {
    return (
      <div className="ladder-workspace">
        <div className="soft-empty">No ladder rungs can be projected until the circuit has control components.</div>
      </div>
    );
  }

  return (
    <div className="ladder-workspace" aria-label="PLC ladder logic projection">
      <div className="ladder-header">
        <div>
          <strong>PLC Ladder Projection</strong>
          <span>{logicModel.standard} · {logicModel.source}</span>
        </div>
        <Rows3 size={18} />
      </div>
      <div className="ladder-rails">
        <span>L</span>
        <span>N</span>
      </div>
      <div className="rung-list">
        {logicModel.rungs.map((rung) => (
          <article key={rung.id} className={`ladder-rung ${rung.energized ? "is-energized" : ""}`}>
            <div className="rung-meta">
              <strong>{rung.label}</strong>
              <span>{rung.description}</span>
            </div>
            <div className="rung-diagram">
              <div className="rail left" />
              <div className="logic-path">
                {rung.inputs.map((element) => (
                  <LogicContact key={element.id} element={element} />
                ))}
                {rung.sealIn && (
                  <div className="parallel-branch">
                    <span className="branch-line" />
                    <LogicContact element={rung.sealIn} compact />
                    <span className="branch-line" />
                  </div>
                )}
              </div>
              <LogicOutput element={rung.output} />
              <div className="rail right" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function LogicContact({ element, compact = false }: { element: LogicElement; compact?: boolean }) {
  return (
    <div className={`logic-contact ${element.energized ? "is-energized" : ""} ${compact ? "is-compact" : ""}`}>
      <span className="contact-symbol">{element.contactType === "NC" ? "--|/|--" : "--| |--"}</span>
      <strong>{element.reference}</strong>
      <small>{element.address} · {element.label}</small>
    </div>
  );
}

function LogicOutput({ element }: { element: LogicElement }) {
  const symbol = element.role === "timer" ? "TON" : element.role === "plc-output" ? "( )" : "(L)";
  return (
    <div className={`logic-output ${element.energized ? "is-energized" : ""}`}>
      <span className="coil-symbol">{symbol}</span>
      <strong>{element.reference}</strong>
      <small>{element.address} · {element.label}</small>
    </div>
  );
}

function SpecsPanel({
  component,
  definition,
  placement,
  components,
  conductors,
  onAddConductor,
  onUpdateReference,
  onUpdateSetting
}: {
  component: CircuitComponent;
  definition: ComponentDefinition;
  placement?: { rail: string; xMm: number; yMm: number };
  components: CircuitComponent[];
  conductors: CircuitModel["conductors"];
  onAddConductor: (input: AddConductorInput) => void;
  onUpdateReference: (componentId: string, reference: string) => void;
  onUpdateSetting: (componentId: string, key: string, value: string | number | boolean) => void;
}) {
  const firstTarget = components.find((item) => item.id !== component.id) ?? component;
  const [sourceTerminal, setSourceTerminal] = useState(definition.terminals[0]?.id ?? "");
  const [targetComponentId, setTargetComponentId] = useState(firstTarget.id);
  const targetComponent = components.find((item) => item.id === targetComponentId) ?? firstTarget;
  const targetDefinition = findDefinition(targetComponent.definitionId);
  const [targetTerminal, setTargetTerminal] = useState(targetDefinition.terminals[0]?.id ?? "");
  const [netName, setNetName] = useState(`${component.reference}-${targetComponent.reference}`);
  const [wiringError, setWiringError] = useState<string | null>(null);
  const selectedConductors = conductors.filter((conductor) => conductor.from === component.id || conductor.to === component.id);
  const referenceById = new Map(components.map((item) => [item.id, item.reference]));

  const updateTargetComponent = (componentId: string) => {
    const nextTarget = components.find((item) => item.id === componentId);
    if (!nextTarget) return;
    const nextDefinition = findDefinition(nextTarget.definitionId);
    setTargetComponentId(componentId);
    setTargetTerminal(nextDefinition.terminals[0]?.id ?? "");
    setNetName(`${component.reference}-${nextTarget.reference}`);
  };

  const submitConductor = () => {
    try {
      onAddConductor({
        fromComponentId: component.id,
        fromTerminal: sourceTerminal,
        toComponentId: targetComponent.id,
        toTerminal: targetTerminal,
        net: netName
      });
      setWiringError(null);
    } catch (error) {
      setWiringError(error instanceof Error ? error.message : "Unable to add conductor");
    }
  };

  return (
    <div className="panel-content">
      <div className="selected-card">
        <span className="catalog-symbol large">{definition.symbol}</span>
        <div>
          <h2>{component.reference}</h2>
          <p>{definition.name}</p>
        </div>
      </div>
      <dl className="spec-grid">
        <div>
          <dt>Reference</dt>
          <dd>
            <input
              aria-label="Reference designation"
              className="reference-input"
              value={component.reference}
              onChange={(event) => {
                if (event.target.value.trim()) {
                  onUpdateReference(component.id, event.target.value);
                }
              }}
            />
          </dd>
        </div>
        <div>
          <dt>Rated voltage</dt>
          <dd>{definition.ratings.ratedVoltageVac ?? definition.ratings.coilVoltageVac ?? 24} VAC</dd>
        </div>
        <div>
          <dt>Rated current</dt>
          <dd>{definition.ratings.ratedCurrentA ?? definition.ratings.contactCurrentA ?? 0.5} A</dd>
        </div>
        <div>
          <dt>Envelope</dt>
          <dd>{definition.mechanical.widthMm} x {definition.mechanical.heightMm} x {definition.mechanical.depthMm} mm</dd>
        </div>
        <div>
          <dt>Mount</dt>
          <dd>{definition.mechanical.mount}</dd>
        </div>
        <div>
          <dt>Panel fit</dt>
          <dd>{placement ? `${railLabels[placement.rail]} @ ${placement.xMm} mm` : "Not placed"}</dd>
        </div>
        {definition.kind === "timer" && (
          <div>
            <dt>Timer delay</dt>
            <dd>
              <input
                aria-label="Timer delay milliseconds"
                className="reference-input"
                type="number"
                min="250"
                max="600000"
                step="250"
                value={Number(component.settings?.delayMs ?? 3000)}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  if (Number.isFinite(nextValue)) {
                    onUpdateSetting(component.id, "delayMs", nextValue);
                  }
                }}
              />
              <small className="field-hint">ms · deterministic step simulation</small>
            </dd>
          </div>
        )}
      </dl>
      <div className="terminal-list">
        <strong>Terminal map</strong>
        {definition.terminals.map((terminal) => (
          <span key={terminal.id}>
            {terminal.label}
            <small>{terminal.role}</small>
          </span>
        ))}
      </div>
      <div className="wiring-editor" aria-label="Terminal wiring editor">
        <div className="wiring-header">
          <strong>Wire selected terminals</strong>
          <span>{component.reference} as source</span>
        </div>
        {wiringError && <div className="inline-error">{wiringError}</div>}
        <div className="wiring-grid">
          <label>
            <span>Source terminal</span>
            <select aria-label="Source terminal" value={sourceTerminal} onChange={(event) => setSourceTerminal(event.target.value)}>
              {definition.terminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.label} · {terminal.role}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Target component</span>
            <select aria-label="Target component" value={targetComponentId} onChange={(event) => updateTargetComponent(event.target.value)}>
              {components
                .filter((item) => item.id !== component.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.reference} · {findDefinition(item.definitionId).name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Target terminal</span>
            <select aria-label="Target terminal" value={targetTerminal} onChange={(event) => setTargetTerminal(event.target.value)}>
              {targetDefinition.terminals.map((terminal) => (
                <option key={terminal.id} value={terminal.id}>
                  {terminal.label} · {terminal.role}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Net name</span>
            <input aria-label="Net name" value={netName} onChange={(event) => setNetName(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={submitConductor}>Add conductor</button>
      </div>
      <div className="conductor-list" aria-label="Selected component conductors">
        <strong>Conductor list</strong>
        {selectedConductors.length === 0 ? (
          <div className="soft-empty">No conductors touch this component yet.</div>
        ) : (
          selectedConductors.map((conductor) => (
            <span key={conductor.id}>
              <b>
                {referenceById.get(conductor.from)}:{conductor.fromTerminal} -&gt; {referenceById.get(conductor.to)}:{conductor.toTerminal}
              </b>
              <small>{conductor.net}</small>
            </span>
          ))
        )}
      </div>
      <p className="safety-note">Rule-based engineering aid. Results are not regulatory certification or guaranteed safety approval.</p>
    </div>
  );
}

function ValidationPanel({
  findings,
  error,
  selectedId,
  netlist
}: {
  findings: ValidationFinding[];
  error: string | null;
  selectedId?: string;
  netlist: NetlistModel;
}) {
  const selectedFindings = findings.filter((finding) => !selectedId || finding.affectedObjectIds.includes(selectedId));
  const visibleFindings = selectedFindings.length > 0 ? selectedFindings : findings.slice(0, 6);
  const visibleNets = netlist.nets.slice(0, 8);
  const hasError = findings.some((finding) => finding.severity === "error");

  return (
    <div className="panel-content">
      {error && <div className="inline-error">{error}</div>}
      <div className={`validation-summary ${hasError ? "has-error" : ""}`}>
        <CheckCircle2 size={20} />
        <div>
          <strong>{hasError ? "Review required" : "Simulation-ready"}</strong>
          <span>{findings.length} rule findings from IEC/KR profile v0.1</span>
        </div>
      </div>
      <div className="finding-list">
        {visibleFindings.length === 0 ? (
          <div className="soft-empty">No findings for the selected component.</div>
        ) : (
          visibleFindings.map((finding) => (
            <article key={finding.id} className={`finding ${finding.severity}`}>
              <div>
                <strong>{finding.title}</strong>
                <span>{finding.ruleId}</span>
              </div>
              <p>{finding.explanation}</p>
              <small>{finding.suggestedFix}</small>
            </article>
          ))
        )}
      </div>
      <div className="netlist-topology" aria-label="Netlist topology">
        <div className="netlist-header">
          <strong>Netlist topology</strong>
          <span>{netlist.nets.length} nets · {netlist.terminalConflicts.length} naming warnings</span>
        </div>
        <div className="netlist-table">
          {visibleNets.map((net) => (
            <article key={net.id}>
              <div>
                <strong>{net.id}</strong>
                <span>{net.conductorIds.join(", ")}</span>
              </div>
              <p>
                {net.endpoints.map((endpoint) => `${endpoint.reference}:${endpoint.terminal}`).join(" · ")}
              </p>
            </article>
          ))}
        </div>
        {netlist.terminalConflicts.length > 0 && (
          <div className="net-conflict-list">
            {netlist.terminalConflicts.map((conflict) => (
              <span key={`${conflict.componentId}-${conflict.terminal}`}>
                {conflict.reference}:{conflict.terminal} · {conflict.nets.join(" / ")}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SimulationPanel({
  snapshot,
  findings,
  analysis
}: {
  snapshot?: SimulationSnapshot;
  findings: ValidationFinding[];
  analysis: ElectricalPathAnalysis;
}) {
  const hardFault = findings.some((finding) => finding.severity === "error");
  return (
    <div className="panel-content">
      <div className={`validation-summary ${hardFault ? "has-error" : ""}`}>
        <Activity size={20} />
        <div>
          <strong>{snapshot ? `Step ${snapshot.step} running` : "Simulation paused"}</strong>
          <span>{hardFault ? "Hard validation errors limit energization." : "Steady-state control behavior is being traced."}</span>
        </div>
      </div>
      <div className="net-list">
        <strong>Energized nets</strong>
        {(snapshot?.energizedNets ?? []).map((net) => (
          <span key={net}>{net}</span>
        ))}
        {!snapshot && <div className="soft-empty">Run or step the simulation to inspect energized paths.</div>}
      </div>
      <div className="reading-list">
        {(snapshot?.readings ?? []).map((reading) => (
          <div key={reading.id}>
            <span>{reading.label}</span>
            <strong>{reading.voltageVac.toFixed(0)} VAC · {reading.currentA.toFixed(2)} A</strong>
          </div>
        ))}
      </div>
      <div className="path-analysis" aria-label="Electrical path analysis">
        <div className="analysis-header">
          <strong>Electrical path analysis</strong>
          <span>{analysis.supplyVoltageVac} VAC · {analysis.totalDesignCurrentA.toFixed(2)} A design</span>
        </div>
        <div className="analysis-grid">
          <span>Supply</span>
          <strong>{analysis.supplyNetPresent ? "L24 present" : "L24 missing"}</strong>
          <span>Reference</span>
          <strong>{analysis.referenceNetPresent ? "N24 present" : "N24 missing"}</strong>
        </div>
        <div className="branch-list">
          {analysis.branches.map((branch) => (
            <article key={branch.id} className={`branch-card ${branch.status}`}>
              <div>
                <strong>{branch.label}</strong>
                <span>{branch.liveState} · {branch.path.join(" -> ")}</span>
              </div>
              <dl>
                <div>
                  <dt>Load</dt>
                  <dd>{branch.designCurrentA.toFixed(2)} A</dd>
                </div>
                <div>
                  <dt>Live</dt>
                  <dd>{branch.liveCurrentA.toFixed(2)} A</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd>{branch.weakestContactRatingA ? `${branch.weakestContactRatingA.toFixed(1)} A` : "n/a"}</dd>
                </div>
                <div>
                  <dt>Margin</dt>
                  <dd>{branch.marginA === undefined ? "n/a" : `${branch.marginA.toFixed(2)} A`}</dd>
                </div>
              </dl>
              <p>{branch.explanation}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimulationStrip({
  snapshot,
  history,
  inputs,
  timerDelayMs,
  onInputsChange,
  onStep,
  onReset
}: {
  snapshot?: SimulationSnapshot;
  history: SimulationSnapshot[];
  inputs: SimulationInputs;
  timerDelayMs: number;
  onInputsChange: (inputs: SimulationInputs) => void;
  onStep: () => void;
  onReset: () => void;
}) {
  const timerProgress = snapshot ? Math.min((snapshot.timerElapsedMs / timerDelayMs) * 100, 100) : 0;
  const timelineSteps = history.length > 0 ? history : snapshot ? [snapshot] : [];
  return (
    <div className="simulation-strip">
      <div className="strip-controls">
        <button
          type="button"
          className={inputs.startPressed ? "is-active" : ""}
          aria-pressed={inputs.startPressed}
          onClick={() => onInputsChange({ ...inputs, startPressed: !inputs.startPressed })}
        >
          <Play size={14} />
          START
        </button>
        <button
          type="button"
          className={`stop-button ${inputs.stopPressed ? "is-active" : ""}`}
          aria-pressed={inputs.stopPressed}
          onClick={() => onInputsChange({ ...inputs, stopPressed: !inputs.stopPressed })}
        >
          <Square size={14} />
          STOP
        </button>
        <button type="button" onClick={onStep}>
          <StepForward size={16} />
          Step
        </button>
        <button type="button" onClick={onReset}>
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
      <div className="timeline">
        <span aria-label="Timer progress" style={{ width: `${timerProgress}%` }} />
      </div>
      <div className="strip-readings">
        <span>START {inputs.startPressed ? "closed" : "open"}</span>
        <span>STOP {inputs.stopPressed ? "open" : "closed"}</span>
        <span>Timer {snapshot ? `${snapshot.timerElapsedMs} ms` : "idle"}</span>
        {(snapshot?.readings ?? []).slice(0, 3).map((reading) => (
          <span key={reading.id}>{reading.label}: {reading.voltageVac.toFixed(0)} VAC / {reading.currentA.toFixed(2)} A</span>
        ))}
        {!snapshot && <span>Simulation idle</span>}
      </div>
      <div className="signal-monitor" aria-label="Simulation signal timeline">
        <div className="signal-table">
          <div className="signal-header">
            <span>Active States ({timelineSteps.length})</span>
            <span>Voltage</span>
            <span>Current</span>
          </div>
          {signalRows.slice(0, 5).map((row) => {
            const active = snapshot ? signalActive(snapshot, row.key) : false;
            const reading =
              row.key === "k1"
                ? snapshot?.readings.find((item) => item.id === "r-k1")
                : row.key === "y0" || row.key === "hl1"
                  ? snapshot?.readings.find((item) => item.id === "r-y0")
                  : undefined;
            return (
              <div key={row.key} className={`signal-row ${active ? "is-active" : ""}`}>
                <span>{row.label}</span>
                <strong>{reading ? `${reading.voltageVac.toFixed(0)} V` : active ? "24 V" : "0 V"}</strong>
                <em>{reading ? `${reading.currentA.toFixed(2)} A` : active ? "on" : "off"}</em>
              </div>
            );
          })}
        </div>
        <div className="signal-timeline">
          <div className="timeline-axis">
            {timelineSteps.map((item) => (
              <span key={item.step}>{item.timestampMs / 1000}s</span>
            ))}
          </div>
          {signalRows.map((row) => (
            <div key={row.key} className="timeline-row">
              <span>{row.label}</span>
              <div>
                {timelineSteps.map((item) => (
                  <i
                    key={`${row.key}-${item.step}`}
                    className={signalActive(item, row.key) ? "is-active" : ""}
                    title={`${row.label} step ${item.step}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
