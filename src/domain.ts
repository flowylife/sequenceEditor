export type StandardsProfile = "IEC_KR_INDUSTRIAL";

export type Severity = "info" | "warning" | "error";

export type ComponentKind =
  | "supply"
  | "protective"
  | "relay-coil"
  | "relay-contact"
  | "timer"
  | "contactor"
  | "pushbutton"
  | "limit-switch"
  | "plc-input"
  | "plc-output"
  | "terminal-block"
  | "load";

export interface ElectricalRatings {
  ratedVoltageVac?: number;
  coilVoltageVac?: number;
  ratedCurrentA?: number;
  contactCurrentA?: number;
  burdenVa?: number;
}

export interface MechanicalEnvelope {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  mount: "din-rail" | "panel" | "inline" | "virtual";
  clearanceMm: number;
}

export interface TerminalDefinition {
  id: string;
  label: string;
  role: "line" | "neutral" | "control" | "coil" | "contact" | "io";
}

export interface ComponentDefinition {
  id: string;
  name: string;
  kind: ComponentKind;
  symbol: string;
  terminals: TerminalDefinition[];
  ratings: ElectricalRatings;
  mechanical: MechanicalEnvelope;
  description: string;
}

export interface CircuitComponent {
  id: string;
  definitionId: string;
  reference: string;
  x: number;
  y: number;
  state?: "open" | "closed" | "energized" | "idle";
  settings?: Record<string, string | number | boolean>;
}

export interface Conductor {
  id: string;
  from: string;
  fromTerminal: string;
  to: string;
  toTerminal: string;
  net: string;
}

export interface AddConductorInput {
  fromComponentId: string;
  fromTerminal: string;
  toComponentId: string;
  toTerminal: string;
  net: string;
}

export interface UpdateComponentReferenceInput {
  componentId: string;
  reference: string;
}

export interface PanelPlacement {
  componentId: string;
  rail: "control-rail" | "terminal-rail" | "virtual";
  xMm: number;
  yMm: number;
}

export interface CircuitModel {
  components: CircuitComponent[];
  conductors: Conductor[];
  panelPlacements: PanelPlacement[];
}

export interface CircuitProject {
  id: string;
  name: string;
  ownerId: string;
  activeRevision: number;
  standardsProfile: StandardsProfile;
  updatedAt: string;
  model: CircuitModel;
}

export interface ValidationFinding {
  id: string;
  severity: Severity;
  ruleId: string;
  affectedObjectIds: string[];
  title: string;
  explanation: string;
  suggestedFix: string;
}

export interface SimulationInputs {
  startPressed: boolean;
  stopPressed: boolean;
}

export interface SimulationSnapshot {
  step: number;
  timestampMs: number;
  mode: "stopped" | "running" | "paused";
  inputs: SimulationInputs;
  timerElapsedMs: number;
  energizedNets: string[];
  componentStates: Record<string, "open" | "closed" | "energized" | "idle">;
  readings: Array<{
    id: string;
    label: string;
    voltageVac: number;
    currentA: number;
  }>;
}

export interface LogicElement {
  id: string;
  componentId: string;
  reference: string;
  label: string;
  role: "contact" | "coil" | "timer" | "plc-output" | "load";
  contactType?: "NO" | "NC";
  address?: string;
  energized: boolean;
}

export interface LogicRung {
  id: string;
  label: string;
  description: string;
  inputs: LogicElement[];
  sealIn?: LogicElement;
  output: LogicElement;
  energized: boolean;
}

export interface LogicModel {
  id: string;
  language: "ladder";
  standard: "IEC_61131_3_LD";
  source: "semantic-circuit-projection";
  rungs: LogicRung[];
}

export interface PanelLayoutItem {
  id: string;
  componentId: string;
  reference: string;
  name: string;
  symbol: string;
  mount: MechanicalEnvelope["mount"];
  rail: PanelPlacement["rail"];
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  clearanceMm: number;
  status: "ok" | "warning" | "missing-placement";
}

export interface PanelRailLayout {
  id: PanelPlacement["rail"];
  label: string;
  items: PanelLayoutItem[];
  usedWidthMm: number;
  warningCount: number;
}

export interface PanelLayoutModel {
  id: string;
  standard: "IEC_KR_PANEL_FIT";
  source: "semantic-circuit-placement";
  rails: PanelRailLayout[];
  unplaced: PanelLayoutItem[];
  warningCount: number;
  totalDepthMm: number;
}

export interface ElectricalLoadBranch {
  id: string;
  label: string;
  description: string;
  componentIds: string[];
  path: string[];
  requiredVoltageVac: number;
  designCurrentA: number;
  liveCurrentA: number;
  protectiveRatingA?: number;
  weakestContactRatingA?: number;
  marginA?: number;
  liveState: "active" | "available" | "idle" | "blocked";
  status: "ok" | "warning" | "error";
  explanation: string;
}

export interface ElectricalPathAnalysis {
  id: string;
  standard: "IEC_KR_STEADY_STATE_RULES";
  source: "semantic-circuit-analysis";
  supplyVoltageVac: number;
  supplyNetPresent: boolean;
  referenceNetPresent: boolean;
  totalDesignCurrentA: number;
  totalLiveCurrentA: number;
  branches: ElectricalLoadBranch[];
  warningCount: number;
  errorCount: number;
}

export interface NetEndpoint {
  componentId: string;
  reference: string;
  terminal: string;
  role: TerminalDefinition["role"];
  conductorIds: string[];
}

export interface NetTerminalConflict {
  componentId: string;
  reference: string;
  terminal: string;
  nets: string[];
  conductorIds: string[];
}

export interface NetTopology {
  id: string;
  conductorIds: string[];
  endpoints: NetEndpoint[];
}

export interface NetlistModel {
  id: string;
  source: "semantic-circuit-conductors";
  nets: NetTopology[];
  terminalConflicts: NetTerminalConflict[];
}

export const componentCatalog: ComponentDefinition[] = [
  {
    id: "mccb-2p-240",
    name: "MCCB 2P 240 VAC",
    kind: "protective",
    symbol: "QF",
    terminals: [
      { id: "L1", label: "L1", role: "line" },
      { id: "T1", label: "T1", role: "line" }
    ],
    ratings: { ratedVoltageVac: 240, ratedCurrentA: 10 },
    mechanical: { widthMm: 36, heightMm: 82, depthMm: 74, mount: "din-rail", clearanceMm: 8 },
    description: "Protective device for control power isolation."
  },
  {
    id: "control-fuse-2a",
    name: "Control Fuse 2 A",
    kind: "protective",
    symbol: "FU",
    terminals: [
      { id: "1", label: "1", role: "line" },
      { id: "2", label: "2", role: "line" }
    ],
    ratings: { ratedVoltageVac: 250, ratedCurrentA: 2 },
    mechanical: { widthMm: 18, heightMm: 72, depthMm: 60, mount: "din-rail", clearanceMm: 6 },
    description: "Branch protection for relay and PLC control circuits."
  },
  {
    id: "pb-start-no",
    name: "Start Pushbutton NO",
    kind: "pushbutton",
    symbol: "SB",
    terminals: [
      { id: "13", label: "13", role: "contact" },
      { id: "14", label: "14", role: "contact" }
    ],
    ratings: { ratedVoltageVac: 240, contactCurrentA: 3 },
    mechanical: { widthMm: 30, heightMm: 30, depthMm: 48, mount: "panel", clearanceMm: 10 },
    description: "Momentary normally-open control contact."
  },
  {
    id: "pb-stop-nc",
    name: "Stop Pushbutton NC",
    kind: "pushbutton",
    symbol: "SB",
    terminals: [
      { id: "21", label: "21", role: "contact" },
      { id: "22", label: "22", role: "contact" }
    ],
    ratings: { ratedVoltageVac: 240, contactCurrentA: 3 },
    mechanical: { widthMm: 30, heightMm: 30, depthMm: 48, mount: "panel", clearanceMm: 10 },
    description: "Momentary normally-closed stop contact."
  },
  {
    id: "relay-coil-24vac",
    name: "Control Relay Coil 24 VAC",
    kind: "relay-coil",
    symbol: "K",
    terminals: [
      { id: "A1", label: "A1", role: "coil" },
      { id: "A2", label: "A2", role: "coil" }
    ],
    ratings: { coilVoltageVac: 24, burdenVa: 6, ratedCurrentA: 0.25 },
    mechanical: { widthMm: 14, heightMm: 78, depthMm: 74, mount: "din-rail", clearanceMm: 6 },
    description: "Relay coil used by sequence contacts and interlocks."
  },
  {
    id: "relay-contact-no",
    name: "Auxiliary Contact NO",
    kind: "relay-contact",
    symbol: "K",
    terminals: [
      { id: "13", label: "13", role: "contact" },
      { id: "14", label: "14", role: "contact" }
    ],
    ratings: { ratedVoltageVac: 240, contactCurrentA: 3 },
    mechanical: { widthMm: 8, heightMm: 70, depthMm: 64, mount: "din-rail", clearanceMm: 4 },
    description: "Normally-open relay contact linked to a relay coil."
  },
  {
    id: "timer-on-delay",
    name: "On-delay Timer 24 VAC",
    kind: "timer",
    symbol: "KT",
    terminals: [
      { id: "A1", label: "A1", role: "coil" },
      { id: "A2", label: "A2", role: "coil" },
      { id: "15", label: "15", role: "contact" },
      { id: "18", label: "18", role: "contact" }
    ],
    ratings: { coilVoltageVac: 24, contactCurrentA: 3, burdenVa: 7 },
    mechanical: { widthMm: 22, heightMm: 82, depthMm: 76, mount: "din-rail", clearanceMm: 8 },
    description: "Timer relay for delayed sequence actions."
  },
  {
    id: "contactor-9a",
    name: "Contactor 9 A Coil 24 VAC",
    kind: "contactor",
    symbol: "KM",
    terminals: [
      { id: "A1", label: "A1", role: "coil" },
      { id: "A2", label: "A2", role: "coil" },
      { id: "1L1", label: "1L1", role: "line" },
      { id: "2T1", label: "2T1", role: "line" }
    ],
    ratings: { coilVoltageVac: 24, ratedCurrentA: 9, burdenVa: 9 },
    mechanical: { widthMm: 45, heightMm: 85, depthMm: 86, mount: "din-rail", clearanceMm: 10 },
    description: "Motor/control contactor with 24 VAC control coil."
  },
  {
    id: "limit-switch-nc",
    name: "Limit Switch NC",
    kind: "limit-switch",
    symbol: "LS",
    terminals: [
      { id: "21", label: "21", role: "contact" },
      { id: "22", label: "22", role: "contact" }
    ],
    ratings: { ratedVoltageVac: 240, contactCurrentA: 3 },
    mechanical: { widthMm: 32, heightMm: 66, depthMm: 28, mount: "panel", clearanceMm: 10 },
    description: "Machine limit switch for permissive or interlock chains."
  },
  {
    id: "plc-input-8",
    name: "PLC DI 8 Channel",
    kind: "plc-input",
    symbol: "X",
    terminals: [
      { id: "COM", label: "COM", role: "io" },
      { id: "X0", label: "X0", role: "io" }
    ],
    ratings: { ratedVoltageVac: 24, ratedCurrentA: 0.01 },
    mechanical: { widthMm: 55, heightMm: 90, depthMm: 70, mount: "din-rail", clearanceMm: 10 },
    description: "PLC digital input module for field contact state."
  },
  {
    id: "plc-output-8",
    name: "PLC DO 8 Channel",
    kind: "plc-output",
    symbol: "Y",
    terminals: [
      { id: "COM", label: "COM", role: "io" },
      { id: "Y0", label: "Y0", role: "io" }
    ],
    ratings: { ratedVoltageVac: 24, ratedCurrentA: 0.5 },
    mechanical: { widthMm: 55, heightMm: 90, depthMm: 70, mount: "din-rail", clearanceMm: 10 },
    description: "PLC output module that can drive relay or contactor coils."
  },
  {
    id: "terminal-block",
    name: "Terminal Block 2.5 mm2",
    kind: "terminal-block",
    symbol: "XT",
    terminals: [
      { id: "1", label: "1", role: "control" },
      { id: "2", label: "2", role: "control" }
    ],
    ratings: { ratedVoltageVac: 300, ratedCurrentA: 16 },
    mechanical: { widthMm: 5, heightMm: 48, depthMm: 48, mount: "din-rail", clearanceMm: 2 },
    description: "Pass-through terminal for panel boundary wiring."
  },
  {
    id: "pilot-lamp-24vac",
    name: "Pilot Lamp 24 VAC",
    kind: "load",
    symbol: "HL",
    terminals: [
      { id: "X1", label: "X1", role: "control" },
      { id: "X2", label: "X2", role: "control" }
    ],
    ratings: { ratedVoltageVac: 24, ratedCurrentA: 0.03 },
    mechanical: { widthMm: 30, heightMm: 30, depthMm: 42, mount: "panel", clearanceMm: 8 },
    description: "Panel indicator load for simulation visibility."
  }
];

export function findDefinition(id: string): ComponentDefinition {
  const definition = componentCatalog.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown component definition: ${id}`);
  }
  return definition;
}

export function createStarterProject(): CircuitProject {
  const now = new Date().toISOString();
  return {
    id: "project-seq-001",
    name: "Motor Start Sequence - Panel A",
    ownerId: "single-user",
    activeRevision: 1,
    standardsProfile: "IEC_KR_INDUSTRIAL",
    updatedAt: now,
    model: {
      components: [
        { id: "c-qf1", definitionId: "mccb-2p-240", reference: "QF1", x: 60, y: 120, state: "closed" },
        { id: "c-fu1", definitionId: "control-fuse-2a", reference: "FU1", x: 165, y: 120, state: "closed" },
        { id: "c-sb0", definitionId: "pb-stop-nc", reference: "SB0", x: 270, y: 120, state: "closed" },
        { id: "c-sb1", definitionId: "pb-start-no", reference: "SB1", x: 375, y: 120, state: "closed" },
        { id: "c-k1", definitionId: "relay-coil-24vac", reference: "K1", x: 540, y: 120, state: "energized" },
        { id: "c-k1a", definitionId: "relay-contact-no", reference: "K1.13", x: 375, y: 220, state: "closed" },
        { id: "c-kt1", definitionId: "timer-on-delay", reference: "KT1", x: 540, y: 250, state: "energized", settings: { delayMs: 3000 } },
        { id: "c-y0", definitionId: "plc-output-8", reference: "Y0", x: 165, y: 340, state: "energized" },
        { id: "c-hl1", definitionId: "pilot-lamp-24vac", reference: "HL1", x: 540, y: 360, state: "energized" }
      ],
      conductors: [
        { id: "w1", from: "c-qf1", fromTerminal: "T1", to: "c-fu1", toTerminal: "1", net: "L24" },
        { id: "w2", from: "c-fu1", fromTerminal: "2", to: "c-sb0", toTerminal: "21", net: "L24-CONTROL" },
        { id: "w3", from: "c-sb0", fromTerminal: "22", to: "c-sb1", toTerminal: "13", net: "STOP-CHAIN" },
        { id: "w4", from: "c-sb1", fromTerminal: "14", to: "c-k1", toTerminal: "A1", net: "START-LATCH" },
        { id: "w5", from: "c-k1a", fromTerminal: "14", to: "c-k1", toTerminal: "A1", net: "SEAL-IN" },
        { id: "w6", from: "c-k1", fromTerminal: "A2", to: "c-kt1", toTerminal: "A2", net: "N24" },
        { id: "w7", from: "c-y0", fromTerminal: "Y0", to: "c-hl1", toTerminal: "X1", net: "PLC-Y0" },
        { id: "w8", from: "c-hl1", fromTerminal: "X2", to: "c-kt1", toTerminal: "A2", net: "N24" },
        { id: "w9", from: "c-k1", fromTerminal: "A1", to: "c-kt1", toTerminal: "A1", net: "START-LATCH" }
      ],
      panelPlacements: [
        { componentId: "c-qf1", rail: "control-rail", xMm: 12, yMm: 0 },
        { componentId: "c-fu1", rail: "control-rail", xMm: 56, yMm: 0 },
        { componentId: "c-k1", rail: "control-rail", xMm: 84, yMm: 0 },
        { componentId: "c-kt1", rail: "control-rail", xMm: 100, yMm: 0 },
        { componentId: "c-y0", rail: "control-rail", xMm: 128, yMm: 0 },
        { componentId: "c-sb0", rail: "virtual", xMm: 0, yMm: 120 },
        { componentId: "c-sb1", rail: "virtual", xMm: 42, yMm: 120 },
        { componentId: "c-hl1", rail: "virtual", xMm: 84, yMm: 120 }
      ]
    }
  };
}

export function validateCircuit(model: CircuitModel): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const componentById = new Map(model.components.map((component) => [component.id, component]));
  const conductorKeys = new Set<string>();
  const connectedTerminals = new Set<string>();
  const electricalAnalysis = analyzeElectricalPaths(model);
  const netlist = buildNetlist(model);

  for (const conductor of model.conductors) {
    const from = componentById.get(conductor.from);
    const to = componentById.get(conductor.to);
    if (!from || !to) {
      findings.push({
        id: `missing-component-${conductor.id}`,
        severity: "error",
        ruleId: "CONDUCTOR_COMPONENT_EXISTS",
        affectedObjectIds: [conductor.id],
        title: "Wire references a missing component",
        explanation: "Every conductor endpoint must reference an existing component instance.",
        suggestedFix: "Reconnect or delete the orphan conductor."
      });
      continue;
    }

    const fromTerminal = findDefinition(from.definitionId).terminals.find((terminal) => terminal.id === conductor.fromTerminal);
    const toTerminal = findDefinition(to.definitionId).terminals.find((terminal) => terminal.id === conductor.toTerminal);
    if (!fromTerminal || !toTerminal) {
      findings.push({
        id: `invalid-terminal-${conductor.id}`,
        severity: "error",
        ruleId: "TERMINAL_EXISTS",
        affectedObjectIds: [conductor.id, from.id, to.id],
        title: "Wire endpoint uses an invalid terminal",
        explanation: "Terminal identifiers must match the selected component definition.",
        suggestedFix: "Choose a terminal from the component terminal map."
      });
      continue;
    }

    connectedTerminals.add(`${from.id}:${fromTerminal.id}`);
    connectedTerminals.add(`${to.id}:${toTerminal.id}`);

    const rolePair = [fromTerminal.role, toTerminal.role].sort().join("/");
    if (rolePair === "coil/line" || rolePair === "io/line") {
      findings.push({
        id: `role-mismatch-${conductor.id}`,
        severity: "warning",
        ruleId: "TERMINAL_ROLE_COMPATIBILITY",
        affectedObjectIds: [conductor.id, from.id, to.id],
        title: "Terminal role should be reviewed",
        explanation: "A power-line terminal is directly tied to a coil or PLC I/O terminal.",
        suggestedFix: "Route through a control contact, fuse, terminal block, or documented interface."
      });
    }

    const key = [conductor.from, conductor.fromTerminal, conductor.to, conductor.toTerminal].sort().join(":");
    if (conductorKeys.has(key)) {
      findings.push({
        id: `duplicate-wire-${conductor.id}`,
        severity: "warning",
        ruleId: "DUPLICATE_CONDUCTOR",
        affectedObjectIds: [conductor.id],
        title: "Duplicate conductor path",
        explanation: "The same endpoints are wired more than once.",
        suggestedFix: "Keep one conductor unless a parallel conductor is intentional and documented."
      });
    }
    conductorKeys.add(key);
  }

  for (const component of model.components) {
    const definition = findDefinition(component.definitionId);
    for (const terminal of definition.terminals) {
      if (!connectedTerminals.has(`${component.id}:${terminal.id}`) && definition.kind !== "terminal-block") {
        findings.push({
          id: `floating-${component.id}-${terminal.id}`,
        severity: terminal.role === "coil" ? "error" : "info",
          ruleId: "TERMINAL_CONNECTED",
          affectedObjectIds: [component.id],
          title: `${component.reference} ${terminal.label} is not connected`,
          explanation: "Required electrical terminals should be wired before simulation results can be trusted.",
          suggestedFix: "Connect the terminal to the appropriate control net or mark it intentionally unused."
        });
  }
}

    if (definition.ratings.coilVoltageVac && definition.ratings.coilVoltageVac !== 24) {
      findings.push({
        id: `coil-voltage-${component.id}`,
        severity: "error",
        ruleId: "COIL_VOLTAGE_PROFILE",
        affectedObjectIds: [component.id],
        title: `${component.reference} coil voltage does not match the 24 VAC control profile`,
        explanation: "The selected IEC/KR profile expects 24 VAC control coils for this starter circuit.",
        suggestedFix: "Select a 24 VAC coil or change the project control-voltage profile."
      });
    }
  }

  const coilOwnerReferences = new Set(
    model.components
      .filter((component) => {
        const definition = findDefinition(component.definitionId);
        return definition.kind === "relay-coil" || definition.kind === "contactor" || definition.kind === "timer";
      })
      .map((component) => component.reference)
  );

  for (const component of model.components) {
    const definition = findDefinition(component.definitionId);
    if (definition.kind !== "relay-contact") {
      continue;
    }

    const ownerReference = component.reference.split(".")[0]?.trim();
    if (!ownerReference || !coilOwnerReferences.has(ownerReference)) {
      findings.push({
        id: `contact-owner-${component.id}`,
        severity: "error",
        ruleId: "CONTACT_COIL_BINDING",
        affectedObjectIds: [component.id],
        title: "Auxiliary contact is not bound to a coil",
        explanation: `${component.reference} references ${ownerReference || "no relay owner"}, but no matching relay coil, timer, or contactor exists in the semantic model.`,
        suggestedFix: "Rename the auxiliary contact to match an existing coil reference or add the missing relay/contactor coil."
      });
    }
  }

  for (const conflict of netlist.terminalConflicts) {
    const hasSupplyNet = conflict.nets.some((net) => net === "L24" || net.startsWith("L24-"));
    const hasReferenceNet = conflict.nets.includes("N24");
    if (hasSupplyNet && hasReferenceNet) {
      findings.push({
        id: `supply-reference-short-${conflict.componentId}-${conflict.terminal}`,
        severity: "error",
        ruleId: "SUPPLY_REFERENCE_SHORT",
        affectedObjectIds: [conflict.componentId, ...conflict.conductorIds],
        title: "Control supply is shorted to reference",
        explanation: `${conflict.reference}:${conflict.terminal} connects ${conflict.nets.join(", ")}. The 24 VAC supply and reference return must not share the same terminal node.`,
        suggestedFix: "Remove the shorting conductor or move the return connection to the correct N24 terminal path."
      });
      continue;
    }

    findings.push({
      id: `terminal-net-conflict-${conflict.componentId}-${conflict.terminal}`,
      severity: "warning",
      ruleId: "TERMINAL_NET_CONSISTENCY",
      affectedObjectIds: [conflict.componentId, ...conflict.conductorIds],
      title: `${conflict.reference} ${conflict.terminal} is assigned to multiple net labels`,
      explanation: `${conflict.reference}:${conflict.terminal} appears on ${conflict.nets.join(", ")}. This usually means one electrical node has inconsistent net names.`,
      suggestedFix: "Rename the connected conductors to one net label or add a documented terminal block/junction point."
    });
  }

  const contactLoads = model.components
    .map((component) => ({ component, definition: findDefinition(component.definitionId) }))
    .filter(({ definition }) => definition.kind === "relay-contact" || definition.kind === "pushbutton" || definition.kind === "limit-switch");
  for (const { component, definition } of contactLoads) {
    if ((definition.ratings.contactCurrentA ?? 0) < 1) {
      findings.push({
        id: `contact-load-${component.id}`,
        severity: "warning",
        ruleId: "CONTACT_LOAD_RATING",
        affectedObjectIds: [component.id],
        title: `${component.reference} has low contact current rating`,
        explanation: "Control contacts should be checked against downstream coil and indicator load current.",
        suggestedFix: "Use a contact rating above the calculated branch current with margin."
      });
    }
  }

  findings.push(...validatePanelFit(model));

  if (!electricalAnalysis.supplyNetPresent || !electricalAnalysis.referenceNetPresent) {
    findings.push({
      id: "supply-reference-missing",
      severity: "error",
      ruleId: "SUPPLY_REFERENCE_PRESENT",
      affectedObjectIds: [],
      title: "Control supply reference is incomplete",
      explanation: "The circuit needs both an L24 supply path and N24 reference path before simulation can be trusted.",
      suggestedFix: "Wire the protected control supply and neutral/reference return nets, then rerun validation."
    });
  }

  for (const branch of electricalAnalysis.branches) {
    if (branch.status === "ok") {
      continue;
    }

    findings.push({
      id: `electrical-load-${branch.id}`,
      severity: branch.status === "error" ? "error" : "warning",
      ruleId: branch.status === "error" ? "CONTACT_LOAD_MARGIN" : "PROTECTIVE_DEVICE_MARGIN",
      affectedObjectIds: branch.componentIds,
      title: `${branch.label} has insufficient electrical margin`,
      explanation: branch.explanation,
      suggestedFix: "Select devices with higher ratings, split the branch load, or revise the sequence circuit topology."
    });
  }
  return findings;
}

export function buildNetlist(model: CircuitModel): NetlistModel {
  const componentById = new Map(model.components.map((component) => [component.id, component]));
  const netMap = new Map<string, { conductorIds: Set<string>; endpoints: Map<string, NetEndpoint> }>();
  const terminalMap = new Map<string, { componentId: string; reference: string; terminal: string; nets: Set<string>; conductorIds: Set<string> }>();

  for (const conductor of model.conductors) {
    const from = componentById.get(conductor.from);
    const to = componentById.get(conductor.to);
    if (!from || !to) {
      continue;
    }

    const fromTerminal = findDefinition(from.definitionId).terminals.find((terminal) => terminal.id === conductor.fromTerminal);
    const toTerminal = findDefinition(to.definitionId).terminals.find((terminal) => terminal.id === conductor.toTerminal);
    if (!fromTerminal || !toTerminal) {
      continue;
    }

    const net = netMap.get(conductor.net) ?? { conductorIds: new Set<string>(), endpoints: new Map<string, NetEndpoint>() };
    net.conductorIds.add(conductor.id);

    for (const endpoint of [
      { component: from, terminal: fromTerminal },
      { component: to, terminal: toTerminal }
    ]) {
      const endpointKey = `${endpoint.component.id}:${endpoint.terminal.id}`;
      const existingEndpoint = net.endpoints.get(endpointKey);
      if (existingEndpoint) {
        existingEndpoint.conductorIds.push(conductor.id);
      } else {
        net.endpoints.set(endpointKey, {
          componentId: endpoint.component.id,
          reference: endpoint.component.reference,
          terminal: endpoint.terminal.id,
          role: endpoint.terminal.role,
          conductorIds: [conductor.id]
        });
      }

      const terminalEntry =
        terminalMap.get(endpointKey) ?? {
          componentId: endpoint.component.id,
          reference: endpoint.component.reference,
          terminal: endpoint.terminal.id,
          nets: new Set<string>(),
          conductorIds: new Set<string>()
        };
      terminalEntry.nets.add(conductor.net);
      terminalEntry.conductorIds.add(conductor.id);
      terminalMap.set(endpointKey, terminalEntry);
    }

    netMap.set(conductor.net, net);
  }

  return {
    id: "netlist-primary",
    source: "semantic-circuit-conductors",
    nets: [...netMap.entries()]
      .map(([id, net]) => ({
        id,
        conductorIds: [...net.conductorIds].sort(),
        endpoints: [...net.endpoints.values()].sort((first, second) => first.reference.localeCompare(second.reference) || first.terminal.localeCompare(second.terminal))
      }))
      .sort((first, second) => first.id.localeCompare(second.id)),
    terminalConflicts: [...terminalMap.values()]
      .filter((entry) => entry.nets.size > 1)
      .map((entry) => ({
        componentId: entry.componentId,
        reference: entry.reference,
        terminal: entry.terminal,
        nets: [...entry.nets].sort(),
        conductorIds: [...entry.conductorIds].sort()
      }))
  };
}

export function analyzeElectricalPaths(model: CircuitModel, snapshot?: SimulationSnapshot): ElectricalPathAnalysis {
  const supplyVoltageVac = 24;
  const nets = new Set(model.conductors.map((conductor) => conductor.net));
  const supplyNetPresent = nets.has("L24") || nets.has("L24-CONTROL");
  const referenceNetPresent = nets.has("N24");
  const componentByReference = new Map(model.components.map((component) => [component.reference, component]));
  const componentsByKind = model.components.map((component) => ({
    component,
    definition: findDefinition(component.definitionId)
  }));
  const protectiveRatingA = Math.min(
    ...componentsByKind
      .filter(({ definition }) => definition.kind === "protective" && definition.ratings.ratedCurrentA)
      .map(({ definition }) => definition.ratings.ratedCurrentA as number)
  );

  const branchLiveState = (activeNet: string, requiredRefs: string[]): ElectricalLoadBranch["liveState"] => {
    if (!supplyNetPresent || !referenceNetPresent) return "blocked";
    if (snapshot?.energizedNets.includes(activeNet)) return "active";
    if (requiredRefs.every((reference) => componentByReference.has(reference))) return "available";
    return "idle";
  };

  const componentIdsFor = (references: string[]) =>
    references.map((reference) => componentByReference.get(reference)?.id).filter((id): id is string => Boolean(id));

  const weakestContactRating = (references: string[]) => {
    const ratings = references
      .map((reference) => componentByReference.get(reference))
      .filter((component): component is CircuitComponent => Boolean(component))
      .map((component) => findDefinition(component.definitionId).ratings.contactCurrentA)
      .filter((rating): rating is number => typeof rating === "number");
    return ratings.length > 0 ? Math.min(...ratings) : undefined;
  };

  const loadCurrent = (reference: string) => {
    const component = componentByReference.get(reference);
    if (!component) return 0;
    const ratings = findDefinition(component.definitionId).ratings;
    if (ratings.ratedCurrentA) return ratings.ratedCurrentA;
    if (ratings.burdenVa) return ratings.burdenVa / supplyVoltageVac;
    return 0;
  };

  const makeBranch = (input: {
    id: string;
    label: string;
    description: string;
    path: string[];
    contactReferences: string[];
    loadReferences: string[];
    activeNet: string;
  }): ElectricalLoadBranch => {
    const designCurrentA = input.loadReferences.reduce((sum, reference) => sum + loadCurrent(reference), 0);
    const liveState = branchLiveState(input.activeNet, input.path);
    const liveCurrentA = liveState === "active" ? designCurrentA : 0;
    const weakestContactRatingA = weakestContactRating(input.contactReferences);
    const protectiveLimit = Number.isFinite(protectiveRatingA) ? protectiveRatingA : undefined;
    const protectiveMargin = protectiveLimit === undefined ? undefined : protectiveLimit - designCurrentA;
    const contactMargin = weakestContactRatingA === undefined ? undefined : weakestContactRatingA - designCurrentA;
    const marginA = Math.min(...[protectiveMargin, contactMargin].filter((margin): margin is number => typeof margin === "number"));
    const hasMissingSupply = !supplyNetPresent || !referenceNetPresent;
    const hasContactOverload = contactMargin !== undefined && contactMargin < 0;
    const hasProtectionOverload = protectiveMargin !== undefined && protectiveMargin < 0;
    const hasLowMargin = !hasContactOverload && !hasProtectionOverload && marginA !== undefined && marginA < 0.2;
    const status: ElectricalLoadBranch["status"] = hasMissingSupply || hasContactOverload ? "error" : hasProtectionOverload || hasLowMargin ? "warning" : "ok";
    const explanation =
      status === "ok"
        ? `${input.label} is within the selected contact and protective-device ratings.`
        : `${input.label} design load is ${designCurrentA.toFixed(2)} A with ${marginA?.toFixed(2) ?? "unknown"} A margin.`;

    return {
      id: input.id,
      label: input.label,
      description: input.description,
      componentIds: componentIdsFor([...input.path, ...input.contactReferences, ...input.loadReferences]),
      path: input.path,
      requiredVoltageVac: supplyVoltageVac,
      designCurrentA,
      liveCurrentA,
      protectiveRatingA: protectiveLimit,
      weakestContactRatingA,
      marginA,
      liveState,
      status,
      explanation
    };
  };

  const branches = [
    makeBranch({
      id: "control-seal-in",
      label: "Control seal-in branch",
      description: "STOP/START and K1 auxiliary contact feed the K1 relay coil and KT1 timer coil.",
      path: ["QF1", "FU1", "SB0", "SB1", "K1.13", "K1", "KT1"],
      contactReferences: ["SB0", "SB1", "K1.13"],
      loadReferences: ["K1", "KT1"],
      activeNet: "START-LATCH"
    }),
    makeBranch({
      id: "timer-plc-output",
      label: "Timer output branch",
      description: "KT1 done contact permits the PLC Y0 stub and panel run lamp load.",
      path: ["KT1", "Y0", "HL1"],
      contactReferences: ["KT1"],
      loadReferences: ["HL1"],
      activeNet: "PLC-Y0"
    })
  ];

  return {
    id: "electrical-path-analysis",
    standard: "IEC_KR_STEADY_STATE_RULES",
    source: "semantic-circuit-analysis",
    supplyVoltageVac,
    supplyNetPresent,
    referenceNetPresent,
    totalDesignCurrentA: branches.reduce((sum, branch) => sum + branch.designCurrentA, 0),
    totalLiveCurrentA: branches.reduce((sum, branch) => sum + branch.liveCurrentA, 0),
    branches,
    warningCount: branches.filter((branch) => branch.status === "warning").length,
    errorCount: branches.filter((branch) => branch.status === "error").length + (supplyNetPresent && referenceNetPresent ? 0 : 1)
  };
}

export function validatePanelFit(model: CircuitModel): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const placements = model.panelPlacements.filter((placement) => placement.rail !== "virtual");

  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const first = placements[i];
      const second = placements[j];
      if (first.rail !== second.rail || first.yMm !== second.yMm) {
        continue;
      }

      const firstComponent = model.components.find((component) => component.id === first.componentId);
      const secondComponent = model.components.find((component) => component.id === second.componentId);
      if (!firstComponent || !secondComponent) {
        continue;
      }

      const firstDefinition = findDefinition(firstComponent.definitionId);
      const secondDefinition = findDefinition(secondComponent.definitionId);
      const firstEnd = first.xMm + firstDefinition.mechanical.widthMm + firstDefinition.mechanical.clearanceMm;
      const secondStart = second.xMm;

      if (secondStart < firstEnd) {
        findings.push({
          id: `panel-overlap-${first.componentId}-${second.componentId}`,
          severity: "warning",
          ruleId: "PANEL_CLEARANCE",
          affectedObjectIds: [first.componentId, second.componentId],
          title: "Panel rail clearance is tight",
          explanation: `${firstComponent.reference} and ${secondComponent.reference} overlap or violate side clearance on ${first.rail}.`,
          suggestedFix: "Increase rail spacing or move one component to another rail segment."
        });
      }
    }
  }

  return findings;
}

export function simulateStep(
  model: CircuitModel,
  previous?: SimulationSnapshot,
  inputPatch: Partial<SimulationInputs> = {}
): SimulationSnapshot {
  const step = (previous?.step ?? 0) + 1;
  const findings = validateCircuit(model);
  const hasHardFault = findings.some((finding) => finding.severity === "error");
  const inputs: SimulationInputs = {
    startPressed: inputPatch.startPressed ?? previous?.inputs.startPressed ?? true,
    stopPressed: inputPatch.stopPressed ?? previous?.inputs.stopPressed ?? false
  };
  const stopChainClosed = !inputs.stopPressed;
  const startContactClosed = inputs.startPressed;
  const previousRelayEnergized = Object.entries(previous?.componentStates ?? {}).some(([componentId, state]) => {
    const component = model.components.find((item) => item.id === componentId);
    return component?.reference === "K1" && state === "energized";
  });
  const relayEnergized = !hasHardFault && stopChainClosed && (startContactClosed || previousRelayEnergized);
  const timer = getComponentByReference(model, "KT1");
  const timerDelayMs = Number(timer?.settings?.delayMs ?? 3000);
  const timerElapsedMs = relayEnergized ? Math.min(timerDelayMs, (previous?.timerElapsedMs ?? 0) + 250) : 0;
  const timerDone = relayEnergized && timerElapsedMs >= timerDelayMs;
  const plcOutputEnergized = timerDone;
  const energizedNets = hasHardFault
    ? ["L24"]
    : [
        "L24",
        "L24-CONTROL",
        ...(stopChainClosed ? ["STOP-CHAIN"] : []),
        ...(relayEnergized ? ["START-LATCH", "SEAL-IN"] : []),
        ...(timerDone ? ["TIMER-DONE"] : []),
        ...(plcOutputEnergized ? ["PLC-Y0"] : [])
      ];
  const componentStates: SimulationSnapshot["componentStates"] = {};

  for (const component of model.components) {
    const definition = findDefinition(component.definitionId);
    if (hasHardFault) {
      componentStates[component.id] = definition.kind === "pushbutton" && component.reference === "SB0" ? "closed" : "idle";
      continue;
    }

    if (component.reference === "SB0") {
      componentStates[component.id] = stopChainClosed ? "closed" : "open";
    } else if (component.reference === "SB1") {
      componentStates[component.id] = startContactClosed ? "closed" : "open";
    } else if (component.reference === "K1" || definition.kind === "contactor") {
      componentStates[component.id] = relayEnergized ? "energized" : "idle";
    } else if (component.reference === "K1.13") {
      componentStates[component.id] = relayEnergized ? "closed" : "open";
    } else if (component.reference === "KT1") {
      componentStates[component.id] = relayEnergized ? "energized" : "idle";
    } else if (component.reference === "Y0" || component.reference === "HL1") {
      componentStates[component.id] = plcOutputEnergized ? "energized" : "idle";
    } else if (definition.kind === "protective") {
      componentStates[component.id] = "closed";
    } else {
      componentStates[component.id] = "idle";
    }
  }

  const loadCurrent = hasHardFault ? 0 : relayEnergized ? 0.25 + (plcOutputEnergized ? 0.03 : 0) : 0;
  return {
    step,
    timestampMs: step * 250,
    mode: "running",
    inputs,
    timerElapsedMs,
    energizedNets,
    componentStates,
    readings: [
      { id: "r-control", label: "Control supply", voltageVac: 24, currentA: loadCurrent },
      { id: "r-k1", label: "K1 coil", voltageVac: relayEnergized ? 24 : 0, currentA: relayEnergized ? 0.25 : 0 },
      { id: "r-y0", label: "PLC Y0", voltageVac: plcOutputEnergized ? 24 : 0, currentA: plcOutputEnergized ? 0.03 : 0 }
    ]
  };
}

function getComponentByReference(model: CircuitModel, reference: string): CircuitComponent | undefined {
  return model.components.find((component) => component.reference === reference);
}

function getState(component: CircuitComponent | undefined, snapshot?: SimulationSnapshot) {
  if (!component) return "idle";
  return snapshot?.componentStates[component.id] ?? component.state ?? "idle";
}

function toElement(
  component: CircuitComponent | undefined,
  fallbackReference: string,
  role: LogicElement["role"],
  snapshot: SimulationSnapshot | undefined,
  options: Pick<LogicElement, "contactType" | "address" | "label"> & { componentId?: string }
): LogicElement {
  const reference = component?.reference ?? fallbackReference;
  const state = getState(component, snapshot);
  return {
    id: `${reference}-${role}-${options.address ?? options.contactType ?? "out"}`,
    componentId: component?.id ?? options.componentId ?? `missing-${reference}`,
    reference,
    label: options.label,
    role,
    contactType: options.contactType,
    address: options.address,
    energized: state === "closed" || state === "energized"
  };
}

export function buildLogicModel(model: CircuitModel, snapshot?: SimulationSnapshot): LogicModel {
  if (model.components.length === 0) {
    return {
      id: "logic-empty",
      language: "ladder",
      standard: "IEC_61131_3_LD",
      source: "semantic-circuit-projection",
      rungs: []
    };
  }

  const stop = getComponentByReference(model, "SB0");
  const start = getComponentByReference(model, "SB1");
  const seal = getComponentByReference(model, "K1.13");
  const relay = getComponentByReference(model, "K1");
  const timer = getComponentByReference(model, "KT1");
  const plcOutput = getComponentByReference(model, "Y0");
  const pilot = getComponentByReference(model, "HL1");

  const stopElement = toElement(stop, "SB0", "contact", snapshot, {
    label: "Stop PB",
    contactType: "NC",
    address: "%I0.1"
  });
  const startElement = toElement(start, "SB1", "contact", snapshot, {
    label: "Start PB",
    contactType: "NO",
    address: "%I0.0"
  });
  const sealElement = toElement(seal, "K1.13", "contact", snapshot, {
    label: "K1 seal-in",
    contactType: "NO",
    address: "%M0.0"
  });
  const relayElement = toElement(relay, "K1", "coil", snapshot, {
    label: "K1 run coil",
    address: "%M0.0"
  });
  const timerElement = toElement(timer, "KT1", "timer", snapshot, {
    label: "KT1 TON",
    address: "TON T1"
  });
  const plcElement = toElement(plcOutput, "Y0", "plc-output", snapshot, {
    label: "PLC Y0 output",
    address: "%Q0.0"
  });
  const pilotElement = toElement(pilot, "HL1", "load", snapshot, {
    label: "Run lamp",
    address: "%Q0.0"
  });

  const controlRungEnergized = stopElement.energized && (startElement.energized || sealElement.energized) && relayElement.energized;
  const timerRungEnergized = relayElement.energized && timerElement.energized;
  const plcRungEnergized = relayElement.energized && timerElement.energized && (plcElement.energized || pilotElement.energized);

  return {
    id: "logic-motor-start",
    language: "ladder",
    standard: "IEC_61131_3_LD",
    source: "semantic-circuit-projection",
    rungs: [
      {
        id: "rung-start-latch",
        label: "Rung 001 - Start/stop seal-in",
        description: "NC stop and NO start contact energize K1; K1 auxiliary contact seals the branch.",
        inputs: [stopElement, startElement],
        sealIn: sealElement,
        output: relayElement,
        energized: controlRungEnergized
      },
      {
        id: "rung-on-delay",
        label: "Rung 002 - On-delay timer",
        description: "K1 run state enables an on-delay timer used by the PLC output rung.",
        inputs: [relayElement],
        output: timerElement,
        energized: timerRungEnergized
      },
      {
        id: "rung-plc-output",
        label: "Rung 003 - PLC output / run lamp",
        description: "Relay and timer state permit PLC Y0 and the panel run indicator.",
        inputs: [relayElement, timerElement],
        sealIn: pilotElement,
        output: plcElement,
        energized: plcRungEnergized
      }
    ]
  };
}

const panelRailLabels: Record<PanelPlacement["rail"], string> = {
  "control-rail": "Control DIN rail",
  "terminal-rail": "Terminal DIN rail",
  virtual: "Panel face devices"
};

export function buildPanelLayout(model: CircuitModel, findings = validatePanelFit(model)): PanelLayoutModel {
  const clearanceWarnings = new Set(
    findings
      .filter((finding) => finding.ruleId === "PANEL_CLEARANCE")
      .flatMap((finding) => finding.affectedObjectIds)
  );
  const placementsByComponentId = new Map(model.panelPlacements.map((placement) => [placement.componentId, placement]));
  const railMap = new Map<PanelPlacement["rail"], PanelLayoutItem[]>();
  const unplaced: PanelLayoutItem[] = [];

  for (const component of model.components) {
    const definition = findDefinition(component.definitionId);
    const placement = placementsByComponentId.get(component.id);
    const item: PanelLayoutItem = {
      id: `panel-${component.id}`,
      componentId: component.id,
      reference: component.reference,
      name: definition.name,
      symbol: definition.symbol,
      mount: definition.mechanical.mount,
      rail: placement?.rail ?? "virtual",
      xMm: placement?.xMm ?? 0,
      yMm: placement?.yMm ?? 0,
      widthMm: definition.mechanical.widthMm,
      heightMm: definition.mechanical.heightMm,
      depthMm: definition.mechanical.depthMm,
      clearanceMm: definition.mechanical.clearanceMm,
      status: placement ? (clearanceWarnings.has(component.id) ? "warning" : "ok") : "missing-placement"
    };

    if (!placement) {
      unplaced.push(item);
      continue;
    }

    const items = railMap.get(placement.rail) ?? [];
    items.push(item);
    railMap.set(placement.rail, items);
  }

  const rails: PanelRailLayout[] = (["control-rail", "terminal-rail", "virtual"] as PanelPlacement["rail"][])
    .map((rail) => {
      const items = (railMap.get(rail) ?? []).sort((first, second) => first.yMm - second.yMm || first.xMm - second.xMm);
      const usedWidthMm = items.reduce((max, item) => Math.max(max, item.xMm + item.widthMm + item.clearanceMm), 0);
      return {
        id: rail,
        label: panelRailLabels[rail],
        items,
        usedWidthMm,
        warningCount: items.filter((item) => item.status === "warning").length
      };
    })
    .filter((rail) => rail.items.length > 0);

  return {
    id: "panel-layout-primary",
    standard: "IEC_KR_PANEL_FIT",
    source: "semantic-circuit-placement",
    rails,
    unplaced,
    warningCount: rails.reduce((count, rail) => count + rail.warningCount, 0) + unplaced.length,
    totalDepthMm: Math.max(0, ...model.components.map((component) => findDefinition(component.definitionId).mechanical.depthMm))
  };
}

export function addComponent(model: CircuitModel, definitionId: string): CircuitModel {
  const definition = findDefinition(definitionId);
  const sequence = model.components.filter((component) => component.definitionId === definitionId).length + 1;
  const id = `c-${definition.symbol.toLowerCase()}-${Date.now()}`;
  return {
    ...model,
    components: [
      ...model.components,
      {
        id,
        definitionId,
        reference: `${definition.symbol}${sequence}`,
        x: 180 + sequence * 42,
        y: 420,
        state: "idle"
      }
    ],
    panelPlacements: [
      ...model.panelPlacements,
      {
        componentId: id,
        rail: definition.mechanical.mount === "din-rail" ? "control-rail" : "virtual",
        xMm: 160 + sequence * 16,
        yMm: definition.mechanical.mount === "din-rail" ? 0 : 120
      }
    ]
  };
}

export function addConductor(model: CircuitModel, input: AddConductorInput): CircuitModel {
  const fromComponent = model.components.find((component) => component.id === input.fromComponentId);
  const toComponent = model.components.find((component) => component.id === input.toComponentId);

  if (!fromComponent) {
    throw new Error(`Invalid source component: ${input.fromComponentId}`);
  }
  if (!toComponent) {
    throw new Error(`Invalid target component: ${input.toComponentId}`);
  }

  const fromDefinition = findDefinition(fromComponent.definitionId);
  const toDefinition = findDefinition(toComponent.definitionId);
  const hasSourceTerminal = fromDefinition.terminals.some((terminal) => terminal.id === input.fromTerminal);
  const hasTargetTerminal = toDefinition.terminals.some((terminal) => terminal.id === input.toTerminal);

  if (!hasSourceTerminal) {
    throw new Error(`Invalid source terminal: ${fromComponent.reference}:${input.fromTerminal}`);
  }
  if (!hasTargetTerminal) {
    throw new Error(`Invalid target terminal: ${toComponent.reference}:${input.toTerminal}`);
  }

  const net = input.net.trim();
  if (!net) {
    throw new Error("Net name is required");
  }

  const nextIndex = model.conductors.length + 1;
  return {
    ...model,
    conductors: [
      ...model.conductors,
      {
        id: `w${nextIndex}`,
        from: input.fromComponentId,
        fromTerminal: input.fromTerminal,
        to: input.toComponentId,
        toTerminal: input.toTerminal,
        net
      }
    ]
  };
}

export function updateComponentReference(model: CircuitModel, input: UpdateComponentReferenceInput): CircuitModel {
  const reference = input.reference.trim();
  if (!reference) {
    throw new Error("Reference designation is required");
  }

  const component = model.components.find((item) => item.id === input.componentId);
  if (!component) {
    throw new Error(`Invalid component: ${input.componentId}`);
  }

  return {
    ...model,
    components: model.components.map((item) => (item.id === input.componentId ? { ...item, reference } : item))
  };
}

export function summarizeFindings(findings: ValidationFinding[]): { errors: number; warnings: number; infos: number } {
  return findings.reduce(
    (summary, finding) => {
      if (finding.severity === "error") summary.errors += 1;
      if (finding.severity === "warning") summary.warnings += 1;
      if (finding.severity === "info") summary.infos += 1;
      return summary;
    },
    { errors: 0, warnings: 0, infos: 0 }
  );
}
