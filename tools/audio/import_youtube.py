"""Private YouTube audio import. Called only with a validated video id and own temp directory.

Install: python -m venv tools/audio/.venv
         tools/audio/.venv/Scripts/python -m pip install -r tools/audio/requirements.txt
Linux: use .venv/bin/python. No browser cookies, account, DRM or video download.
"""
import json
import pathlib
import re
import subprocess
import sys

import imageio_ffmpeg
import yt_dlp

MAX_SECONDS = 7200
MAX_BYTES = 128 * 1024 * 1024


def emit(**data):
    print(json.dumps(data, ensure_ascii=True), flush=True)


def main():
    video_id, folder, node = sys.argv[1:]
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("INVALID_URL")
    destination = pathlib.Path(folder).resolve()

    def check(info, *, incomplete=False):
        if info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
            raise ValueError("LIVE_NOT_SUPPORTED")
        duration = info.get("duration")
        if not incomplete and (not duration or duration > MAX_SECONDS):
            raise ValueError("VIDEO_TOO_LONG")
        return None

    def progress(data):
        total = data.get("total_bytes") or data.get("total_bytes_estimate") or 0
        downloaded = data.get("downloaded_bytes", 0)
        if downloaded > MAX_BYTES:
            raise ValueError("FILE_TOO_LARGE")
        if data["status"] == "downloading":
            emit(phase="downloading", progress=min(99, int(downloaded * 100 / total)) if total else 0)

    options = {
        "format": "bestaudio[ext=m4a]/bestaudio",
        "outtmpl": str(destination / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "noprogress": True,
        "no_warnings": True,
        "cachedir": False,
        "socket_timeout": 20,
        "retries": 2,
        "fragment_retries": 2,
        "max_filesize": MAX_BYTES,
        "match_filter": check,
        "break_on_reject": True,
        "js_runtimes": {"node": {"path": node}},
        "progress_hooks": [progress],
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=True)
        if not info:
            raise ValueError("VIDEO_UNAVAILABLE")
        source = pathlib.Path(downloader.prepare_filename(info))
        if not source.is_file():
            raise ValueError("FILE_TOO_LARGE")
        title = str(info.get("title") or f"YouTube {video_id}")[:120]
    emit(phase="converting", progress=0, name=title)
    subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error",
        "-y", "-i", str(source), "-vn", "-map_metadata", "-1", "-codec:a", "libmp3lame",
        "-b:a", "128k", "-t", str(MAX_SECONDS), str(destination / "audio.mp3"),
    ], check=True, timeout=300, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
    emit(phase="complete", progress=100, name=title)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error)
        code = next((value for value in ("LIVE_NOT_SUPPORTED", "VIDEO_TOO_LONG", "FILE_TOO_LARGE") if value in message), "VIDEO_UNAVAILABLE")
        emit(phase="error", error=code)
        sys.exit(1)
