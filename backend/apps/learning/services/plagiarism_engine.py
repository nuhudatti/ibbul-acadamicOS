"""
MVP plagiarism / similarity engine — string overlap, cosine similarity, duplicate detection.
Pure Python — no external ML dependencies required.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any


def normalize_text(text: str) -> str:
    t = (text or '').lower().strip()
    t = re.sub(r'[^\w\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def _tokenize(text: str) -> list[str]:
    return [w for w in normalize_text(text).split() if len(w) > 2]


def cosine_similarity(a: str, b: str) -> float:
    ta, tb = _tokenize(a), _tokenize(b)
    if not ta or not tb:
        return 0.0
    ca, cb = Counter(ta), Counter(tb)
    dot = sum(ca[t] * cb.get(t, 0) for t in ca)
    na = math.sqrt(sum(v * v for v in ca.values()))
    nb = math.sqrt(sum(v * v for v in cb.values()))
    if na == 0 or nb == 0:
        return 0.0
    return round(dot / (na * nb), 4)


def string_overlap_ratio(a: str, b: str) -> float:
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    if shorter in longer:
        return round(len(shorter) / len(longer), 4)
    return 0.0


def compare_texts(source: str, target: str) -> dict[str, Any]:
    cosine = cosine_similarity(source, target)
    overlap = string_overlap_ratio(source, target)
    combined = round(max(cosine, overlap), 4)
    flagged = combined >= 0.85 or (cosine >= 0.75 and overlap >= 0.5)
    return {
        'cosine_similarity': cosine,
        'string_overlap': overlap,
        'combined_score': combined,
        'flagged': flagged,
    }


def check_against_corpus(
    text: str,
    corpus: list[dict[str, Any]],
    *,
    threshold: float = 0.85,
) -> dict[str, Any]:
    """
    corpus: [{ 'id': ..., 'label': ..., 'text': ... }, ...]
    Returns highest match and whether plagiarism is suspected.
    """
    if not (text or '').strip():
        return {'highest_score': 0.0, 'flagged': False, 'matches': []}

    matches = []
    highest = 0.0
    for item in corpus:
        if not item.get('text'):
            continue
        result = compare_texts(text, item['text'])
        score = result['combined_score']
        if score > highest:
            highest = score
        if score >= 0.5:
            matches.append({
                'id': item.get('id'),
                'label': item.get('label', ''),
                'score': score,
                'cosine_similarity': result['cosine_similarity'],
                'string_overlap': result['string_overlap'],
            })

    matches.sort(key=lambda m: m['score'], reverse=True)
    flagged = highest >= threshold or any(m['score'] >= threshold for m in matches[:3])
    return {
        'highest_score': round(highest, 4),
        'flagged': flagged,
        'threshold': threshold,
        'matches': matches[:5],
        'method': 'cosine+string_overlap+duplicate',
    }
