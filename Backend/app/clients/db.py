import os

from database import jobmodel
from database.models import Base
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def drop_database():
    Base.metadata.drop_all(bind=engine)


def create_database():
    Base.metadata.create_all(bind=engine)
