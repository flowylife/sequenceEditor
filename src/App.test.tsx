import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline api")))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sequence Editor app", () => {
  it("renders the main CAD and simulation workspace", () => {
    render(<App />);

    expect(screen.getByText("Sequence Editor")).toBeInTheDocument();
    expect(screen.getByText("Component Library")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Validate/i })).toBeInTheDocument();
    expect(screen.getByText(/engineering aid only/i)).toBeInTheDocument();
  });

  it("renders an IEC sequence schematic as the default CAD view", () => {
    render(<App />);

    expect(screen.getByLabelText("IEC sequence schematic CAD view")).toBeInTheDocument();
    expect(screen.getByText(/Motor Start\/Stop Seal-in Circuit/i)).toBeInTheDocument();
    expect(screen.getAllByText("L24").length).toBeGreaterThan(0);
    expect(screen.getAllByText("N24").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/SB1 START NO/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/LS1 LIMIT NC/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/OL1 OVERLOAD NC/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/K1 Relay coil/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show graph CAD view/i })).toBeInTheDocument();
  });

  it("keeps schematic background layers non-interactive so symbols remain selectable", () => {
    render(<App />);

    const backgroundLayers = document.querySelectorAll(".schematic-background");

    expect(backgroundLayers).toHaveLength(2);
    backgroundLayers.forEach((layer) => {
      expect(layer).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("renders transparent schematic symbol hit areas for pointer selection", () => {
    render(<App />);

    const sealInContact = screen.getByLabelText(/K1\.13 Seal-in NO/i);

    expect(sealInContact.querySelector(".schematic-hit-area")).toBeInTheDocument();
  });

  it("shows an empty state and validation error for an empty project", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /New empty/i }));
    expect(screen.getByText("Start a sequence circuit")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(screen.getByText(/No circuit objects exist/i)).toBeInTheDocument();
  });

  it("clears stale empty-project validation errors when a starter circuit is restored", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /New empty/i }));
    fireEvent.click(screen.getByRole("button", { name: /Validate/i }));
    expect(screen.getByText(/No circuit objects exist/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load starter circuit/i }));

    await waitFor(() => {
      expect(screen.queryByText(/No circuit objects exist/i)).not.toBeInTheDocument();
    });
  });

  it("steps the simulation and exposes energized net readings", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Control supply/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/simulation stepped locally/i)).toBeInTheDocument();
  });

  it("lets the operator reset, start, and stop the sequence simulation", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("START open")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^START$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("START closed")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 24 VAC \/ 0.25 A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^STOP$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("STOP open")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Simulation signal timeline")).toBeInTheDocument();
    expect(screen.getByText("Active States (3)")).toBeInTheDocument();
    expect(screen.getAllByText("K1 Coil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("KT1 TON").length).toBeGreaterThan(0);
    expect(screen.getAllByText("HL1 Lamp").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Electrical path analysis")).toBeInTheDocument();
    expect(screen.getByText("Control seal-in branch")).toBeInTheDocument();
    expect(screen.getByText(/0\.54 A/)).toBeInTheDocument();
    expect(screen.getByText("N24 present")).toBeInTheDocument();
  });

  it("lets the operator open LS1 and trips the sealed sequence", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^START$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("LIMIT closed")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 24 VAC \/ 0.25 A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^LIMIT$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("LIMIT open")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PLC Y0: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
  });

  it("lets the operator trip OL1 and de-energizes the run command", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^START$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("OVERLOAD healthy")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 24 VAC \/ 0.25 A/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^OVERLOAD$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("OVERLOAD tripped")).toBeInTheDocument();
    expect(screen.getAllByText("Blocked by OL1 overload trip").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Permissive chain diagnosis")).toBeInTheDocument();
    expect(screen.getByText("OL1 overload trip")).toBeInTheDocument();
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PLC Y0: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
  });

  it("lets the operator open FU1 and removes protected control voltage", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^FUSE$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 running/i)).toBeInTheDocument();
    });

    expect(screen.getByText("FUSE open")).toBeInTheDocument();
    expect(screen.getAllByText("Blocked by FU1 control fuse open").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Control supply: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/K1 coil: 0 VAC \/ 0.00 A/i).length).toBeGreaterThan(0);
    const stopSignalRow = screen.getAllByText("SB0 STOP").map((item) => item.closest(".signal-row")).find(Boolean);
    expect(stopSignalRow).toHaveTextContent("0 V");
    expect(stopSignalRow).toHaveTextContent("off");
  });

  it("saves and reapplies a simulation input preset through the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/projects/project-seq-001/simulation-presets")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  id: "preset-fuse-open",
                  projectId: "project-seq-001",
                  name: "Saved simulation preset",
                  inputs: {
                    startPressed: false,
                    stopPressed: false,
                    limitClosed: true,
                    overloadHealthy: true,
                    controlFuseHealthy: false
                  },
                  createdAt: new Date().toISOString()
                }
              })
          });
        }
        return Promise.reject(new Error("offline api"));
      })
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Reset$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^FUSE$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save simulation preset/i }));

    await waitFor(() => {
      expect(screen.getByText("Preset saved from API")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^FUSE$/i }));
    expect(screen.getByText("FUSE closed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Apply saved preset/i }));

    expect(screen.getByText("FUSE open")).toBeInTheDocument();
    expect(screen.getByText("Applied Saved simulation preset")).toBeInTheDocument();
  });

  it("saves the current project revision through the API", async () => {
    const apiProject = {
      id: "project-seq-001",
      name: "Motor Start Sequence - Panel A",
      ownerId: "single-user",
      activeRevision: 2,
      standardsProfile: "IEC_KR_INDUSTRIAL",
      updatedAt: new Date().toISOString(),
      model: {
        components: [],
        conductors: [],
        panelPlacements: []
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: apiProject })
        })
      )
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /Save project/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved revision 2")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Revision 2/i).length).toBeGreaterThan(0);
  });

  it("renders a ladder logic projection tied to the starter circuit", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Show PLC workspace/i }));

    expect(screen.getByText("PLC Ladder Projection")).toBeInTheDocument();
    expect(screen.getByText(/Rung 001 - Start\/stop seal-in/i)).toBeInTheDocument();
    expect(screen.getByText("SB0")).toBeInTheDocument();
    expect(screen.getByText("LS1")).toBeInTheDocument();
    expect(screen.getByText("OL1")).toBeInTheDocument();
    expect(screen.getByText("K1.13")).toBeInTheDocument();
    expect(screen.getByText("Y0")).toBeInTheDocument();
  });

  it("renders a sequence panel fit workspace with mechanical warnings", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Show panel workspace/i }));

    expect(screen.getByText("Sequence Panel Fit")).toBeInTheDocument();
    expect(screen.getByText("Control DIN rail")).toBeInTheDocument();
    expect(screen.getByText("Panel face devices")).toBeInTheDocument();
    expect(screen.getAllByText("K1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("KT1").length).toBeGreaterThan(0);
    expect(screen.getByText(/fit warnings/i)).toBeInTheDocument();
  });

  it("edits semantic panel placement and surfaces mounting compatibility warnings", () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/HL1 pilot lamp/i));
    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Panel placement rail"), { target: { value: "control-rail" } });
    fireEvent.change(screen.getByLabelText("Panel placement x millimeters"), { target: { value: "220" } });

    expect(screen.getByText("Control DIN rail @ 220 mm")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    expect(screen.getByText("MOUNTING_COMPATIBILITY")).toBeInTheDocument();
    expect(screen.getByText(/HL1 is placed on a DIN rail zone/i)).toBeInTheDocument();
  });

  it("shows semantic netlist topology in validation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    expect(screen.getByLabelText("Netlist topology")).toBeInTheDocument();
    expect(screen.getByText("START-LATCH")).toBeInTheDocument();
    expect(screen.getAllByText(/K1:A1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/KT1:A1/)).toBeInTheDocument();
  });

  it("adds a semantic conductor from the inspector terminal wiring form", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Target component"), { target: { value: "c-hl1" } });
    fireEvent.change(screen.getByLabelText("Source terminal"), { target: { value: "A2" } });
    fireEvent.change(screen.getByLabelText("Target terminal"), { target: { value: "X1" } });
    fireEvent.change(screen.getByLabelText("Net name"), { target: { value: "FIELD-RETURN" } });
    fireEvent.click(screen.getByRole("button", { name: /Add conductor/i }));

    expect(screen.getByText("K1:A2 -> HL1:X1")).toBeInTheDocument();
    expect(screen.getByText("FIELD-RETURN")).toBeInTheDocument();
    expect(screen.getByText("Unsaved local changes")).toBeInTheDocument();
  });

  it("adds conductor ampacity metadata and validates undersized wiring", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Target component"), { target: { value: "c-hl1" } });
    fireEvent.change(screen.getByLabelText("Source terminal"), { target: { value: "A2" } });
    fireEvent.change(screen.getByLabelText("Target terminal"), { target: { value: "X1" } });
    fireEvent.change(screen.getByLabelText("Net name"), { target: { value: "START-LATCH" } });
    fireEvent.change(screen.getByLabelText("Wire ampacity amps"), { target: { value: "0.1" } });
    fireEvent.click(screen.getByRole("button", { name: /Add conductor/i }));

    expect(screen.getByText("0.10 A ampacity")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    expect(screen.getByText("CONDUCTOR_AMPACITY_MARGIN")).toBeInTheDocument();
    expect(screen.getByText(/0\.10 A ampacity/i)).toBeInTheDocument();
    expect(screen.getByText(/0\.54 A branch load/i)).toBeInTheDocument();
  });

  it("surfaces a supply-reference short created through terminal wiring", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Target component"), { target: { value: "c-qf1" } });
    fireEvent.change(screen.getByLabelText("Source terminal"), { target: { value: "A2" } });
    fireEvent.change(screen.getByLabelText("Target terminal"), { target: { value: "T1" } });
    fireEvent.change(screen.getByLabelText("Net name"), { target: { value: "L24" } });
    fireEvent.click(screen.getByRole("button", { name: /Add conductor/i }));
    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    const summary = screen.getByText("Review required").closest(".validation-summary");
    expect(summary).toHaveClass("has-error");
    expect(screen.getByText("SUPPLY_REFERENCE_SHORT")).toBeInTheDocument();
    expect(screen.getByText(/Control supply is shorted to reference/i)).toBeInTheDocument();
  });

  it("surfaces an unbound relay auxiliary contact edited from the inspector", () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/K1\.13 Seal-in NO/i));
    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Reference designation"), { target: { value: "K2.13" } });
    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    expect(screen.getByText("CONTACT_COIL_BINDING")).toBeInTheDocument();
    expect(screen.getByText(/Auxiliary contact is not bound to a coil/i)).toBeInTheDocument();
    expect(screen.getByText(/K2\.13 references K2/i)).toBeInTheDocument();
  });

  it("surfaces a broken self-holding path after deleting the K1 seal-in conductor", () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/K1\.13 Seal-in NO/i));
    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Remove conductor w5" }));
    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    expect(screen.getByText("SEAL_IN_PATH_TOPOLOGY")).toBeInTheDocument();
    expect(screen.getByText(/Self-holding contact is not wired across START/i)).toBeInTheDocument();
    expect(screen.getByText(/K1\.13 must bridge INTERLOCK-CHAIN to RUN-COMMAND/i)).toBeInTheDocument();
  });

  it("lets the operator tune KT1 delay and simulates timer done from that setting", async () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/KT1 on-delay timer/i));
    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Timer delay milliseconds"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 running/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Step$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 running/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Timer 500 ms")).toBeInTheDocument();
    expect(screen.getAllByText(/PLC Y0: 24 VAC \/ 0.03 A/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Timer progress")).toHaveStyle({ width: "100%" });
  });

  it("lets the operator edit a load current and surfaces protective-device margin", () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText(/HL1 pilot lamp/i));
    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.change(screen.getByLabelText("Load design current amps"), { target: { value: "2.4" } });
    fireEvent.click(screen.getByRole("button", { name: /^validation$/i }));

    expect(screen.getByText("PROTECTIVE_DEVICE_MARGIN")).toBeInTheDocument();
    expect(screen.getByText(/Timer output branch has insufficient electrical margin/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.40 A with -0\.40 A margin/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^simulation$/i }));

    expect(screen.getAllByText("Protective").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.0 A").length).toBeGreaterThan(0);
  });

  it("keeps the wiring terminal options aligned with the selected component", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^specs$/i }));
    fireEvent.click(screen.getByLabelText(/HL1 pilot lamp/i));

    expect(screen.getByLabelText("Source terminal")).toHaveValue("X1");
    expect(screen.getByText("HL1 as source")).toBeInTheDocument();
  });
});
