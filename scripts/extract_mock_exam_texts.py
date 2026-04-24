#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


HEADER_RE = re.compile(r"^(\d+(?:\s*~\s*\d+)?)\s*:\s*(.*)$")
PAGE_RE = re.compile(r"^-\s*\d+\s*-$")
INVALID_FILENAME_CHARS = str.maketrans(
    {
        "<": "＜",
        ">": "＞",
        ":": "：",
        '"': "＂",
        "/": "／",
        "\\": "＼",
        "|": "｜",
        "?": "？",
        "*": "＊",
    }
)
ARROW_MARKERS = ("↳", "↱", "⇩", "┎", "┚")
META_PREFIXES = ("제목:", "주제:", "요약:")
EXPECTED_MISSING = {"25", "27", "28", "43", "44", "45"}


def read_page(pdf_path: Path, page: int) -> str:
    return subprocess.check_output(
        ["pdftotext", "-layout", "-f", str(page), "-l", str(page), str(pdf_path), "-"],
        text=True,
    )


def normalize_number(number: str) -> str:
    return re.sub(r"\s*~\s*", "~", number.strip())


def clean_title(raw_title: str) -> str:
    title = raw_title.strip()
    if "(" in title:
        title = title.split("(", 1)[0].rstrip()
    if " / " in title:
        title = title.split(" / ", 1)[0].rstrip()
    return title.rstrip(" .")


def safe_stem(stem: str) -> str:
    return stem.translate(INVALID_FILENAME_CHARS)


def has_large_gap(line: str) -> bool:
    return re.search(r"\S {3,}\S", line) is not None


def line_kind(line: str) -> str | None:
    stripped = line.strip()
    if not stripped or PAGE_RE.match(stripped):
        return None
    if any(marker in line for marker in ARROW_MARKERS):
        return None
    if any(stripped.startswith(prefix) for prefix in META_PREFIXES):
        return "meta"
    if stripped in {"주제문"} or stripped.startswith(("=", "~")):
        return None

    leading_spaces = len(line) - len(line.lstrip(" "))
    has_hangul = re.search(r"[가-힣]", line) is not None
    has_latin = re.search(r"[A-Za-z]", line) is not None

    if has_hangul:
        if has_large_gap(line):
            return None
        if leading_spaces > 12 and len(stripped) < 20:
            return None
        return "ko"

    if has_latin:
        if has_large_gap(line):
            return None
        if leading_spaces > 12 and len(stripped) < 25:
            return None
        return "en"

    return None


def append_block(blocks: list[dict[str, list[str] | str]], kind: str, line: str) -> None:
    stripped = line.strip()
    if kind == "ko" and (not blocks or blocks[-1]["kind"] != "ko"):
        if len(stripped) < 8 and not re.search(r"[.!?]$", stripped):
            return
    if blocks and blocks[-1]["kind"] == kind:
        blocks[-1]["lines"].append(stripped)
        return
    blocks.append({"kind": kind, "lines": [stripped]})


def build_pairs(blocks: list[dict[str, list[str] | str]]) -> list[tuple[str, str]]:
    normalized = [
        (block["kind"], " ".join(block["lines"]))  # type: ignore[index]
        for block in blocks
        if block["lines"]  # type: ignore[index]
    ]

    while normalized and normalized[0][0] != "en":
        normalized.pop(0)

    pairs: list[tuple[str, str]] = []
    index = 0
    while index + 1 < len(normalized):
        first_kind, first_text = normalized[index]
        second_kind, second_text = normalized[index + 1]
        if first_kind == "en" and second_kind == "ko":
            pairs.append((first_text, second_text))
            index += 2
            continue
        raise ValueError(
            f"Unexpected block order near '{first_text[:80]}' / '{second_text[:80]}'"
        )

    if index != len(normalized):
        raise ValueError(f"Trailing unpaired block: {normalized[index][1][:80]}")

    return pairs


def extract_questions(pdf_path: Path) -> tuple[list[dict[str, object]], set[str]]:
    questions: list[dict[str, object]] = []
    current: dict[str, object] | None = None
    seen_numbers: set[str] = set()

    for page in range(1, 41):
        page_text = read_page(pdf_path, page)
        for raw_line in page_text.splitlines():
            line = raw_line.replace("\f", "")
            stripped = line.strip()

            match = HEADER_RE.match(stripped)
            if match:
                if current is not None:
                    questions.append(current)
                number = normalize_number(match.group(1))
                title = clean_title(match.group(2))
                current = {
                    "number": number,
                    "title": title,
                    "blocks": [],
                    "pages": [page],
                    "skip_parenthetical_title": "(" in match.group(2) and ")" not in match.group(2),
                    "pending_title_line": "(" not in match.group(2),
                    "in_meta": False,
                }
                seen_numbers.add(number)
                continue

            if current is None:
                continue

            if page not in current["pages"]:  # type: ignore[operator]
                current["pages"].append(page)  # type: ignore[index]

            if current["skip_parenthetical_title"]:  # type: ignore[index]
                if ")" in stripped:
                    current["skip_parenthetical_title"] = False  # type: ignore[index]
                continue

            if current["pending_title_line"]:  # type: ignore[index]
                if not stripped:
                    continue
                if stripped.startswith("("):
                    if ")" not in stripped:
                        current["skip_parenthetical_title"] = True  # type: ignore[index]
                    current["pending_title_line"] = False  # type: ignore[index]
                    continue
                current["pending_title_line"] = False  # type: ignore[index]

            if current["in_meta"]:  # type: ignore[index]
                continue

            kind = line_kind(line)
            if kind == "meta":
                current["in_meta"] = True  # type: ignore[index]
                continue
            if kind is None:
                continue

            append_block(current["blocks"], kind, line)  # type: ignore[arg-type]

    if current is not None:
        questions.append(current)

    return questions, seen_numbers


def write_output(questions: list[dict[str, object]], output_dir: Path) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[str] = []

    for question in questions:
        number = question["number"]  # type: ignore[index]
        title = question["title"]  # type: ignore[index]
        pairs = build_pairs(question["blocks"])  # type: ignore[arg-type]
        stem = f"{number}.{title}"
        safe_name = safe_stem(stem) + ".txt"
        lines = [stem]
        for english, korean in pairs:
            lines.append(english)
            lines.append(korean)
        (output_dir / safe_name).write_text("\n".join(lines) + "\n", encoding="utf-8")
        written.append(safe_name)

    return written


def expand_seen_numbers(seen_numbers: set[str]) -> set[str]:
    expanded: set[str] = set()
    for item in seen_numbers:
        if "~" in item:
            start, end = item.split("~", 1)
            if start.isdigit() and end.isdigit():
                expanded.update(str(number) for number in range(int(start), int(end) + 1))
                continue
        expanded.add(item)
    return expanded


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("text"))
    args = parser.parse_args()

    questions, seen_numbers = extract_questions(args.pdf)
    written = write_output(questions, args.output_dir)

    expanded_seen = expand_seen_numbers(seen_numbers)
    missing_from_pdf = sorted(number for number in EXPECTED_MISSING if number not in expanded_seen)

    print(f"Wrote {len(written)} files to {args.output_dir}")
    for name in written:
        print(name)
    if missing_from_pdf:
        print("Missing question numbers in PDF:", ", ".join(missing_from_pdf))


if __name__ == "__main__":
    main()
