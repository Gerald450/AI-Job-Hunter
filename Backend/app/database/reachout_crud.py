"""CRUD and idempotent seed for LinkedIn outreach contacts.

Follow-up is derived, not stored independently:

- If responded is true, reached_out and followed_up are true.
- If responded is false, followed_up equals followed_up_manual.
- A client-supplied followed_up only updates followed_up_manual when
  responded is false. It never changes responded.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from database.reachoutmodel import LinkedInContact, LinkedInContactDeletion
from sqlalchemy import func, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class DuplicateContactError(Exception):
    """A contact with the same name and company already exists."""

DEFAULT_CONTACTS_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "linkedin-contacts.json"
)

STATUS_FILTERS = {
    "all",
    "reached_out",
    "awaiting_reply",
    "needs_follow_up",
    "responded",
}
SORT_COLUMNS = {"importance", "name", "company"}


def apply_outreach_update(
    reached_out: bool,
    responded: bool,
    followed_up_manual: bool,
    *,
    reached_out_patch: Optional[bool] = None,
    responded_patch: Optional[bool] = None,
    followed_up_patch: Optional[bool] = None,
) -> tuple[bool, bool, bool, bool]:
    """Return reached_out, responded, followed_up, followed_up_manual."""
    next_responded = responded if responded_patch is None else responded_patch
    next_manual = followed_up_manual
    if followed_up_patch is not None and next_responded is False:
        next_manual = followed_up_patch
    if next_responded:
        next_reached = True
        next_followed = True
    else:
        next_reached = (
            reached_out if reached_out_patch is None else reached_out_patch
        )
        next_followed = next_manual
    return next_reached, next_responded, next_followed, next_manual


def get_reachout_stats(db: Session) -> dict[str, int]:
    """Global counts. Responded implies reached out; follow-up need uses the manual flag."""
    total = db.query(func.count(LinkedInContact.id)).scalar() or 0
    reached_out = (
        db.query(func.count(LinkedInContact.id))
        .filter(
            or_(
                LinkedInContact.reached_out.is_(True),
                LinkedInContact.responded.is_(True),
            )
        )
        .scalar()
        or 0
    )
    responded = (
        db.query(func.count(LinkedInContact.id))
        .filter(LinkedInContact.responded.is_(True))
        .scalar()
        or 0
    )
    needs_follow_up = (
        db.query(func.count(LinkedInContact.id))
        .filter(
            LinkedInContact.reached_out.is_(True),
            LinkedInContact.responded.is_(False),
            LinkedInContact.followed_up_manual.is_(False),
        )
        .scalar()
        or 0
    )
    return {
        "total": int(total),
        "reached_out": int(reached_out),
        "responded": int(responded),
        "needs_follow_up": int(needs_follow_up),
    }


def list_companies(db: Session) -> list[str]:
    rows = db.query(LinkedInContact.company).distinct().all()
    names = [company for (company,) in rows if company]
    return sorted(names, key=str.casefold)


def list_contacts(
    db: Session,
    *,
    search: Optional[str] = None,
    company: Optional[str] = None,
    status: str = "all",
    sort: str = "importance",
    order: str = "desc",
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[LinkedInContact], int]:
    query = db.query(LinkedInContact)

    term = (search or "").strip()
    if term:
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.filter(
            or_(
                LinkedInContact.name.ilike(pattern, escape="\\"),
                LinkedInContact.company.ilike(pattern, escape="\\"),
                LinkedInContact.role.ilike(pattern, escape="\\"),
            )
        )

    company_name = (company or "").strip()
    if company_name:
        query = query.filter(func.lower(LinkedInContact.company) == company_name.lower())

    if status == "reached_out":
        query = query.filter(
            or_(
                LinkedInContact.reached_out.is_(True),
                LinkedInContact.responded.is_(True),
            )
        )
    elif status == "awaiting_reply":
        query = query.filter(
            LinkedInContact.reached_out.is_(True),
            LinkedInContact.responded.is_(False),
        )
    elif status == "needs_follow_up":
        query = query.filter(
            LinkedInContact.reached_out.is_(True),
            LinkedInContact.responded.is_(False),
            LinkedInContact.followed_up_manual.is_(False),
        )
    elif status == "responded":
        query = query.filter(LinkedInContact.responded.is_(True))

    total = query.count()

    sort_key = sort if sort in SORT_COLUMNS else "importance"
    direction = "asc" if order == "asc" else "desc"
    column = {
        "importance": LinkedInContact.importance,
        "name": func.lower(LinkedInContact.name),
        "company": func.lower(LinkedInContact.company),
    }[sort_key]
    ordered = column.asc() if direction == "asc" else column.desc()
    rows = (
        query.order_by(ordered, LinkedInContact.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return rows, int(total)


def create_contact(
    db: Session,
    *,
    name: str,
    company: str,
    role: str,
    why: str,
    importance: int,
) -> LinkedInContact:
    existing = (
        db.query(LinkedInContact.id)
        .filter(
            func.lower(LinkedInContact.name) == name.lower(),
            func.lower(LinkedInContact.company) == company.lower(),
        )
        .first()
    )
    if existing is not None:
        raise DuplicateContactError(name)

    db.query(LinkedInContactDeletion).filter(
        func.lower(LinkedInContactDeletion.name) == name.lower(),
        func.lower(LinkedInContactDeletion.company) == company.lower(),
    ).delete(synchronize_session=False)

    now = datetime.now(timezone.utc)
    row = LinkedInContact(
        id=uuid.uuid4(),
        name=name,
        company=company,
        role=role,
        why=why,
        importance=importance,
        reached_out=False,
        responded=False,
        followed_up=False,
        followed_up_manual=False,
        notes=None,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise
    db.refresh(row)
    return row


def update_contact(
    db: Session,
    contact_id: uuid.UUID,
    *,
    reached_out: Optional[bool] = None,
    responded: Optional[bool] = None,
    followed_up: Optional[bool] = None,
    notes: Optional[str] = None,
    notes_set: bool = False,
) -> Optional[LinkedInContact]:
    row = db.get(LinkedInContact, contact_id)
    if row is None:
        return None

    reached, responded_value, followed, manual = apply_outreach_update(
        row.reached_out,
        row.responded,
        row.followed_up_manual,
        reached_out_patch=reached_out,
        responded_patch=responded,
        followed_up_patch=followed_up,
    )
    row.reached_out = reached
    row.responded = responded_value
    row.followed_up = followed
    row.followed_up_manual = manual
    if notes_set:
        row.notes = notes
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def delete_contact(db: Session, contact_id: uuid.UUID) -> bool:
    """Remove a contact and remember the name so the seed does not restore it."""
    row = db.get(LinkedInContact, contact_id)
    if row is None:
        return False

    now = datetime.now(timezone.utc)
    stmt = insert(LinkedInContactDeletion).values(
        id=uuid.uuid4(),
        name=row.name,
        company=row.company,
        deleted_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["name", "company"],
        set_={"deleted_at": stmt.excluded.deleted_at},
    )
    db.execute(stmt)
    db.delete(row)
    db.commit()
    return True


def seed_linkedin_contacts(
    db: Session,
    path: Optional[Path] = None,
) -> int:
    """Upsert contacts from JSON.

    Re-running does not duplicate rows or reset outreach. Contacts the user
    deleted stay deleted until they add that name and company again.
    """
    data_path = path or DEFAULT_CONTACTS_PATH
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{data_path} must contain a JSON list")

    now = datetime.now(timezone.utc)
    removed = {
        (name, company)
        for name, company in db.query(
            LinkedInContactDeletion.name,
            LinkedInContactDeletion.company,
        ).all()
    }
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise ValueError(f"Contact at index {index} is not an object")
        name = str(item.get("name") or "").strip()
        company = str(item.get("company") or "").strip()
        if not name or not company:
            raise ValueError(f"Contact at index {index} is missing name or company")
        key = (name, company)
        if key in seen or key in removed:
            continue
        seen.add(key)
        importance = int(item["importance"])
        if importance < 0 or importance > 100:
            raise ValueError(
                f"Contact {name} at {company} has importance {importance} outside 0-100"
            )
        rows.append(
            {
                "id": uuid.uuid4(),
                "name": name,
                "company": company,
                "role": str(item.get("role") or "").strip(),
                "why": str(item.get("why") or "").strip(),
                "importance": importance,
                "reached_out": False,
                "responded": False,
                "followed_up": False,
                "followed_up_manual": False,
                "notes": None,
                "created_at": now,
                "updated_at": now,
            }
        )

    if rows:
        stmt = insert(LinkedInContact).values(rows)
        excluded = stmt.excluded
        stmt = stmt.on_conflict_do_update(
            index_elements=["name", "company"],
            set_={
                "role": excluded.role,
                "why": excluded.why,
                "importance": excluded.importance,
                "updated_at": excluded.updated_at,
            },
        )
        db.execute(stmt)
        db.commit()

    count = db.query(func.count(LinkedInContact.id)).scalar() or 0
    logger.info("LinkedIn contact seed complete: count=%s", count)
    return int(count)
