#!/usr/bin/env python3
"""
TensorBoard → Zola dashboard exporter

Reads TensorBoard event logs (scalars) from a logdir and writes
per-run artifacts in the existing site format under an output dir:

  outdir/
    <run_name>/
      meta.json
      params.json        (optional, if provided via --params)
      scalars.json       (includes accuracy_series if available)
      loss.csv           (if tag found)
      mse.csv            (if tag found)

Also generates a manifest.json listing all runs.

Requirements: pip install tensorboard
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    # tensorboard 2.x
    from tensorboard.backend.event_processing.event_accumulator import EventAccumulator
except Exception as e:  # pragma: no cover
    raise SystemExit(
        "tensorboard is required. Install with: pip install tensorboard\n"
        f"Import error: {e}"
    )


def discover_runs(logdir: Path) -> List[Path]:
    """Return directories under logdir that contain event files."""
    runs = []
    for root, dirs, files in os.walk(logdir):
        if any(f.startswith("events.out.tfevents") for f in files):
            runs.append(Path(root))
    return sorted(set(runs))


def load_scalars(run_dir: Path, size_guidance: int = 100000) -> Tuple[Dict[str, List[Tuple[int, float]]], Optional[float]]:
    """
    Load all scalar tags from a TensorBoard run directory.
    Returns mapping tag -> list of (step, value) and first wall_time.
    """
    acc = EventAccumulator(str(run_dir), size_guidance={
        "scalars": size_guidance,
    })
    acc.Reload()
    tags = acc.Tags().get("scalars", [])
    result: Dict[str, List[Tuple[int, float]]] = {}
    first_wall_time: Optional[float] = None
    for tag in tags:
        events = acc.Scalars(tag)
        if not events:
            continue
        if first_wall_time is None and events:
            first_wall_time = events[0].wall_time
        series = [(e.step, float(e.value)) for e in events]
        # Ensure sorted by step
        series.sort(key=lambda x: x[0])
        result[tag] = series
    return result, first_wall_time


def pick_tag(tags: List[str], preferences: List[str]) -> Optional[str]:
    """Pick the first tag present that matches any preference (case-insensitive substring)."""
    lower = {t.lower(): t for t in tags}
    # Direct exact matches first
    for p in preferences:
        if p in lower:
            return lower[p]
    # Then substring matches
    for p in preferences:
        for t in tags:
            if p in t.lower():
                return t
    return None


def write_csv(path: Path, values: List[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for v in values:
            f.write(f"{v}\n")


def main() -> None:
    ap = argparse.ArgumentParser(description="Export TensorBoard runs to site data format")
    ap.add_argument("--logdir", required=True, type=Path, help="Path to TensorBoard logdir")
    ap.add_argument("--outdir", default=Path("public/master-data"), type=Path, help="Output directory")
    ap.add_argument("--run-prefix", default="", help="Optional prefix to add to run IDs in manifest")
    ap.add_argument("--default-type", default="function_approx", help="Default experiment type for meta.json")
    ap.add_argument("--loss-tags", default="loss,train/loss,val_loss,training/loss", help="Comma list of preferred loss tags")
    ap.add_argument("--mse-tags", default="mse,val_mse,train/mse,metrics/mse", help="Comma list of preferred MSE tags")
    ap.add_argument("--acc-tags", default="accuracy,acc,val_accuracy,train/accuracy,metrics/accuracy", help="Comma list of preferred accuracy tags")
    ap.add_argument("--title-map", default="", help="Optional JSON mapping of run_name->title")
    ap.add_argument("--params", default=None, type=Path, help="Optional JSON file with run_name->params object")
    args = ap.parse_args()

    logdir: Path = args.logdir
    outdir: Path = args.outdir
    outdir.mkdir(parents=True, exist_ok=True)

    title_map: Dict[str, str] = {}
    if args.title_map:
        try:
            title_map = json.loads(args.title_map)
        except json.JSONDecodeError:
            print("Warning: --title-map is not valid JSON, ignoring.")

    params_map: Dict[str, dict] = {}
    if args.params and args.params.exists():
        with args.params.open("r", encoding="utf-8") as f:
            params_map = json.load(f)

    runs = discover_runs(logdir)
    if not runs:
        raise SystemExit(f"No TensorBoard runs found under {logdir}")

    experiments = []

    loss_prefs = [s.strip().lower() for s in args.loss_tags.split(",") if s.strip()]
    mse_prefs = [s.strip().lower() for s in args.mse_tags.split(",") if s.strip()]
    acc_prefs = [s.strip().lower() for s in args.acc_tags.split(",") if s.strip()]

    for run_dir in runs:
        run_name = run_dir.relative_to(logdir).as_posix().replace("/", "_")
        exp_id = f"{args.run_prefix}{run_name}" if args.run_prefix else run_name

        scalars, first_wall_time = load_scalars(run_dir)
        tags = list(scalars.keys())

        # Choose primary tags
        loss_tag = pick_tag(tags, loss_prefs)
        mse_tag = pick_tag(tags, mse_prefs)
        acc_tag = pick_tag(tags, acc_prefs)

        # Extract values only (drop steps)
        def to_values(tag: Optional[str]) -> Optional[List[float]]:
            if not tag:
                return None
            return [v for _, v in scalars.get(tag, [])]

        loss_vals = to_values(loss_tag)
        mse_vals = to_values(mse_tag)
        acc_vals = to_values(acc_tag)

        # Write per-run folder
        exp_dir = outdir / exp_id
        exp_dir.mkdir(parents=True, exist_ok=True)

        # meta.json
        meta = {
            "title": title_map.get(run_name, exp_id.replace("_", " ").title()),
            "type": args.default_type,
        }
        if first_wall_time is not None:
            # Convert epoch seconds to ISO 8601 for the UI
            import datetime as _dt
            meta["date"] = _dt.datetime.fromtimestamp(first_wall_time).isoformat()
        (exp_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

        # params.json (optional)
        if run_name in params_map:
            (exp_dir / "params.json").write_text(json.dumps(params_map[run_name], indent=2), encoding="utf-8")

        # scalars.json
        scalars_out = {}
        if acc_vals:
            scalars_out["accuracy_series"] = acc_vals
            scalars_out["max_accuracy"] = max(acc_vals) if acc_vals else None
        (exp_dir / "scalars.json").write_text(json.dumps(scalars_out, indent=2), encoding="utf-8")

        if loss_vals:
            write_csv(exp_dir / "loss.csv", loss_vals)
        if mse_vals:
            write_csv(exp_dir / "mse.csv", mse_vals)

        # Append to manifest
        paths = {"meta": f"{exp_id}/meta.json", "scalars": f"{exp_id}/scalars.json"}
        if (exp_dir / "params.json").exists():
            paths["params"] = f"{exp_id}/params.json"
        if (exp_dir / "loss.csv").exists():
            paths["loss_ts"] = f"{exp_id}/loss.csv"
        if (exp_dir / "mse.csv").exists():
            paths["mse_ts"] = f"{exp_id}/mse.csv"

        experiments.append({
            "id": exp_id,
            "title": meta["title"],
            "type": meta["type"],
            "paths": paths,
        })

    manifest = {"experiments": experiments}
    (outdir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Exported {len(experiments)} runs to {outdir}")


if __name__ == "__main__":
    main()
