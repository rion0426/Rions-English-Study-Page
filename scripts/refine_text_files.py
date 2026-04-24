#!/usr/bin/env python3

from __future__ import annotations

import re
from pathlib import Path


STOPWORDS = {
    "a",
    "about",
    "after",
    "again",
    "all",
    "almost",
    "also",
    "am",
    "an",
    "and",
    "another",
    "any",
    "are",
    "as",
    "at",
    "be",
    "because",
    "become",
    "becomes",
    "been",
    "before",
    "being",
    "between",
    "both",
    "but",
    "by",
    "can",
    "cannot",
    "could",
    "did",
    "do",
    "does",
    "doing",
    "done",
    "down",
    "during",
    "each",
    "else",
    "even",
    "every",
    "few",
    "first",
    "for",
    "from",
    "go",
    "had",
    "has",
    "have",
    "he",
    "her",
    "here",
    "him",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "just",
    "kind",
    "large",
    "less",
    "life",
    "made",
    "make",
    "many",
    "may",
    "might",
    "more",
    "most",
    "much",
    "must",
    "my",
    "need",
    "new",
    "no",
    "not",
    "now",
    "of",
    "often",
    "on",
    "one",
    "only",
    "or",
    "other",
    "our",
    "out",
    "over",
    "part",
    "people",
    "same",
    "she",
    "should",
    "showed",
    "since",
    "small",
    "so",
    "some",
    "such",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "time",
    "to",
    "too",
    "under",
    "until",
    "up",
    "use",
    "used",
    "using",
    "very",
    "want",
    "was",
    "way",
    "we",
    "well",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "who",
    "with",
    "would",
    "you",
    "your",
}

TOKEN_RE = re.compile(r"[A-Za-z]+(?:[’'\-][A-Za-z]+)*")


def is_english_line(line: str) -> bool:
    return bool(re.search(r"[A-Za-z]", line)) and not bool(re.search(r"[가-힣]", line))


def normalize_token(token: str) -> str:
    return token.strip("'-").lower()


def score_token(token: str, count: int, order: int) -> tuple[float, int]:
    length = len(token.replace("-", "").replace("'", ""))
    bonus = 0.0
    if token[0].isupper():
        bonus += 0.2
    if "-" in token:
        bonus += 0.3
    return (count * 3 + length + bonus, -order)


def choose_keywords(lines: list[str], limit: int = 20) -> set[str]:
    counts: dict[str, int] = {}
    display: dict[str, str] = {}
    order: dict[str, int] = {}
    sequence = 0

    for line in lines:
        for match in TOKEN_RE.finditer(line):
            token = match.group(0)
            normalized = normalize_token(token)
            if len(normalized) < 4 or normalized in STOPWORDS:
                continue
            if normalized.isdigit():
                continue
            counts[normalized] = counts.get(normalized, 0) + 1
            display.setdefault(normalized, token)
            order.setdefault(normalized, sequence)
            sequence += 1

    ranked = sorted(
        counts,
        key=lambda key: score_token(display[key], counts[key], order[key]),
        reverse=True,
    )
    return set(ranked[:limit])


def bold_keywords(line: str, keywords: set[str]) -> str:
    def repl(match: re.Match[str]) -> str:
        token = match.group(0)
        normalized = normalize_token(token)
        if normalized in keywords:
            return f"**{token}**"
        return token

    return TOKEN_RE.sub(repl, line)


def refine_file(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    body = lines[1:]
    body = [line.replace("[", "").replace("]", "") for line in body]
    english_lines = [line for line in body if is_english_line(line)]
    keywords = choose_keywords(english_lines)

    refined: list[str] = []
    for line in body:
        if is_english_line(line):
            refined.append(bold_keywords(line, keywords))
        else:
            refined.append(line)

    path.write_text("\n".join(refined).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    for path in sorted(Path("text").glob("*.txt")):
        refine_file(path)


if __name__ == "__main__":
    main()
