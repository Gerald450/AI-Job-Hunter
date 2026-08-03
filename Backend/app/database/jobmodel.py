from database.models import Base
from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column


class JobModel(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    company: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    apply_url: Mapped[str] = mapped_column(String)
    age: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)

    faang: Mapped[bool] = mapped_column(Boolean)
    no_sponsorship: Mapped[bool] = mapped_column(Boolean)
    citizenship_required: Mapped[bool] = mapped_column(Boolean)
    advanced_degree: Mapped[bool] = mapped_column(Boolean)
    closed: Mapped[bool] = mapped_column(Boolean)
