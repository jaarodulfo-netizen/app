"""JPEG conversion for Hikvision facial terminals.

This affects only the bytes transmitted for hardware enrollment. Original
employee photos remain unchanged in object storage.
"""
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_SOURCE_BYTES = 5 * 1024 * 1024
MAX_JPEG_BYTES = 200 * 1024
MAX_SOURCE_PIXELS = 20_000_000


def encode_hikvision_face_jpeg(source: bytes) -> bytes:
    """Return genuine, correctly oriented RGB JPEG bytes suitable for ISAPI.

    JPEG is validated by its actual magic bytes, never a filename extension.
    Resize/recompress conservatively to support firmware with a 200 KB limit.
    A corrupt or unsuitable photo is rejected rather than silently skipped.
    """
    if not source or len(source) > MAX_SOURCE_BYTES:
        raise ValueError("Face photo must be a nonempty image under 5 MB")
    try:
        with Image.open(BytesIO(source)) as original:
            if original.width * original.height > MAX_SOURCE_PIXELS:
                raise ValueError("Face photo dimensions are too large")
            if original.width < 60 or original.height < 60:
                raise ValueError("Face photo dimensions must be at least 60 x 60")
            if getattr(original, "is_animated", False):
                raise ValueError("Animated face photos are not supported")
            original.load()
            oriented = ImageOps.exif_transpose(original)
            if oriented.mode in ("RGBA", "LA") or "transparency" in oriented.info:
                rgba = oriented.convert("RGBA")
                rgb = Image.new("RGB", rgba.size, (255, 255, 255))
                rgb.paste(rgba, mask=rgba.getchannel("A"))
            else:
                rgb = oriented.convert("RGB")
            # Kerma Gateway face.ts requires a real JPEG <= 200 KB, with
            # dimensions between 60x60 and 1920x1080 (height is significant
            # for portraits; a simple max-side-only resize is insufficient).
            for bounding_box in ((1920, 1080), (1440, 900), (1200, 800), (900, 640), (640, 480)):
                sized = rgb.copy()
                sized.thumbnail(bounding_box, Image.Resampling.LANCZOS)
                for quality in (88, 78, 68, 58):
                    out = BytesIO()
                    sized.save(out, "JPEG", quality=quality, optimize=True)
                    jpeg = out.getvalue()
                    if len(jpeg) <= MAX_JPEG_BYTES and jpeg.startswith(b"\xff\xd8\xff"):
                        return jpeg
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Invalid face photo; please provide a real JPG or PNG image") from exc
    raise ValueError("Face photo could not be compressed to a supported JPEG size")
