"""Prompt templates for Groq resume parse and match analysis."""

from __future__ import annotations

import json
from typing import Any

PARSE_RESUME_SYSTEM = """\
You are a resume parser. Extract structured information from the resume text.
Return ONLY valid JSON matching this schema (use empty arrays/strings when absent):
{
  "education": [{"school": "", "degree": "", "field": "", "dates": ""}],
  "experience": [{"company": "", "title": "", "dates": "", "bullets": []}],
  "projects": [{"name": "", "description": "", "technologies": []}],
  "skills": [],
  "technologies": [],
  "certifications": [],
  "leadership": [],
  "awards": []
}
Rules:
- Only include information explicitly present in the resume.
- Do not invent or hallucinate qualifications.
- Prefer concise bullet text from the resume.
"""

MATCH_RESUME_SYSTEM = """\
You are a resume matching assistant. Compare a candidate's resume against a job
description and estimate Resume Match based on qualifications alignment only.

Do NOT estimate whether the candidate will get hired or receive an offer.
Score overall_match from 0-100 based on: required skills, preferred skills,
experience, education, technologies, projects, leadership, and certifications.

Return ONLY valid JSON matching this schema:
{
  "overall_match": 0,
  "summary": "",
  "strengths": [],
  "missing_skills": [],
  "recommended_improvements": [],
  "matched_keywords": [],
  "missing_keywords": [],
  "confidence": "High"
}
confidence must be one of: High, Medium, Low.
Rules:
- Do not invent resume qualifications that are not present.
- Identify transferable experience when relevant.
- Be specific and actionable in recommended_improvements.
"""


def build_parse_user_prompt(resume_text: str) -> str:
    return f"Parse this resume:\n\n{resume_text}"


def build_match_user_prompt(
    *,
    parsed_resume: dict[str, Any],
    job_title: str,
    company: str,
    location: str,
    description: str,
) -> str:
    resume_json = json.dumps(parsed_resume, ensure_ascii=False, indent=2)
    return (
        f"Job title: {job_title}\n"
        f"Company: {company}\n"
        f"Location: {location}\n\n"
        f"Job description:\n{description}\n\n"
        f"Parsed resume (JSON):\n{resume_json}"
    )
