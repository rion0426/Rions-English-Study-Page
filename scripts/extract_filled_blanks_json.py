#!/usr/bin/env python3

from __future__ import annotations

import json
import re
from pathlib import Path


JSON_FILES = [
    "filled_blanks_01회.json",
    "filled_blanks_02회.json",
    "filled_blanks_03회.json",
]

ABBREVIATIONS = ["U.S.", "Mr.", "Mrs.", "Ms.", "Dr.", "e.g.", "i.e.", "vs."]


def strip_vocab_tail(text: str) -> str:
    text = text.strip()
    matches = list(re.finditer(r"\s\*\s*[A-Za-z가-힣(]", text))
    for match in reversed(matches):
        return text[: match.start()].strip()
    return text


def protect_abbreviations(text: str) -> tuple[str, dict[str, str]]:
    replacements: dict[str, str] = {}
    for index, abbr in enumerate(ABBREVIATIONS):
        key = f"__ABBR_{index}__"
        text = text.replace(abbr, key)
        replacements[key] = abbr
    return text, replacements


def restore_abbreviations(text: str, replacements: dict[str, str]) -> str:
    for key, value in replacements.items():
        text = text.replace(key, value)
    return text


def split_english(text: str) -> list[str]:
    text = strip_vocab_tail(text)
    text = text.replace("“", '"').replace("”", '"').replace("’", "'").replace("‘", "'")
    text, replacements = protect_abbreviations(text)
    parts = [restore_abbreviations(x.strip(), replacements) for x in re.split(r"(?<=[.!?])\s+", text) if x.strip()]
    return parts


def split_korean(text: str) -> list[str]:
    text = text.strip()
    text = text.replace("Dr. Anna", "Dr__Anna").replace("vs. them", "vs__them")
    parts = [
        x.strip().replace("Dr__Anna", "Dr. Anna").replace("vs__them", "vs. them")
        for x in re.split(r"(?<=[.!?])\s+", text)
        if x.strip()
    ]
    return parts


def split_sentence_once(sentence: str, marker: str) -> list[str]:
    left, right = sentence.split(marker, 1)
    return [left.strip(), f"{marker.strip()} {right.strip()}".strip()]


def merge_adjacent(lines: list[str], first_index: int) -> list[str]:
    merged = lines[:]
    merged[first_index] = f"{merged[first_index]} {merged[first_index + 1]}".strip()
    del merged[first_index + 1]
    return merged


def apply_overrides(file_name: str, number: str, english: list[str], korean: list[str]) -> tuple[list[str], list[str]]:
    key = (file_name, number)

    if key == ("filled_blanks_01회.json", "04"):
        english = english[:5] + split_sentence_once(english[5], 'Well,') + english[6:]

    elif key == ("filled_blanks_01회.json", "07"):
        english = english[:4] + split_sentence_once(english[4], 'This **concept**') + english[5:]

    elif key == ("filled_blanks_01회.json", "08"):
        korean = merge_adjacent(korean, 1)

    elif key == ("filled_blanks_02회.json", "01"):
        korean = merge_adjacent(korean, 4)

    elif key == ("filled_blanks_02회.json", "02"):
        korean = merge_adjacent(korean, 2)
        korean = merge_adjacent(korean, 3)

    elif key == ("filled_blanks_03회.json", "02"):
        korean = merge_adjacent(korean, 2)

    elif key == ("filled_blanks_03회.json", "09"):
        korean = merge_adjacent(korean, 3)

    return english, korean


def output_dir_for(json_name: str) -> Path:
    stem = Path(json_name).stem
    match = re.search(r"(\d+회)", stem)
    label = match.group(1) if match else stem
    return Path("texts") / "빈칸" / label


def write_items(json_name: str) -> None:
    data = json.loads(Path(json_name).read_text(encoding="utf-8"))
    out_dir = output_dir_for(json_name)
    out_dir.mkdir(parents=True, exist_ok=True)

    for item in data["items"]:
        english_lines = split_english(item["filled_blank_passage"])
        korean_lines = split_korean(item["korean"])
        english_lines, korean_lines = apply_overrides(json_name, item["number"], english_lines, korean_lines)

        if len(english_lines) != len(korean_lines):
            raise ValueError(
                f"Sentence count mismatch in {json_name} {item['number']}: "
                f"{len(english_lines)} EN vs {len(korean_lines)} KO"
            )

        content_lines: list[str] = []
        for english, korean in zip(english_lines, korean_lines):
            content_lines.append(english)
            content_lines.append(korean)

        (out_dir / f"{item['number']}.txt").write_text("\n".join(content_lines) + "\n", encoding="utf-8")


def main() -> None:
    for json_name in JSON_FILES:
        write_items(json_name)


if __name__ == "__main__":
    main()
