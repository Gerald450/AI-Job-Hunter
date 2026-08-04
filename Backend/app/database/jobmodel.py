import uuid

from database.models import Base
from model.job import Job
from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    apply_url: Mapped[str] = mapped_column(String)
    age: Mapped[str] = mapped_column(String)
    fingerprint: Mapped[str] = mapped_column(String, unique=True)
    source: Mapped[str] = mapped_column(String)
    faang: Mapped[bool] = mapped_column(Boolean)
    no_sponsorship: Mapped[bool] = mapped_column(Boolean)
    citizenship_required: Mapped[bool] = mapped_column(Boolean)
    advanced_degree: Mapped[bool] = mapped_column(Boolean)
    closed: Mapped[bool] = mapped_column(Boolean)

    @classmethod
    def from_job(cls, job: Job) -> "JobModel":

        return cls(
            id=uuid.uuid4(),
            company=job.company,
            role=job.role,
            location=job.location,
            apply_url=job.apply_url,
            age=job.age,
            fingerprint=job.fingerprint,
            source=job.source,
            faang=job.faang,
            no_sponsorship=job.no_sponsorship,
            citizenship_required=job.citizenship_required,
            advanced_degree=job.advanced_degree,
            closed=job.closed,
        )
