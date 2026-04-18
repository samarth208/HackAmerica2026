from pydantic import BaseModel
from typing import Optional


class WildfireEvent(BaseModel):
    id: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    frp: Optional[float] = None
    confidence: Optional[str] = None
    detected_at: Optional[str] = None
    source: Optional[str] = None


class SeismicEvent(BaseModel):
    id: Optional[int] = None
    usgs_event_id: Optional[str] = None
    magnitude: Optional[float] = None
    depth: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    detected_at: Optional[str] = None


class DamageCell(BaseModel):
    id: Optional[int] = None
    event_id: Optional[int] = None
    grid_cell_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    damage_probability: Optional[float] = None
    liquefaction_class: Optional[str] = None
    computed_at: Optional[str] = None


class ActionCard(BaseModel):
    id: Optional[int] = None
    action_type: Optional[str] = None
    resource_id: Optional[int] = None
    zone_id: Optional[int] = None
    confidence: Optional[float] = None
    time_sensitivity: Optional[str] = None
    rationale: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class Crew(BaseModel):
    id: Optional[int] = None
    crew_identifier: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    status: Optional[str] = None
    capacity: Optional[int] = None


class EventLog(BaseModel):
    id: Optional[int] = None
    source: Optional[str] = None
    message: Optional[str] = None
    created_at: Optional[str] = None
