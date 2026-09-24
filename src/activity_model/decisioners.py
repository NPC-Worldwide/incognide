import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
for _rel in (
    os.path.join(_SCRIPT_DIR, "..", "..", "npcpy"),
    os.path.join(_SCRIPT_DIR, "..", "..", "..", "npcpy"),
):
    _cand = os.path.abspath(_rel)
    if os.path.isdir(_cand) and _cand not in sys.path:
        sys.path.insert(0, _cand)

try:
    from npcpy.ft.system1 import (
        System1Config,
        System1Example,
        System1Predictor,
        train_system1,
        load_system1,
    )
    HAS_NPCPY_SYSTEM1 = True
except Exception:
    HAS_NPCPY_SYSTEM1 = False
    System1Config = None
    System1Example = None
    System1Predictor = None
    train_system1 = None
    load_system1 = None

try:
    from qstk.cnn import (
        ACTION_TO_IDX,
        ACTIVITY_TYPES,
        forward,
        load as load_model,
        make_predictor,
        predict as predict_fn,
        save as save_model,
    )
    HAS_QSTK = True
except Exception:
    HAS_QSTK = False
    ACTION_TO_IDX = {}
    ACTIVITY_TYPES = []


def _state_to_text(state: Union[str, Dict[str, Any], List[Any]]) -> str:
    if isinstance(state, str):
        return state
    return json.dumps(state, ensure_ascii=False, default=str)


@dataclass
class DecisionerConfig:
    backend: str = "system1"
    model_dir: str = "./decision_model"
    encoder_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    classifier: str = "LogisticRegression"
    epochs: int = 50
    lr: float = 1e-3
    batch_size: int = 32
    seed: Optional[int] = None
    ssm_config: Optional[Dict[str, Any]] = None


@dataclass
class DecisionResult:
    choice: Optional[str] = None
    score: Optional[float] = None
    noul: Optional[float] = None
    probabilities: Dict[str, float] = field(default_factory=dict)
    confidence: float = 0.0
    backend: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "choice": self.choice,
            "score": self.score,
            "noul": self.noul,
            "probabilities": self.probabilities,
            "confidence": self.confidence,
            "backend": self.backend,
        }


class System1Decisioner:
    def __init__(self, config: DecisionerConfig):
        if not HAS_NPCPY_SYSTEM1:
            raise ImportError("npcpy.ft.system1 is required for System1Decisioner")
        self.config = config
        self.predictor: Optional[System1Predictor] = None

    def fit(
        self,
        examples: List[System1Example],
    ) -> Dict[str, Any]:
        cfg = System1Config(
            encoder_name=self.config.encoder_name,
            classifier=self.config.classifier,
            output_dir=self.config.model_dir,
        )
        path = train_system1(examples, cfg)
        self.predictor = load_system1(path)
        return {"success": True, "model_path": path, "backend": "system1"}

    def _ensure_predictor(self) -> System1Predictor:
        if self.predictor is None:
            path = self.config.model_dir
            if not os.path.isdir(path):
                raise ValueError(f"No trained system1 model at {path}")
            self.predictor = load_system1(path)
        return self.predictor

    def decide_choice(
        self,
        state: Any,
        instructions: str,
        criteria: Dict[str, str],
        question_name: str = "default",
    ) -> DecisionResult:
        predictor = self._ensure_predictor()
        result = predictor.choice(state, instructions, criteria, question_name=question_name)
        return DecisionResult(
            choice=result.choice,
            probabilities=result.probabilities,
            confidence=result.confidence,
            backend="system1",
        )

    def decide_score(
        self,
        state: Any,
        instructions: str,
        criteria: List[str],
        question_name: str = "default",
    ) -> DecisionResult:
        predictor = self._ensure_predictor()
        result = predictor.score(state, instructions, criteria, question_name=question_name)
        return DecisionResult(
            score=result.score,
            probabilities=result.probabilities,
            confidence=result.confidence,
            backend="system1",
        )

    def decide_noul(
        self,
        state: Any,
        instructions: str,
        question_name: str = "default",
    ) -> DecisionResult:
        predictor = self._ensure_predictor()
        result = predictor.noul(state, instructions, question_name=question_name)
        return DecisionResult(
            noul=result.noul,
            backend="system1",
        )


def _coarse_event_to_text(event: Dict[str, Any]) -> str:
    parts = [f"type: {event.get('type', 'unknown')}"]
    data = event.get("data") or {}
    for key in ("paneType", "pane", "label", "placeholder", "command", "jinx_name", "url", "fileName"):
        value = data.get(key)
        if value:
            parts.append(f"{key}: {value}")
    timestamp = event.get("timestamp")
    if timestamp:
        parts.append(f"time: {timestamp}")
    return "\n".join(parts)


def activity_events_to_system1_examples(
    events: List[Dict[str, Any]],
    question_type: str = "choice",
    instructions: str = "What is the next activity?",
    criteria: Any = None,
    label_key: str = "type",
) -> List[System1Example]:
    if not HAS_NPCPY_SYSTEM1:
        raise ImportError("npcpy.ft.system1 is required")
    examples = []
    if len(events) < 2:
        return examples
    for i in range(1, len(events)):
        state = _coarse_event_to_text(events[i - 1])
        target_event = events[i]
        label = target_event.get(label_key, target_event.get("type", "unknown"))
        answer: Any
        if question_type == "choice":
            answer = {"choice": str(label)}
        elif question_type == "score":
            answer = {"score": int(label)}
        else:
            answer = {"noul": float(label)}
        examples.append(
            System1Example(
                state=state,
                question_type=question_type,
                instructions=instructions,
                criteria=criteria,
                answer=answer,
                question_name="activity",
            )
        )
    return examples


def _logits_to_probabilities(logits: np.ndarray) -> np.ndarray:
    max_logits = np.max(logits, axis=-1, keepdims=True)
    exp_logits = np.exp(logits - max_logits)
    return exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)


class SSMDecisioner:
    def __init__(self, config: DecisionerConfig):
        if not HAS_QSTK:
            raise ImportError("qstk.cnn is required for SSMDecisioner")
        self.config = config
        self.model: Optional[Dict[str, Any]] = None

    def _npz_path(self) -> str:
        return os.path.join(self.config.model_dir, "model.npz")

    def fit(
        self,
        sequences: List[Tuple[np.ndarray, int]],
    ) -> Dict[str, Any]:
        from activity_model.activity_predictor import train_from_sequences

        os.makedirs(self.config.model_dir, exist_ok=True)
        if len(sequences) < 10:
            return {"success": False, "error": f"Need >= 10 sequences, got {len(sequences)}."}
        rng = np.random.default_rng(self.config.seed)
        order = rng.permutation(len(sequences))
        split = int(0.8 * len(sequences))
        train_data = [sequences[i] for i in order[:split]]
        val_data = [sequences[i] for i in order[split:]]
        result = train_from_sequences(
            train_data,
            val_data,
            self.config.model_dir,
            epochs=self.config.epochs,
            lr=self.config.lr,
            batch_size=self.config.batch_size,
            seed=self.config.seed,
            model_config=self.config.ssm_config,
        )
        self.model = load_model(self._npz_path())
        return {**result, "backend": "ssm"}

    def _ensure_model(self) -> Dict[str, Any]:
        if self.model is None:
            self.model = load_model(self._npz_path())
        return self.model

    def _predict_logits(self, sequence: np.ndarray) -> np.ndarray:
        model = self._ensure_model()
        out = predict_fn(model, sequence)
        return out["action_logits"]

    def decide_choice(
        self,
        sequence: np.ndarray,
        instructions: str = "",
        criteria: Optional[Dict[str, str]] = None,
        question_name: str = "",
    ) -> DecisionResult:
        logits = self._predict_logits(sequence)
        probs = _logits_to_probabilities(logits)
        pred_idx = int(np.argmax(probs))
        pred_label = ACTIVITY_TYPES[pred_idx] if pred_idx < len(ACTIVITY_TYPES) else "unknown"
        probabilities = {
            name: float(probs[i]) for i, name in enumerate(ACTIVITY_TYPES) if i < len(probs)
        }
        return DecisionResult(
            choice=pred_label,
            probabilities=probabilities,
            confidence=float(probs[pred_idx]),
            backend="ssm",
        )

    def decide_score(
        self,
        sequence: np.ndarray,
        instructions: str = "",
        criteria: Optional[List[str]] = None,
        question_name: str = "",
    ) -> DecisionResult:
        logits = self._predict_logits(sequence)
        probs = _logits_to_probabilities(logits)
        n = len(ACTIVITY_TYPES)
        score_value = 0.0
        if n > 0:
            score_value = sum(i * float(probs[i]) for i in range(min(n, len(probs))))
        return DecisionResult(
            score=score_value,
            probabilities={name: float(probs[i]) for i, name in enumerate(ACTIVITY_TYPES) if i < len(probs)},
            confidence=float(np.max(probs)),
            backend="ssm",
        )

    def decide_noul(
        self,
        sequence: np.ndarray,
        instructions: str = "",
        question_name: str = "",
    ) -> DecisionResult:
        logits = self._predict_logits(sequence)
        probs = _logits_to_probabilities(logits)
        return DecisionResult(
            noul=float(np.max(probs)),
            confidence=float(np.max(probs)),
            backend="ssm",
        )


def get_decisioner(config: DecisionerConfig):
    if config.backend == "system1":
        return System1Decisioner(config)
    if config.backend == "ssm":
        return SSMDecisioner(config)
    raise ValueError(f"Unknown backend: {config.backend}. Supported: system1, ssm")
