# Sequence Editor

Production-oriented web app prototype for electrical sequence circuit CAD, rule-based validation, panel fit checking, and interactive steady-state simulation.

The app focuses first on IEC/KR-style relay sequence circuits. PLC ladder support is intentionally present as a functional projection stub while the sequence CAD and simulation workflow is developed further.

## Current Capabilities

- Semantic electrical model for components, terminals, conductors, panel placements, validation findings, and simulation snapshots.
- IEC/KR-style schematic CAD view with energized path highlighting.
- React Flow graph CAD fallback for editable node/edge layout.
- Component library for industrial control parts such as MCCB, fuse, relay coil/contact, timer, contactor, pushbuttons, PLC I/O, terminal block, and pilot lamp.
- Rule-based validation for wiring, terminal compatibility, coil profile, contact rating review, and panel clearance.
- Input-driven sequence simulation for START/STOP, K1 seal-in, on-delay timer, PLC output stub, and pilot lamp.
- Mechanical panel fit view for DIN rail and panel-face placement.
- Express API with memory fallback and optional Postgres persistence through `DATABASE_URL`.

## Safety Posture

Validation and simulation results are engineering aids only. They are not regulatory certification, code compliance approval, or guaranteed safety approval.

## Development

```bash
npm install
npm test
npm run build
npm run api
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`.

## Branch Workflow

- `main`: public baseline branch.
- `dev`: active development branch.
- Work should continue on `dev`, then merge back to `main` after tests, build, browser QA, and review.
