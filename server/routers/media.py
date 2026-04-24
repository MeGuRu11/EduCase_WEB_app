"""/api/media per PROJECT_DESIGN §6.8 + §T.9."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user, require_role
from models.user import User
from services.media_service import MediaService

router = APIRouter(prefix="/api/media", tags=["media"])


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("teacher", "admin"))],
)
async def upload_media(
    file: UploadFile = File(...),
    media_type: Literal["avatar", "cover", "node_image"] = Form(...),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    record = await MediaService.upload(
        db, media_type=media_type, upload=file, uploader=current
    )
    return {
        "id": record.id,
        "url": f"/media/{record.path}",
        "media_type": record.media_type,
        "file_size": record.file_size,
        "mime_type": record.mime_type,
    }
