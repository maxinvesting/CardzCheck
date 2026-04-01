#!/usr/bin/env python3
"""
Train a multinomial logistic-regression calibrator for PSA grade buckets.
Input: JSONL exported by scripts/export_training_data.mjs
Output: portable model JSON + metrics JSON
"""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

CLASS_LABELS = ["10", "9", "8", "7_or_lower"]


@dataclass
class Dataset:
  feature_names: List[str]
  x: List[List[float]]
  y: List[int]
  rows: List[Dict]


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Train PSA calibrator")
  parser.add_argument("--input", required=True, help="Path to training JSONL")
  parser.add_argument(
    "--output-model",
    default="tmp/psa_calibrator_model.json",
    help="Output model JSON path",
  )
  parser.add_argument(
    "--output-metrics",
    default="tmp/psa_calibrator_metrics.json",
    help="Output metrics JSON path",
  )
  parser.add_argument("--feature-version", default="v1", help="Feature version")
  parser.add_argument("--epochs", type=int, default=450)
  parser.add_argument("--learning-rate", type=float, default=0.08)
  parser.add_argument("--l2", type=float, default=0.0005)
  parser.add_argument("--seed", type=int, default=7)
  return parser.parse_args()


def softmax(logits: Sequence[float]) -> List[float]:
  max_logit = max(logits)
  exps = [math.exp(value - max_logit) for value in logits]
  total = sum(exps)
  if total <= 0:
    return [1.0 / len(logits)] * len(logits)
  return [value / total for value in exps]


def brier_score_multiclass(probs: List[List[float]], y: List[int]) -> float:
  total = 0.0
  for i, row in enumerate(probs):
    for k, prob in enumerate(row):
      target = 1.0 if y[i] == k else 0.0
      total += (prob - target) ** 2
  return total / max(1, len(y))


def expected_calibration_error(
  probs: List[List[float]],
  y: List[int],
  num_bins: int = 10,
) -> Tuple[float, List[Dict]]:
  bins = [
    {
      "bin": i,
      "count": 0,
      "predicted_confidence_mean": 0.0,
      "accuracy": 0.0,
      "confidence_min": i / num_bins,
      "confidence_max": (i + 1) / num_bins,
    }
    for i in range(num_bins)
  ]

  for i, row in enumerate(probs):
    confidence = max(row)
    prediction = max(range(len(row)), key=lambda idx: row[idx])
    correct = 1 if prediction == y[i] else 0
    bin_index = min(num_bins - 1, int(confidence * num_bins))

    bins[bin_index]["count"] += 1
    bins[bin_index]["predicted_confidence_mean"] += confidence
    bins[bin_index]["accuracy"] += correct

  ece = 0.0
  total_count = max(1, len(y))
  for row in bins:
    count = row["count"]
    if count == 0:
      continue
    row["predicted_confidence_mean"] /= count
    row["accuracy"] /= count
    ece += (count / total_count) * abs(
      row["predicted_confidence_mean"] - row["accuracy"]
    )

  return ece, bins


def class_reliability_bins(
  probs: List[List[float]],
  y: List[int],
  class_index: int,
  num_bins: int = 10,
) -> List[Dict]:
  bins = [
    {
      "bin": i,
      "count": 0,
      "predicted_probability_mean": 0.0,
      "actual_rate": 0.0,
      "probability_min": i / num_bins,
      "probability_max": (i + 1) / num_bins,
    }
    for i in range(num_bins)
  ]

  for i, row in enumerate(probs):
    prob = row[class_index]
    target = 1 if y[i] == class_index else 0
    bin_index = min(num_bins - 1, int(prob * num_bins))

    bins[bin_index]["count"] += 1
    bins[bin_index]["predicted_probability_mean"] += prob
    bins[bin_index]["actual_rate"] += target

  for row in bins:
    count = row["count"]
    if count == 0:
      continue
    row["predicted_probability_mean"] /= count
    row["actual_rate"] /= count

  return bins


def confusion_matrix(y_true: List[int], y_pred: List[int], class_count: int) -> List[List[int]]:
  matrix = [[0 for _ in range(class_count)] for _ in range(class_count)]
  for truth, pred in zip(y_true, y_pred):
    matrix[truth][pred] += 1
  return matrix


def load_dataset(path: Path) -> Dataset:
  rows: List[Dict] = []
  with path.open("r", encoding="utf-8") as handle:
    for line in handle:
      line = line.strip()
      if not line:
        continue
      row = json.loads(line)
      label = str(row.get("label", "")).strip()
      if label not in CLASS_LABELS:
        continue
      features = row.get("features", {})
      if not isinstance(features, dict):
        continue
      rows.append(row)

  if len(rows) < 20:
    raise ValueError("Need at least 20 labeled rows to train a calibrator.")

  feature_names = sorted(
    {
      key
      for row in rows
      for key, value in row.get("features", {}).items()
      if isinstance(value, (int, float, bool))
    }
  )
  if not feature_names:
    raise ValueError("No numeric features found in dataset.")

  x: List[List[float]] = []
  y: List[int] = []

  for row in rows:
    features = row["features"]
    vector = []
    for name in feature_names:
      value = features.get(name, 0.0)
      if isinstance(value, bool):
        vector.append(1.0 if value else 0.0)
      elif isinstance(value, (int, float)):
        vector.append(float(value))
      else:
        vector.append(0.0)
    x.append(vector)
    y.append(CLASS_LABELS.index(row["label"]))

  return Dataset(feature_names=feature_names, x=x, y=y, rows=rows)


def standardize(x: List[List[float]]) -> Tuple[List[List[float]], List[float], List[float]]:
  feature_count = len(x[0])
  means = []
  stds = []

  for j in range(feature_count):
    column = [row[j] for row in x]
    mean = statistics.fmean(column)
    means.append(mean)
    variance = statistics.fmean([(value - mean) ** 2 for value in column])
    std = math.sqrt(max(variance, 1e-9))
    stds.append(std if std > 1e-6 else 1.0)

  x_scaled = [
    [(row[j] - means[j]) / stds[j] for j in range(feature_count)] for row in x
  ]
  return x_scaled, means, stds


def train_softmax_regression(
  x: List[List[float]],
  y: List[int],
  class_count: int,
  epochs: int,
  learning_rate: float,
  l2: float,
  seed: int,
) -> Tuple[List[List[float]], List[float], List[float]]:
  random.seed(seed)
  sample_count = len(x)
  feature_count = len(x[0])

  weights = [[random.uniform(-0.01, 0.01) for _ in range(feature_count)] for _ in range(class_count)]
  biases = [0.0 for _ in range(class_count)]

  loss_history = []

  for epoch in range(epochs):
    grad_w = [[0.0 for _ in range(feature_count)] for _ in range(class_count)]
    grad_b = [0.0 for _ in range(class_count)]
    loss = 0.0

    for i in range(sample_count):
      logits = []
      for k in range(class_count):
        score = biases[k]
        for j in range(feature_count):
          score += weights[k][j] * x[i][j]
        logits.append(score)

      probs = softmax(logits)
      target_class = y[i]
      loss -= math.log(max(probs[target_class], 1e-12))

      for k in range(class_count):
        error = probs[k] - (1.0 if target_class == k else 0.0)
        grad_b[k] += error
        for j in range(feature_count):
          grad_w[k][j] += error * x[i][j]

    # Mean gradients + L2
    scale = 1.0 / sample_count
    for k in range(class_count):
      for j in range(feature_count):
        grad_w[k][j] = grad_w[k][j] * scale + l2 * weights[k][j]
      grad_b[k] *= scale

    for k in range(class_count):
      for j in range(feature_count):
        weights[k][j] -= learning_rate * grad_w[k][j]
      biases[k] -= learning_rate * grad_b[k]

    reg = 0.5 * l2 * sum(w * w for row in weights for w in row)
    mean_loss = loss / sample_count + reg
    loss_history.append(mean_loss)

    if (epoch + 1) % 100 == 0 or epoch == 0:
      print(f"epoch={epoch + 1:>4} loss={mean_loss:.5f}")

  return weights, biases, loss_history


def convert_to_raw_scale(
  weights_scaled: List[List[float]],
  biases_scaled: List[float],
  means: List[float],
  stds: List[float],
) -> Tuple[List[List[float]], List[float]]:
  class_count = len(weights_scaled)
  feature_count = len(weights_scaled[0])

  raw_weights = [[0.0 for _ in range(feature_count)] for _ in range(class_count)]
  raw_biases = [0.0 for _ in range(class_count)]

  for k in range(class_count):
    intercept = biases_scaled[k]
    for j in range(feature_count):
      raw_weights[k][j] = weights_scaled[k][j] / stds[j]
      intercept -= (weights_scaled[k][j] * means[j]) / stds[j]
    raw_biases[k] = intercept

  return raw_weights, raw_biases


def predict(
  x: List[List[float]],
  raw_weights: List[List[float]],
  raw_biases: List[float],
) -> Tuple[List[List[float]], List[int]]:
  probs: List[List[float]] = []
  preds: List[int] = []
  class_count = len(raw_weights)
  feature_count = len(raw_weights[0])

  for row in x:
    logits = []
    for k in range(class_count):
      score = raw_biases[k]
      for j in range(feature_count):
        score += raw_weights[k][j] * row[j]
      logits.append(score)
    p = softmax(logits)
    probs.append(p)
    preds.append(max(range(class_count), key=lambda idx: p[idx]))

  return probs, preds


def print_confusion(matrix: List[List[int]]) -> None:
  header = "truth\\pred".ljust(12) + " ".join(label.rjust(12) for label in CLASS_LABELS)
  print("\nConfusion matrix")
  print(header)
  for i, row in enumerate(matrix):
    values = " ".join(str(value).rjust(12) for value in row)
    print(CLASS_LABELS[i].ljust(12) + values)


def print_calibration_bins(title: str, bins: List[Dict], predicted_key: str, actual_key: str) -> None:
  print(f"\n{title}")
  print("bin  count  pred_mean  actual")
  for row in bins:
    print(
      f"{row['bin']:>3}  {row['count']:>5}  "
      f"{row[predicted_key]:>9.4f}  {row[actual_key]:>6.4f}"
    )


def top_feature_weights(
  feature_names: List[str],
  raw_weights: List[List[float]],
  top_n: int = 12,
) -> Dict[str, List[Tuple[str, float]]]:
  out: Dict[str, List[Tuple[str, float]]] = {}
  for class_index, label in enumerate(CLASS_LABELS):
    pairs = [(feature_names[j], raw_weights[class_index][j]) for j in range(len(feature_names))]
    pairs.sort(key=lambda item: abs(item[1]), reverse=True)
    out[label] = pairs[:top_n]
  return out


def main() -> None:
  args = parse_args()
  input_path = Path(args.input)
  output_model_path = Path(args.output_model)
  output_metrics_path = Path(args.output_metrics)

  dataset = load_dataset(input_path)
  x_scaled, means, stds = standardize(dataset.x)

  print(
    f"Loaded {len(dataset.x)} rows with {len(dataset.feature_names)} numeric features from {input_path}"
  )

  weights_scaled, biases_scaled, loss_history = train_softmax_regression(
    x=x_scaled,
    y=dataset.y,
    class_count=len(CLASS_LABELS),
    epochs=args.epochs,
    learning_rate=args.learning_rate,
    l2=args.l2,
    seed=args.seed,
  )

  raw_weights, raw_biases = convert_to_raw_scale(
    weights_scaled=weights_scaled,
    biases_scaled=biases_scaled,
    means=means,
    stds=stds,
  )

  probs, preds = predict(dataset.x, raw_weights, raw_biases)
  accuracy = sum(1 for truth, pred in zip(dataset.y, preds) if truth == pred) / len(dataset.y)
  brier = brier_score_multiclass(probs, dataset.y)
  ece, confidence_bins = expected_calibration_error(probs, dataset.y, num_bins=10)
  psa10_bins = class_reliability_bins(probs, dataset.y, class_index=0, num_bins=10)

  matrix = confusion_matrix(dataset.y, preds, len(CLASS_LABELS))
  print_confusion(matrix)
  print_calibration_bins(
    "Reliability bins (max confidence)",
    confidence_bins,
    predicted_key="predicted_confidence_mean",
    actual_key="accuracy",
  )
  print_calibration_bins(
    "Reliability bins (PSA 10 one-vs-rest)",
    psa10_bins,
    predicted_key="predicted_probability_mean",
    actual_key="actual_rate",
  )

  top_weights = top_feature_weights(dataset.feature_names, raw_weights, top_n=10)
  print("\nTop feature weights")
  for label in CLASS_LABELS:
    print(f"  class={label}")
    for feature_name, weight in top_weights[label]:
      print(f"    {feature_name}: {weight:+.5f}")

  class_counts = Counter(CLASS_LABELS[idx] for idx in dataset.y)

  model_json = {
    "model_type": "logreg",
    "model_key": "psa_calibrator",
    "feature_version": args.feature_version,
    "class_labels": CLASS_LABELS,
    "intercepts": {
      CLASS_LABELS[k]: raw_biases[k]
      for k in range(len(CLASS_LABELS))
    },
    "coefficients": {
      CLASS_LABELS[k]: {
        dataset.feature_names[j]: raw_weights[k][j]
        for j in range(len(dataset.feature_names))
      }
      for k in range(len(CLASS_LABELS))
    },
    "training_meta": {
      "trained_at": datetime.now(timezone.utc).isoformat(),
      "rows": len(dataset.x),
      "features": len(dataset.feature_names),
      "epochs": args.epochs,
      "learning_rate": args.learning_rate,
      "l2": args.l2,
      "seed": args.seed,
      "loss_final": loss_history[-1] if loss_history else None,
    },
  }

  metrics_json = {
    "feature_version": args.feature_version,
    "samples": len(dataset.x),
    "accuracy": accuracy,
    "brier_score": brier,
    "ece": ece,
    "class_distribution": dict(class_counts),
    "confusion_matrix": {
      "labels": CLASS_LABELS,
      "values": matrix,
    },
    "reliability_curve": {
      "max_confidence_bins": confidence_bins,
      "psa10_bins": psa10_bins,
    },
    "top_feature_weights": {
      label: [
        {"feature": feature_name, "weight": weight}
        for feature_name, weight in top_weights[label]
      ]
      for label in CLASS_LABELS
    },
  }

  output_model_path.parent.mkdir(parents=True, exist_ok=True)
  output_metrics_path.parent.mkdir(parents=True, exist_ok=True)

  output_model_path.write_text(json.dumps(model_json, indent=2) + "\n", encoding="utf-8")
  output_metrics_path.write_text(json.dumps(metrics_json, indent=2) + "\n", encoding="utf-8")

  print("\nTraining complete")
  print(f"model_json:   {output_model_path}")
  print(f"metrics_json: {output_metrics_path}")
  print(f"accuracy={accuracy:.4f} brier={brier:.4f} ece={ece:.4f}")


if __name__ == "__main__":
  main()
