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
Score overall_match from 0-100 based on: visa sponsorship eligibility,
required years of experience, required skills, preferred skills, education,
technologies, projects, leadership, and certifications.

Visa sponsorship (critical for international candidates):
- Check the job description AND any provided sponsorship metadata for signals
  that the employer does NOT sponsor (e.g. "no sponsorship", "must be
  authorized to work without sponsorship", "US citizenship required",
  "will not sponsor visas", "H-1B not available").
- If the role/company clearly does not sponsor, this is a near-disqualifying
  mismatch: overall_match must drop drastically (typically ≤25), state that
  clearly in summary, add sponsorship to missing_skills / missing_keywords,
  and recommend applying only to sponsoring employers.
- If sponsorship is explicitly offered, treat that as a positive signal.
- If sponsorship is unknown / unmentioned, do not invent a penalty — score
  on qualifications only.

Years of experience (critical):
- Extract any stated experience requirements from the job (e.g. "2+ years",
  "3 years industry experience", "0-2 years", "new grad", "entry level").
- Infer the candidate's experience from resume dates/titles. Treat internships,
  co-ops, research assistantships, and student roles as internship/academic
  experience — NOT full-time industry experience unless clearly full-time.
- If the role needs substantially more industry experience than the candidate
  has (example: new grad / ~0-1 year internship vs "2+ years of industry
  experience"), this is a major mismatch: lower overall_match meaningfully
  (typically into a weak/poor range), call it out in summary and
  missing_skills / missing_keywords, and add a recommended_improvement.
- Entry-level / new-grad / "0-1 years" / "up to 2 years" postings should NOT
  be penalized for limited internship history.
- Preferring "nice to have" experience should reduce the score less than a
  hard required years threshold.

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
- Identify transferable experience when relevant, but do not treat internships
  as equivalent to multi-year industry tenure when the JD requires the latter.
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
    sponsorship: dict[str, Any] | None = None,
) -> str:
    resume_json = json.dumps(parsed_resume, ensure_ascii=False, indent=2)
    parts = [
        f"Job title: {job_title}",
        f"Company: {company}",
        f"Location: {location}",
        "",
        f"Job description:\n{description}",
        "",
        f"Parsed resume (JSON):\n{resume_json}",
    ]
    if sponsorship:
        parts.extend(
            [
                "",
                "Sponsorship metadata (from pipeline; trust when explicit):",
                json.dumps(sponsorship, ensure_ascii=False, indent=2),
            ]
        )
    parts.extend(
        [
            "",
            "When scoring, explicitly weigh: (1) visa sponsorship eligibility, "
            "(2) required years of experience vs the candidate's actual tenure "
            "(internships ≠ multi-year industry). If sponsorship is explicitly "
            "denied, overall_match must drop drastically (typically ≤25).",
        ]
    )
    return "\n".join(parts)


MAP_FORM_FIELDS_SYSTEM = """\
You map a candidate's structured profile onto unresolved job-application form
fields. Return ONLY valid JSON matching this schema:
{
  "fields": [
    {
      "uid": "",
      "selector": "",
      "field": "",
      "value": "",
      "profile_field": "",
      "confidence": 0.0,
      "explanation": ""
    }
  ]
}
Rules:
- Only fill fields when the profile clearly supports a value.
- Omit a field entirely (do not invent) when the answer is unknown.
- confidence is 0.0–1.0 (how sure you are the mapping is correct).
- Include a brief explanation when confidence < 0.90.
- For select/radio/checkbox/combobox, prefer an exact or closest option from
  the provided options list.
- Infer equivalent labels (e.g. "Given Name", "Legal First Name" → first_name).
- Common profile_field keys: first_name, middle_name, last_name, full_name, email, phone,
  linkedin, website, portfolio, location, preferred_location,
  work_authorization, sponsorship, at_least_18, years_experience, education,
  degree, field_of_study, graduation_date, gpa, current_employer,
  salary_expectation, desired_salary, salary, availability, gender, veteran,
  race, disability, hear_about_us.
- Booleans for yes/no questions should use true/false or match option text
  (Yes/No) when options are provided.
- Never invent employers, degrees, dates, or contact details not in the profile.
- Never put a postal / street address into website, URL, portfolio, or LinkedIn
  fields. Only fill those with an http(s) URL or domain from the profile; omit
  the field if no link is available.
"""


def build_map_form_fields_user_prompt(
    *,
    profile: dict[str, Any],
    fields: list[dict[str, Any]],
    job_context: dict[str, Any] | None = None,
) -> str:
    parts = [
        "Candidate profile (JSON):",
        json.dumps(profile, ensure_ascii=False, indent=2),
        "",
        "Unresolved form fields (JSON):",
        json.dumps(fields, ensure_ascii=False, indent=2),
    ]
    if job_context:
        parts.extend(
            [
                "",
                "Job / page context (JSON):",
                json.dumps(job_context, ensure_ascii=False, indent=2),
            ]
        )
    parts.append("\nReturn JSON mappings for fields you can confidently answer.")
    return "\n".join(parts)
