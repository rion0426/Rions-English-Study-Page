import random
from pathlib import Path

from flask import Flask, abort, jsonify, redirect, render_template, request, url_for

app = Flask(__name__)

APP_ROOT = Path(__file__).resolve().parent
TEXTS_BASE_DIR = APP_ROOT / "texts"
IMAGE_DIR = APP_ROOT / "static" / "img"
KOREAN_SEPARATOR = "--korean--"
HANGUL_RANGE = ("\uac00", "\ud7a3")


def _resolve_under(base_dir: Path, relative_path: str = "") -> Path:
    base_dir = base_dir.resolve()
    target_path = (base_dir / relative_path).resolve()
    try:
        target_path.relative_to(base_dir)
    except ValueError:
        abort(404, "Invalid path")
    return target_path


def _normalize_relative(path: Path) -> str:
    if path == TEXTS_BASE_DIR.resolve():
        return ""
    return path.relative_to(TEXTS_BASE_DIR.resolve()).as_posix()


def _list_directory(subdirectory: str = "") -> list[dict[str, str]]:
    directory = _resolve_under(TEXTS_BASE_DIR, subdirectory)
    if not directory.is_dir():
        abort(404, "Directory not found")

    items = []
    children = sorted(directory.iterdir(), key=lambda child: (child.is_file(), child.name.lower()))
    for child in children:
        relative_path = _normalize_relative(child)
        if child.is_dir():
            items.append({"name": child.name, "type": "folder", "path": relative_path})
        elif child.suffix.lower() == ".txt":
            items.append({"name": child.stem, "type": "file", "path": relative_path})
    return items


def _build_breadcrumbs(subdirectory: str = "") -> tuple[list[dict[str, str]], str | None]:
    if not subdirectory:
        return [], None

    breadcrumbs = []
    parts = Path(subdirectory).parts
    for index, part in enumerate(parts):
        breadcrumbs.append({"name": part, "path": Path(*parts[: index + 1]).as_posix()})

    parent_parts = parts[:-1]
    parent_path = Path(*parent_parts).as_posix() if parent_parts else ""
    return breadcrumbs, parent_path


def _split_text_content(raw_text: str) -> tuple[str, str]:
    parsed = _parse_text_content(raw_text)
    return parsed["english_content"], parsed["korean_content"]


def _normalize_study_mode(mode: str | None) -> str:
    if mode in {"fill", "line"}:
        return mode
    return "practice"


def _contains_hangul(text: str) -> bool:
    return any(HANGUL_RANGE[0] <= char <= HANGUL_RANGE[1] for char in text)


def _parse_legacy_separator_format(raw_text: str) -> dict[str, str | list[dict[str, str]]]:
    english_part, korean_part = raw_text.split(KOREAN_SEPARATOR, 1)
    english_lines = [line.strip() for line in english_part.splitlines() if line.strip()]
    korean_lines = [line.strip() for line in korean_part.splitlines() if line.strip()]
    pair_count = min(len(english_lines), len(korean_lines))
    line_pairs = [
        {"english": english_lines[index], "korean": korean_lines[index]}
        for index in range(pair_count)
    ]
    return {
        "english_content": "\n".join(english_lines),
        "korean_content": "\n".join(korean_lines),
        "line_pairs": line_pairs,
    }


def _parse_alternating_line_format(raw_text: str) -> dict[str, str | list[dict[str, str]]] | None:
    lines = [line.strip() for line in raw_text.replace("\ufeff", "").splitlines() if line.strip()]
    if len(lines) < 2 or len(lines) % 2 != 0:
        return None

    english_lines = lines[0::2]
    korean_lines = lines[1::2]
    if not english_lines or not korean_lines:
        return None

    english_like = sum(1 for line in english_lines if not _contains_hangul(line))
    korean_like = sum(1 for line in korean_lines if _contains_hangul(line))
    if english_like != len(english_lines) or korean_like != len(korean_lines):
        return None

    line_pairs = [
        {"english": english_lines[index], "korean": korean_lines[index]}
        for index in range(len(english_lines))
    ]
    return {
        "english_content": "\n".join(english_lines),
        "korean_content": "\n".join(korean_lines),
        "line_pairs": line_pairs,
    }


def _parse_text_content(raw_text: str) -> dict[str, str | list[dict[str, str]]]:
    normalized = raw_text.replace("\ufeff", "").strip()
    if KOREAN_SEPARATOR in normalized:
        return _parse_legacy_separator_format(normalized)

    alternating = _parse_alternating_line_format(normalized)
    if alternating is not None:
        return alternating

    english_lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    return {
        "english_content": "\n".join(english_lines),
        "korean_content": "",
        "line_pairs": [],
    }


def _get_text_neighbors(file_path: Path) -> tuple[str | None, str | None]:
    siblings = sorted(
        [child for child in file_path.parent.iterdir() if child.is_file() and child.suffix.lower() == ".txt"],
        key=lambda child: child.name.lower(),
    )
    try:
        current_index = siblings.index(file_path)
    except ValueError:
        return None, None

    previous_path = siblings[current_index - 1] if current_index > 0 else None
    next_path = siblings[current_index + 1] if current_index < len(siblings) - 1 else None

    previous_relative = _normalize_relative(previous_path) if previous_path else None
    next_relative = _normalize_relative(next_path) if next_path else None
    return previous_relative, next_relative


def _load_text_payload(text_path: str) -> dict[str, str | None]:
    file_path = _resolve_under(TEXTS_BASE_DIR, text_path)
    if not file_path.is_file():
        abort(404, "File not found")

    try:
        raw_text = file_path.read_text(encoding="utf-8")
    except OSError as exc:
        abort(500, f"Error reading file: {exc}")

    parsed_content = _parse_text_content(raw_text)
    previous_text_path, next_text_path = _get_text_neighbors(file_path)
    parent_dir = file_path.parent

    return {
        "title": file_path.stem,
        "text_path": _normalize_relative(file_path),
        "english_content": parsed_content["english_content"],
        "korean_content": parsed_content["korean_content"],
        "line_pairs": parsed_content["line_pairs"],
        "previous_text_path": previous_text_path,
        "next_text_path": next_text_path,
        "parent_dir_path": _normalize_relative(parent_dir),
    }


def _get_random_image_url() -> str | None:
    if not IMAGE_DIR.exists():
        return None

    image_files = [image.name for image in IMAGE_DIR.iterdir() if image.is_file()]
    if not image_files:
        return None

    return url_for("static", filename=f"img/{random.choice(image_files)}")


def _build_browse_payload(subdirectory: str = "") -> dict[str, object]:
    breadcrumbs, parent_path = _build_breadcrumbs(subdirectory)
    return {
        "current_path": subdirectory,
        "parent_path": parent_path,
        "breadcrumbs": breadcrumbs,
        "items": _list_directory(subdirectory),
        "random_image_url": _get_random_image_url(),
    }


def _build_text_payload(text_path: str) -> dict[str, object]:
    payload = _load_text_payload(text_path)
    payload["random_image_url"] = _get_random_image_url()
    return payload


def _render_select_page(subdirectory: str = "") -> str:
    return render_template("select.html", browse=_build_browse_payload(subdirectory))


def _render_study_page(text_path: str, mode: str | None) -> str:
    study_mode = _normalize_study_mode(mode)
    return render_template(
        "study.html",
        text=_build_text_payload(text_path),
        mode=study_mode,
    )


@app.route("/")
def index() -> str:
    return _render_select_page("")


@app.route("/select/")
@app.route("/select/<path:subdirectory>")
def select_page(subdirectory: str = "") -> str:
    return _render_select_page(subdirectory)


@app.route("/study/<path:text_path>")
def study_page(text_path: str) -> str:
    return _render_study_page(text_path, request.args.get("mode"))


@app.route("/practice/<path:text_path>")
def legacy_practice_page(text_path: str):
    return redirect(url_for("study_page", text_path=text_path), code=302)


@app.route("/fill/<path:text_path>")
def legacy_fill_page(text_path: str):
    return redirect(url_for("study_page", text_path=text_path, mode="fill"), code=302)


@app.route("/line/<path:text_path>")
def legacy_line_page(text_path: str):
    return redirect(url_for("study_page", text_path=text_path, mode="line"), code=302)


@app.get("/api/browse/")
@app.get("/api/browse/<path:subdirectory>")
def browse_api(subdirectory: str = ""):
    return jsonify(_build_browse_payload(subdirectory))


@app.get("/api/text/<path:text_path>")
def text_api(text_path: str):
    return jsonify(_build_text_payload(text_path))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
