from pydantic import BaseModel


class Job(BaseModel):
    company: str
    role: str
    location: str
    apply_url: str
    age: str
    source: str
    faang: bool
    no_sponsorship: bool
    citizenship_required: bool
    closed: bool
    advanced_degree: bool
