"""Tests for SimplifyJobs list-source parsing and filtering."""

from __future__ import annotations

from fetchers.simplify import SimplifyFetcher
from processors.normalize import infer_no_sponsorship, normalize_job
from processors.readme_table import parse_readme_tables
from utils.fingerprint import create_fingerprint

SAMPLE_README = """
# 2026 New Grad Positions

## Legend

🛂 Does NOT offer sponsorship

## 💻 Software Engineering New Grad Roles

<table>
<thead>
<tr>
<th>Company</th>
<th>Role</th>
<th>Location</th>
<th>Application</th>
<th>Age</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>🔥 Acme</strong></td>
<td>Software Engineer New Grad</td>
<td>San Jose, CA</td>
<td>
  <a href="https://boards.greenhouse.io/acme/jobs/123">
    <img alt="Apply" src="https://example.com/apply.png"/>
  </a>
  <a href="https://simplify.jobs/p/abc">
    <img alt="Simplify" src="https://example.com/simplify.png"/>
  </a>
</td>
<td>0d</td>
</tr>
<tr>
<td>↳</td>
<td>Backend Engineer New Grad 🛂</td>
<td>Remote</td>
<td>
  <a href="https://jobs.lever.co/acme/abc-def">
    <img alt="Apply" src="https://example.com/apply.png"/>
  </a>
</td>
<td>1d</td>
</tr>
<tr>
<td>Beta Corp</td>
<td>Entry Level Software Engineer</td>
<td></td>
<td>
  <a href="https://jobs.ashbyhq.com/beta/11111111-2222-3333-4444-555555555555">
    Apply
  </a>
</td>
<td>2d</td>
</tr>
<tr>
<td>Gamma Inc</td>
<td>Software Engineer New Grad</td>
<td>Austin, TX</td>
<td>
  <a href="https://example.com/apply/gamma">Apply</a>
</td>
<td>3d</td>
</tr>
<tr>
<td>Delta</td>
<td>Software Engineering Intern</td>
<td>NYC</td>
<td><a href="https://example.com/intern">Apply</a></td>
<td>1d</td>
</tr>
<tr>
<td>Epsilon</td>
<td>Senior Software Engineer</td>
<td>Seattle, WA</td>
<td><a href="https://example.com/senior">Apply</a></td>
<td>1d</td>
</tr>
<tr>
<td>Zeta</td>
<td>MBA Leadership Program</td>
<td>Boston, MA</td>
<td><a href="https://example.com/mba">Apply</a></td>
<td>1d</td>
</tr>
<tr>
  <td>Broken</td>
  <td>Only two cells
</tr>
</tbody>
</table>

<details>
<summary>🗃️ Inactive roles (2)</summary>
<table>
<thead>
<tr><th>Company</th><th>Role</th><th>Location</th><th>Application</th><th>Age</th></tr>
</thead>
<tbody>
<tr>
<td>OldCo</td>
<td>Software Engineer New Grad</td>
<td>Nowhere</td>
<td><a href="https://example.com/old">Apply</a></td>
<td>7mo</td>
</tr>
</tbody>
</table>
</details>

## 📱 Product Management New Grad Roles

<table>
<thead>
<tr><th>Company</th><th>Role</th><th>Location</th><th>Application</th><th>Age</th></tr>
</thead>
<tbody>
<tr>
<td>PM Co</td>
<td>Associate Product Manager New Grad</td>
<td>SF</td>
<td><a href="https://example.com/pm">Apply</a></td>
<td>1d</td>
</tr>
</tbody>
</table>

## 🤖 Data Science, AI & Machine Learning New Grad Roles

<table>
<thead>
<tr>
<th>Company</th>
<th>Role</th>
<th>Location</th>
<th>Application</th>
<th>Age</th>
<th>Notes</th>
</tr>
</thead>
<tbody>
<tr>
<td>DataCo</td>
<td>Data Engineer New Grad</td>
<td>Hybrid - NYC</td>
<td><a href="https://example.com/data">Apply</a></td>
<td>4d</td>
<td>Will not sponsor visas</td>
</tr>
<tr>
<td>AuthCo</td>
<td>ML Engineer Entry Level</td>
<td>Remote</td>
<td><a href="https://example.com/ml">Apply</a></td>
<td>5d</td>
<td>US work authorization required</td>
</tr>
</tbody>
</table>
"""


def test_parse_normal_row_prefers_apply_link() -> None:
    jobs = parse_readme_tables(
        SAMPLE_README,
        source="simplify",
        allowed_section_keywords=("Software Engineering",),
        skip_inactive=True,
    )
    acme = next(j for j in jobs if j["role"] == "Software Engineer New Grad")
    assert acme["company"] == "🔥 Acme"
    assert acme["location"] == "San Jose, CA"
    assert acme["apply_url"] == "https://boards.greenhouse.io/acme/jobs/123"
    assert acme["age"] == "0d"
    assert acme["source"] == "simplify"


def test_continuation_row_inherits_company() -> None:
    jobs = parse_readme_tables(
        SAMPLE_README,
        source="simplify",
        allowed_section_keywords=("Software Engineering",),
    )
    backend = next(j for j in jobs if "Backend Engineer" in j["role"])
    assert backend["company"] == "🔥 Acme"
    assert "🛂" in backend["role"]


def test_missing_location_still_parses() -> None:
    jobs = parse_readme_tables(
        SAMPLE_README,
        source="simplify",
        allowed_section_keywords=("Software Engineering",),
    )
    beta = next(j for j in jobs if j["company"] == "Beta Corp")
    assert beta["location"] == ""
    assert "ashbyhq.com" in beta["apply_url"]


def test_missing_notes_column_ok() -> None:
    jobs = parse_readme_tables(
        SAMPLE_README,
        source="simplify",
        allowed_section_keywords=("Software Engineering",),
    )
    gamma = next(j for j in jobs if j["company"] == "Gamma Inc")
    assert gamma["notes"] == ""


def test_inactive_and_non_swe_sections_skipped() -> None:
    jobs = parse_readme_tables(
        SAMPLE_README,
        source="simplify",
        allowed_section_keywords=(
            "Software Engineering",
            "Data Science",
            "Machine Learning",
        ),
        skip_inactive=True,
    )
    companies = {j["company"] for j in jobs}
    assert "OldCo" not in companies
    assert "PM Co" not in companies
    assert "DataCo" in companies


def test_malformed_row_skipped() -> None:
    jobs = parse_readme_tables(
        SAMPLE_README,
        source="simplify",
        allowed_section_keywords=("Software Engineering",),
    )
    assert all(j["company"] != "Broken" for j in jobs)


def test_simplify_fetcher_filters_intern_senior_mba() -> None:
    fetcher = SimplifyFetcher(readme_fetcher=lambda: SAMPLE_README)
    jobs = fetcher.parse(SAMPLE_README)
    roles = {job.role for job in jobs}

    assert "Software Engineer New Grad" in roles
    assert "Backend Engineer New Grad" in roles
    assert "Entry Level Software Engineer" in roles
    assert "Data Engineer New Grad" in roles
    assert "ML Engineer Entry Level" in roles

    assert "Software Engineering Intern" not in roles
    assert "Senior Software Engineer" not in roles
    assert "MBA Leadership Program" not in roles
    assert "Associate Product Manager New Grad" not in roles


def test_sponsorship_emoji_and_notes() -> None:
    fetcher = SimplifyFetcher(readme_fetcher=lambda: SAMPLE_README)
    jobs = fetcher.parse(SAMPLE_README)
    by_role = {job.role: job for job in jobs}

    assert by_role["Backend Engineer New Grad"].no_sponsorship is True  # 🛂
    assert by_role["Software Engineer New Grad"].no_sponsorship is False
    assert by_role["Data Engineer New Grad"].no_sponsorship is True  # will not sponsor
    assert by_role["ML Engineer Entry Level"].no_sponsorship is True  # work auth
    assert by_role["Entry Level Software Engineer"].no_sponsorship is False


def test_infer_no_sponsorship_does_not_guess() -> None:
    assert infer_no_sponsorship("Great benefits, hybrid work") is False
    assert infer_no_sponsorship("No sponsorship available") is True
    assert infer_no_sponsorship("US work authorization required") is True
    assert infer_no_sponsorship("🛂") is True


def test_duplicate_fingerprint_across_sources() -> None:
    """Same posting from two sources shares a fingerprint for DB upsert dedup."""
    shared = {
        "company": "Acme",
        "role": "Software Engineer New Grad",
        "location": "San Jose, CA",
        "apply_url": "https://boards.greenhouse.io/acme/jobs/123",
        "age": "0d",
    }
    pitt = normalize_job({**shared, "source": "pittcsc"})
    simp = normalize_job({**shared, "source": "simplify"})
    assert pitt.fingerprint == simp.fingerprint
    assert pitt.fingerprint == create_fingerprint(shared)


def test_normalize_missing_notes_defaults() -> None:
    job = normalize_job(
        {
            "company": "Solo",
            "role": "Junior Engineer",
            "location": "Remote",
            "apply_url": "https://example.com/solo",
            "age": "1d",
            "source": "simplify",
        }
    )
    assert job.no_sponsorship is False
    assert job.location == "Remote"
    assert job.source == "simplify"
