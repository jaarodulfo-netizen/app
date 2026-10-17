"""Hardware-photo serialization tests. No Gateway or device connection required."""
from io import BytesIO
from pathlib import Path
import sys

from PIL import Image
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hikvision_image import encode_hikvision_face_jpeg, MAX_JPEG_BYTES


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_face_is_real_jpeg_regardless_of_upload_format(fmt):
    photo = BytesIO()
    Image.new("RGB", (900, 1200), (120, 80, 160)).save(photo, format=fmt)
    converted = encode_hikvision_face_jpeg(photo.getvalue())
    assert converted.startswith(b"\xff\xd8\xff")
    assert len(converted) <= MAX_JPEG_BYTES
    with Image.open(BytesIO(converted)) as result:
        assert result.format == "JPEG"
        assert result.mode == "RGB"
        assert max(result.size) <= 1280


def test_transparent_png_composites_on_white():
    photo = BytesIO()
    Image.new("RGBA", (64, 64), (0, 0, 0, 0)).save(photo, format="PNG")
    converted = encode_hikvision_face_jpeg(photo.getvalue())
    with Image.open(BytesIO(converted)) as result:
        assert all(channel >= 250 for channel in result.getpixel((16, 16)))


def test_corrupt_photo_is_rejected():
    with pytest.raises(ValueError, match="Invalid face photo"):
        encode_hikvision_face_jpeg(b"not an image")


def test_empty_photo_is_rejected():
    with pytest.raises(ValueError, match="nonempty"):
        encode_hikvision_face_jpeg(b"")
