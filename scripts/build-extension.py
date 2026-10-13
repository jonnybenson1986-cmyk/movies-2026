"""Build the downloadable extension from its source (Python 3 standard library)."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
source = root / "browser-extension"
destination = root / "public/downloads/streambox-playback-protection.zip"
destination.parent.mkdir(parents=True, exist_ok=True)

with ZipFile(destination, "w") as archive:
    for path in sorted(source.iterdir()):
        if not path.is_file():
            continue
        entry = ZipInfo(path.name, date_time=(2026, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, path.read_bytes())

print(f"Built {destination.relative_to(root)}")
