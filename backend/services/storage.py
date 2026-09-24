from abc import ABC, abstractmethod
from pathlib import Path
from typing import Tuple, Optional
import os
import mimetypes
from logging_config import logger

class BaseVoiceStorage(ABC):
    @abstractmethod
    async def save_voice_note(self, filename: str, data: bytes, content_type: str) -> str:
        """Saves voice note data and returns the stored resource identifier or path."""
        pass

    @abstractmethod
    async def get_voice_note(self, filename: str) -> Tuple[bytes, str]:
        """Retrieves voice note bytes and content-type tuple. Raises FileNotFoundError if missing."""
        pass

    @abstractmethod
    def get_public_url(self, case_id: int, filename: str) -> str:
        """Returns the public URL endpoint for streaming or playback."""
        pass


class LocalVoiceStorage(BaseVoiceStorage):
    def __init__(self, base_dir: Optional[Path] = None):
        if base_dir is None:
            self.base_dir = Path(__file__).resolve().parents[1] / "uploads" / "voice"
        else:
            self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save_voice_note(self, filename: str, data: bytes, content_type: str) -> str:
        # Sanitize filename
        safe_filename = Path(filename).name
        target_path = self.base_dir / safe_filename
        target_path.write_bytes(data)
        logger.info(f"Saved voice recording locally: {safe_filename} ({len(data)} bytes)")
        return safe_filename

    async def get_voice_note(self, filename: str) -> Tuple[bytes, str]:
        safe_filename = Path(filename).name
        target_path = self.base_dir / safe_filename
        if not target_path.is_file():
            raise FileNotFoundError(f"Voice recording {safe_filename} not found")
        content_type, _ = mimetypes.guess_type(str(target_path))
        return target_path.read_bytes(), content_type or "audio/webm"

    def get_public_url(self, case_id: int, filename: str) -> str:
        safe_filename = Path(filename).name
        return f"/api/emergency/{case_id}/voice-note/{safe_filename}"


class S3VoiceStorage(BaseVoiceStorage):
    """Production S3-compatible cloud object store provider (AWS S3, Cloudflare R2, MinIO)."""

    def __init__(self):
        self.bucket = os.getenv("S3_BUCKET_NAME")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self.endpoint_url = os.getenv("S3_ENDPOINT_URL")  # For MinIO / Cloudflare R2
        self.access_key = os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        self.public_base_url = os.getenv("S3_PUBLIC_BASE_URL")

        if not self.bucket or not self.access_key or not self.secret_key:
            logger.warning(
                "S3VoiceStorage configured but S3_BUCKET_NAME / AWS credentials missing. "
                "Falling back to LocalVoiceStorage for local development."
            )
            self._fallback = LocalVoiceStorage()
        else:
            self._fallback = None

    async def save_voice_note(self, filename: str, data: bytes, content_type: str) -> str:
        if self._fallback:
            return await self._fallback.save_voice_note(filename, data, content_type)

        try:
            import boto3
            from botocore.config import Config

            client = boto3.client(
                "s3",
                region_name=self.region,
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                config=Config(signature_version="s3v4")
            )
            safe_filename = f"emergency-voice/{Path(filename).name}"
            client.put_object(
                Bucket=self.bucket,
                Key=safe_filename,
                Body=data,
                ContentType=content_type
            )
            logger.info(f"Uploaded voice recording to S3 bucket '{self.bucket}': {safe_filename}")
            return safe_filename
        except Exception as exc:
            logger.error(f"Failed to upload voice note to S3: {exc}")
            raise RuntimeError(f"Cloud voice storage upload error: {exc}")

    async def get_voice_note(self, filename: str) -> Tuple[bytes, str]:
        if self._fallback:
            return await self._fallback.get_voice_note(filename)

        try:
            import boto3
            client = boto3.client(
                "s3",
                region_name=self.region,
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key
            )
            safe_filename = f"emergency-voice/{Path(filename).name}"
            obj = client.get_object(Bucket=self.bucket, Key=safe_filename)
            return obj["Body"].read(), obj.get("ContentType", "audio/webm")
        except Exception as exc:
            logger.error(f"Failed to retrieve voice note from S3: {exc}")
            raise FileNotFoundError(f"Voice note not found in S3: {exc}")

    def get_public_url(self, case_id: int, filename: str) -> str:
        if self._fallback:
            return self._fallback.get_public_url(case_id, filename)

        safe_filename = Path(filename).name
        if self.public_base_url:
            return f"{self.public_base_url.rstrip('/')}/emergency-voice/{safe_filename}"
        return f"/api/emergency/{case_id}/voice-note/{safe_filename}"


def get_voice_storage() -> BaseVoiceStorage:
    backend_choice = os.getenv("STORAGE_BACKEND", "local").lower().strip()
    if backend_choice == "s3":
        return S3VoiceStorage()
    return LocalVoiceStorage()
