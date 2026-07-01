"""
Optional AI-assisted grading — backend only. Lecturer must approve final score.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Tuple

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
    course_code: str = '',
    course_title: str = '',
    assignment_title: str = '',
    question: str,
    student_answer: str,
    rubric: str = '',
    max_score: float = 100,
) -> Tuple[bool, dict[str, Any]]:
    from .plagiarism_engine import normalize_text

    answer = (student_answer or '').strip()
    if not answer:
        return True, {
            'suggested_score': 0,
            'feedback': 'No answer provided.',
            'strengths': [],
            'weaknesses': ['Empty submission'],
            'confidence_score': 1.0,
            'source': 'rule_based',
        }

    if not ai_grading_enabled():
        words = len(_tokenize(answer))
        base = min(max_score, max(10, words * 2)) if words >= 5 else 0
        return True, {
            'suggested_score': round(base, 2),
            'feedback': 'AI grading is disabled. Review manually. Enable AI_GRADING_ENABLED on the server.',
            'strengths': [],
            'weaknesses': [],
            'confidence_score': 0.5,
            'source': 'rule_based',
        }

    prompt = (
        f'You are a university academic grader for {course_code} — {course_title}.\n'
        f'Assignment: {assignment_title}\n'
        f'Maximum score: {max_score}\n\n'
        f'Question / instructions:\n{question}\n\n'
        f'Marking rubric:\n{rubric or "Grade on accuracy, clarity, structure, and completeness."}\n\n'
        f'Student answer:\n{answer}\n\n'
        'Respond ONLY with valid JSON:\n'
        '{"suggested_score": number, "feedback": "string", "strengths": ["..."], '
        '"weaknesses": ["..."], "confidence_score": number between 0 and 1}'
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
        confidence = parsed.get('confidence_score', 0.75)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.75
        return True, {
            'suggested_score': round(score, 2),
            'feedback': str(parsed.get('feedback', ''))[:2000],
            'strengths': parsed.get('strengths') or [],
            'weaknesses': parsed.get('weaknesses') or [],
            'confidence_score': round(confidence, 2),
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
