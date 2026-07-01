"""
Optional AI-assisted grading — backend only. Lecturer must approve final score.
Supports Ollama-compatible HTTP API or disabled stub.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Optional, Tuple

from django.conf import settings

logger = logging.getLogger(__name__)


def ai_grading_enabled() -> bool:
    flag = getattr(settings, 'AI_GRADING_ENABLED', False)
    if isinstance(flag, str):
        return flag.lower() in ('1', 'true', 'yes')
    return bool(flag)


def _ollama_url() -> str:
    base = getattr(settings, 'AI_API_URL', 'http://127.0.0.1:11434').rstrip('/')
    return f'{base}/api/generate'


def _model_name() -> str:
    return getattr(settings, 'AI_MODEL', 'mistral') or 'mistral'


def suggest_grade(
    *,
    question: str,
    student_answer: str,
    rubric: str = '',
    max_score: float = 100,
) -> Tuple[bool, dict[str, Any]]:
    """
    Returns (ok, { suggested_score, feedback, strengths, weaknesses, source }).
    Falls back to similarity-only suggestion when AI is disabled.
    """
    from .plagiarism_engine import normalize_text

    answer = (student_answer or '').strip()
    if not answer:
        return True, {
            'suggested_score': 0,
            'feedback': 'No answer provided.',
            'strengths': [],
            'weaknesses': ['Empty submission'],
            'source': 'rule_based',
        }

    if not ai_grading_enabled():
        ref = normalize_text(rubric or question)
        words = len(_tokenize(answer))
        base = min(max_score, max(10, words * 2)) if words >= 5 else 0
        return True, {
            'suggested_score': round(base, 2),
            'feedback': 'AI grading is disabled. Review manually. Enable AI_GRADING_ENABLED on the server for AI suggestions.',
            'strengths': [],
            'weaknesses': [],
            'source': 'rule_based',
        }

    prompt = (
        f'You are an academic grader. Score the student answer out of {max_score}.\n'
        f'Question: {question}\n'
        f'Rubric: {rubric or "Grade on accuracy, clarity, and completeness."}\n'
        f'Student answer:\n{answer}\n\n'
        'Respond ONLY with valid JSON:\n'
        '{"suggested_score": number, "feedback": "string", "strengths": ["..."], "weaknesses": ["..."]}'
    )

    payload = json.dumps({
        'model': _model_name(),
        'prompt': prompt,
        'stream': False,
        'format': 'json',
    }).encode('utf-8')

    req = urllib.request.Request(
        _ollama_url(),
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    timeout = int(getattr(settings, 'AI_TIMEOUT', 60))

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode('utf-8'))
        raw = body.get('response') or body.get('message', {}).get('content') or '{}'
        parsed = json.loads(raw) if isinstance(raw, str) else raw
        score = float(parsed.get('suggested_score', 0))
        score = max(0, min(max_score, score))
        return True, {
            'suggested_score': round(score, 2),
            'feedback': str(parsed.get('feedback', ''))[:2000],
            'strengths': parsed.get('strengths') or [],
            'weaknesses': parsed.get('weaknesses') or [],
            'source': 'ai',
            'model': _model_name(),
        }
    except (urllib.error.URLError, json.JSONDecodeError, ValueError, KeyError) as exc:
        logger.warning('AI grading failed: %s', exc)
        return False, {
            'error': str(exc)[:300],
            'source': 'ai_error',
        }


def _tokenize(text: str) -> list[str]:
    import re
    t = re.sub(r'[^\w\s]', ' ', (text or '').lower())
    return [w for w in t.split() if len(w) > 2]
