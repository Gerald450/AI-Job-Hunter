"""Tests for role-family classification and early-career filtering."""

from __future__ import annotations

from processors.classify import classify_role_family
from processors.early_career import is_early_career


def test_classify_software_engineering():
    assert classify_role_family("Software Engineer, New Grad") == "software_engineering"


def test_classify_ai_ml():
    assert classify_role_family("Machine Learning Engineer") == "ai_ml"
    assert classify_role_family("Applied Scientist") == "ai_ml"


def test_classify_product_manager():
    assert classify_role_family("Associate Product Manager") == "product_management"


def test_classify_unknown():
    assert classify_role_family("Chief Financial Officer") is None


def test_early_career_accepts_new_grad():
    assert is_early_career("Software Engineer New Grad") is True
    assert is_early_career("Entry Level Backend Engineer") is True


def test_early_career_rejects_intern_and_senior():
    assert is_early_career("Software Engineering Intern") is False
    assert is_early_career("Senior Software Engineer") is False
    assert is_early_career("Sr. Software Engineer") is False
    assert is_early_career("Staff Engineer") is False


def test_early_career_does_not_reject_product_manager():
    assert is_early_career("Product Manager") is True
    assert is_early_career("Associate Product Manager") is True
    assert is_early_career("Sr. Product Manager, Community") is False


def test_early_career_intern_not_international():
    assert is_early_career("International Software Engineer New Grad") is True
