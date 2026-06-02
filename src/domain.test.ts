import { describe, expect, it } from "vitest";
import {
  addComponent,
  addConductor,
  analyzeElectricalPaths,
  buildLogicModel,
  buildNetlist,
  buildPanelLayout,
  componentCatalog,
  createStarterProject,
  simulateStep,
  summarizeFindings,
  updateComponentSetting,
  validateCircuit,
  validatePanelFit
} from "./domain";

describe("electrical sequence domain", () => {
  it("validates the starter circuit without hard faults", () => {
    const project = createStarterProject();
    const findings = validateCircuit(project.model);
    const summary = summarizeFindings(findings);

    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBeGreaterThanOrEqual(1);
    expect(findings.some((finding) => finding.ruleId === "PANEL_CLEARANCE")).toBe(true);
  });

  it("simulates relay seal-in before the timer output is ready", () => {
    const project = createStarterProject();
    const snapshot = simulateStep(project.model, undefined, { startPressed: true });

    expect(snapshot.mode).toBe("running");
    expect(snapshot.energizedNets).toContain("START-LATCH");
    expect(snapshot.componentStates["c-k1"]).toBe("energized");
    expect(snapshot.componentStates["c-k1a"]).toBe("closed");
    expect(snapshot.componentStates["c-hl1"]).toBe("idle");
    expect(snapshot.readings.find((reading) => reading.id === "r-k1")?.voltageVac).toBe(24);
  });

  it("keeps the relay sealed after START is released and completes the timer output", () => {
    const project = createStarterProject();
    let snapshot = simulateStep(project.model, undefined, { startPressed: true });

    for (let index = 0; index < 11; index += 1) {
      snapshot = simulateStep(project.model, snapshot, { startPressed: false });
    }

    expect(snapshot.inputs.startPressed).toBe(false);
    expect(snapshot.timerElapsedMs).toBe(3000);
    expect(snapshot.componentStates["c-k1"]).toBe("energized");
    expect(snapshot.componentStates["c-y0"]).toBe("energized");
    expect(snapshot.componentStates["c-hl1"]).toBe("energized");
    expect(snapshot.energizedNets).toContain("PLC-Y0");
  });

  it("applies an edited timer delay setting to sequence simulation timing", () => {
    const project = createStarterProject();
    const tuned = updateComponentSetting(project.model, {
      componentId: "c-kt1",
      key: "delayMs",
      value: 500
    });

    let snapshot = simulateStep(tuned, undefined, { startPressed: true });
    snapshot = simulateStep(tuned, snapshot, { startPressed: false });

    expect(snapshot.timerElapsedMs).toBe(500);
    expect(snapshot.energizedNets).toContain("TIMER-DONE");
    expect(snapshot.componentStates["c-y0"]).toBe("energized");
  });

  it("flags timer delay settings outside the supported range", () => {
    const project = createStarterProject();
    const invalidTimer = {
      ...project.model,
      components: project.model.components.map((component) =>
        component.id === "c-kt1" ? { ...component, settings: { ...component.settings, delayMs: 0 } } : component
      )
    };

    const findings = validateCircuit(invalidTimer);

    expect(findings.some((finding) => finding.severity === "error" && finding.ruleId === "TIMER_SETTING_RANGE")).toBe(true);
  });

  it("drops the seal-in branch and timer when STOP is pressed", () => {
    const project = createStarterProject();
    const running = simulateStep(project.model, undefined, { startPressed: true });
    const stopped = simulateStep(project.model, running, { startPressed: false, stopPressed: true });

    expect(stopped.componentStates["c-sb0"]).toBe("open");
    expect(stopped.componentStates["c-k1"]).toBe("idle");
    expect(stopped.componentStates["c-k1a"]).toBe("open");
    expect(stopped.componentStates["c-y0"]).toBe("idle");
    expect(stopped.timerElapsedMs).toBe(0);
    expect(stopped.energizedNets).not.toContain("START-LATCH");
  });

  it("projects sequence circuit behavior into IEC ladder rungs", () => {
    const project = createStarterProject();
    let snapshot = simulateStep(project.model, undefined, { startPressed: true });
    for (let index = 0; index < 11; index += 1) {
      snapshot = simulateStep(project.model, snapshot, { startPressed: false });
    }
    const logicModel = buildLogicModel(project.model, snapshot);

    expect(logicModel.standard).toBe("IEC_61131_3_LD");
    expect(logicModel.rungs).toHaveLength(3);
    expect(logicModel.rungs[0].label).toContain("Start/stop");
    expect(logicModel.rungs[0].inputs.map((input) => input.reference)).toEqual(["SB0", "SB1"]);
    expect(logicModel.rungs[0].sealIn?.reference).toBe("K1.13");
    expect(logicModel.rungs[2].output.reference).toBe("Y0");
    expect(logicModel.rungs.every((rung) => rung.energized)).toBe(true);
  });

  it("flags a missing coil terminal as a hard validation error", () => {
    const project = createStarterProject();
    const broken = {
      ...project.model,
      conductors: project.model.conductors.filter((conductor) => conductor.id !== "w9")
    };

    const findings = validateCircuit(broken);

    expect(findings.some((finding) => finding.severity === "error" && finding.ruleId === "TERMINAL_CONNECTED")).toBe(true);
  });

  it("adds catalog components through the semantic model rather than canvas state", () => {
    const project = createStarterProject();
    const next = addComponent(project.model, "terminal-block");

    expect(next.components).toHaveLength(project.model.components.length + 1);
    expect(next.panelPlacements).toHaveLength(project.model.panelPlacements.length + 1);
    expect(next.components.at(-1)?.definitionId).toBe("terminal-block");
  });

  it("adds terminal-to-terminal conductors through the semantic model", () => {
    const project = createStarterProject();
    const withTerminal = addComponent(project.model, "terminal-block");
    const terminalBlock = withTerminal.components.at(-1);
    if (!terminalBlock) throw new Error("terminal block was not created");

    const next = addConductor(withTerminal, {
      fromComponentId: "c-k1",
      fromTerminal: "A2",
      toComponentId: terminalBlock.id,
      toTerminal: "1",
      net: "FIELD-N24"
    });

    expect(next.conductors).toHaveLength(withTerminal.conductors.length + 1);
    expect(next.conductors.at(-1)).toMatchObject({
      from: "c-k1",
      fromTerminal: "A2",
      to: terminalBlock.id,
      toTerminal: "1",
      net: "FIELD-N24"
    });
  });

  it("rejects conductors that do not match component terminal maps", () => {
    const project = createStarterProject();

    expect(() =>
      addConductor(project.model, {
        fromComponentId: "c-k1",
        fromTerminal: "NOPE",
        toComponentId: "c-hl1",
        toTerminal: "X1",
        net: "BAD-NET"
      })
    ).toThrow(/invalid source terminal/i);
  });

  it("builds a netlist topology from conductor endpoints", () => {
    const project = createStarterProject();
    const netlist = buildNetlist(project.model);
    const startLatch = netlist.nets.find((net) => net.id === "START-LATCH");

    expect(netlist.source).toBe("semantic-circuit-conductors");
    expect(startLatch?.endpoints.map((endpoint) => `${endpoint.reference}:${endpoint.terminal}`)).toContain("K1:A1");
    expect(startLatch?.endpoints.map((endpoint) => `${endpoint.reference}:${endpoint.terminal}`)).toContain("KT1:A1");
    expect(startLatch?.conductorIds).toEqual(["w4", "w9"]);
  });

  it("warns when one terminal is assigned to multiple net labels", () => {
    const project = createStarterProject();
    const findings = validateCircuit(project.model);

    expect(findings.some((finding) => finding.ruleId === "TERMINAL_NET_CONSISTENCY")).toBe(true);
  });

  it("flags a supply-reference short when L24 and N24 share a terminal node", () => {
    const project = createStarterProject();
    const shorted = addConductor(project.model, {
      fromComponentId: "c-qf1",
      fromTerminal: "T1",
      toComponentId: "c-k1",
      toTerminal: "A2",
      net: "L24"
    });

    const findings = validateCircuit(shorted);

    expect(findings.some((finding) => finding.severity === "error" && finding.ruleId === "SUPPLY_REFERENCE_SHORT")).toBe(true);
  });

  it("flags an auxiliary contact that is not bound to a matching relay coil", () => {
    const project = createStarterProject();
    const unboundContact = {
      ...project.model,
      components: project.model.components.map((component) =>
        component.id === "c-k1a" ? { ...component, reference: "K2.13" } : component
      )
    };

    const findings = validateCircuit(unboundContact);

    expect(findings.some((finding) => finding.severity === "error" && finding.ruleId === "CONTACT_COIL_BINDING")).toBe(true);
  });

  it("checks simple DIN rail mechanical clearance", () => {
    const project = createStarterProject();
    const findings = validatePanelFit(project.model);

    expect(findings.map((finding) => finding.ruleId)).toContain("PANEL_CLEARANCE");
  });

  it("analyzes control branch load margins from the semantic circuit", () => {
    const project = createStarterProject();
    const snapshot = simulateStep(project.model, undefined, { startPressed: true });
    const analysis = analyzeElectricalPaths(project.model, snapshot);
    const controlBranch = analysis.branches.find((branch) => branch.id === "control-seal-in");

    expect(analysis.supplyNetPresent).toBe(true);
    expect(analysis.referenceNetPresent).toBe(true);
    expect(controlBranch?.status).toBe("ok");
    expect(controlBranch?.designCurrentA).toBeCloseTo(0.54, 2);
    expect(controlBranch?.liveCurrentA).toBeCloseTo(0.54, 2);
    expect(controlBranch?.weakestContactRatingA).toBe(3);
  });

  it("turns insufficient contact rating into a validation finding", () => {
    const startDefinition = componentCatalog.find((definition) => definition.id === "pb-start-no");
    if (!startDefinition) throw new Error("missing start pushbutton definition");
    const originalRating = startDefinition.ratings.contactCurrentA;
    startDefinition.ratings.contactCurrentA = 0.1;

    try {
      const project = createStarterProject();
      const findings = validateCircuit(project.model);

      expect(findings.some((finding) => finding.ruleId === "CONTACT_LOAD_MARGIN")).toBe(true);
    } finally {
      startDefinition.ratings.contactCurrentA = originalRating;
    }
  });

  it("builds a mechanical panel layout with rail warnings and device envelopes", () => {
    const project = createStarterProject();
    const panelLayout = buildPanelLayout(project.model);
    const controlRail = panelLayout.rails.find((rail) => rail.id === "control-rail");

    expect(panelLayout.standard).toBe("IEC_KR_PANEL_FIT");
    expect(controlRail?.items.map((item) => item.reference)).toContain("K1");
    expect(controlRail?.items.map((item) => item.reference)).toContain("KT1");
    expect(panelLayout.warningCount).toBeGreaterThanOrEqual(1);
    expect(controlRail?.items.some((item) => item.status === "warning")).toBe(true);
    expect(panelLayout.totalDepthMm).toBeGreaterThan(0);
  });
});
