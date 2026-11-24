"""Reach-out tracker routes. Persistence only — no LinkedIn calls."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from database.reachout_crud import (
    STATUS_FILTERS,
    SORT_COLUMNS,
    DuplicateContactError,
    create_contact,
    delete_contact,
    get_reachout_stats,
    list_companies,
    list_contacts,
    update_contact,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from schemas.reachout import (
    CompanyListResponse,
    ContactCreate,
    ContactListResponse,
    ContactResponse,
    ContactUpdate,
    ReachoutStats,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/reachout", tags=["reachout"])


def get_db():
    from clients.db import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/contacts", response_model=ContactListResponse)
def get_contacts(
    search: Optional[str] = Query(
        None, description="Case-insensitive match on name, company, or role"
    ),
    company: Optional[str] = Query(
        None, description="Case-insensitive exact company name"
    ),
    status: str = Query(
        "all",
        description="all, reached_out, awaiting_reply, needs_follow_up, responded",
    ),
    sort: str = Query("importance", description="importance, name, or company"),
    order: str = Query("desc", description="asc or desc"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    status_key = (status or "all").strip().lower()
    if status_key not in STATUS_FILTERS:
        raise HTTPException(status_code=422, detail="Invalid status filter")
    sort_key = (sort or "importance").strip().lower()
    if sort_key not in SORT_COLUMNS:
        raise HTTPException(status_code=422, detail="Invalid sort")
    direction = "asc" if (order or "").strip().lower() == "asc" else "desc"

    rows, total = list_contacts(
        db,
        search=search,
        company=company,
        status=status_key,
        sort=sort_key,
        order=direction,
        limit=limit,
        offset=offset,
    )
    stats = get_reachout_stats(db)
    return ContactListResponse(
        contacts=[ContactResponse.model_validate(row) for row in rows],
        total=total,
        has_more=offset + len(rows) < total,
        stats=ReachoutStats(**stats),
    )


@router.get("/companies", response_model=CompanyListResponse)
def get_companies(db: Session = Depends(get_db)):
    return CompanyListResponse(companies=list_companies(db))


@router.post("/contacts", response_model=ContactResponse, status_code=201)
def post_contact(body: ContactCreate, db: Session = Depends(get_db)):
    try:
        row = create_contact(
            db,
            name=body.name,
            company=body.company,
            role=body.role,
            why=body.why,
            importance=body.importance,
        )
    except (IntegrityError, DuplicateContactError):
        raise HTTPException(
            status_code=409,
            detail="A contact with that name and company already exists",
        ) from None
    return row


@router.patch("/contacts/{contact_id}", response_model=ContactResponse)
def patch_contact(
    contact_id: UUID,
    body: ContactUpdate,
    db: Session = Depends(get_db),
):
    row = update_contact(
        db,
        contact_id,
        reached_out=body.reached_out,
        responded=body.responded,
        followed_up=body.followed_up,
        notes=body.notes,
        notes_set="notes" in body.model_fields_set,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    return row


@router.delete("/contacts/{contact_id}", status_code=204)
def remove_contact(contact_id: UUID, db: Session = Depends(get_db)):
    if not delete_contact(db, contact_id):
        raise HTTPException(status_code=404, detail="Contact not found")
    return Response(status_code=204)
