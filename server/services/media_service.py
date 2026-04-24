"""Media upload / validation per §6.8 + §T.9.

Every upload is validated twice:
1. Magic-byte check via ``PIL.Image.open`` — untrusted ``filename`` extension
   cannot force us to mis-interpret a payload.
2. Size cap from ``MEDIA_LIMITS`` per ``media_type``.

Files are stored under ``MEDIA_DIR / {subdir}/{uuid}.{ext}``. Retention and
cleanup are V2 concerns.
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from config import MEDIA_DIR, MEDIA_LIMITS
from models.media import MediaFile
from models.user import User

_SUBDIR_FOR_TYPE = {
    "avatar": "avatars",
    "cover": "covers",
    "node_image": "nodes",
}
_EXT_FOR_FORMAT = {
    "JPEG": "jpg",
    "PNG": "png",
    "WEBP": "webp",
    "GIF": "gif",
}


def _validate_media_type(media_type: str) -> dict:
    limits = MEDIA_LIMITS.get(media_type)
    if limits is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Неизвестный тип медиа: {media_type}",
        )
    return limits


async def _read_and_check_size(upload: UploadFile, max_mb: int) -> bytes:
    data = await upload.read()
    if len(data) > max_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"Файл превышает лимит {max_mb} МБ",
        )
    return data


def _identify_image(data: bytes, allowed_formats: list[str]) -> str:
    """Returns the Pillow-detected format; raises 422 otherwise."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
            fmt = (img.format or "").upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Не удалось распознать изображение",
        ) from exc
    if fmt not in allowed_formats:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Формат {fmt} не разрешён. Допустимые: {', '.join(allowed_formats)}",
        )
    return fmt


class MediaService:
    @staticmethod
    async def upload(
        db: Session,
        *,
        media_type: str,
        upload: UploadFile,
        uploader: User,
    ) -> MediaFile:
        limits = _validate_media_type(media_type)
        data = await _read_and_check_size(upload, int(limits["max_mb"]))
        fmt = _identify_image(data, list(limits["formats"]))

        subdir = _SUBDIR_FOR_TYPE[media_type]
        ext = _EXT_FOR_FORMAT[fmt]
        filename = f"{uuid.uuid4().hex}.{ext}"
        rel_path = f"{subdir}/{filename}"
        abs_path = Path(MEDIA_DIR) / rel_path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(data)

        record = MediaFile(
            filename=upload.filename or filename,
            path=rel_path,
            mime_type=upload.content_type or f"image/{ext}",
            file_size=len(data),
            media_type=media_type,
            uploaded_by=uploader.id,
        )
        db.add(record)
        db.flush()
        db.refresh(record)
        return record
