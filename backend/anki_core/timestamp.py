"""Timestamp matching utility for YouTube subtitle segments.

Matches target text (sentences or words) to the best matching subtitle segment
to determine the video timestamp for Anki card playback.
"""
import re


def normalize_text(text: str) -> str:
    """Normalize text for fuzzy matching by lowercasing and removing punctuation."""
    if not text:
        return ""
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    return " ".join(cleaned.split())


def find_best_timestamp(target_text: str, segments: list[dict]) -> float:
    """Find the best matching timestamp for target_text within subtitle segments.

    Args:
        target_text: The sentence or word to find in the segments.
        segments: List of subtitle segments with 'text' and 'start' keys.

    Returns:
        The start time (in seconds) of the best matching segment.
    """
    if not segments:
        return 0.0

    norm_target = normalize_text(target_text)
    if not norm_target:
        return 0.0

    # Build a full transcript with character-to-segment index mapping
    norm_segments: list[str] = []
    full_transcript = ""
    char_map: list[int] = []

    for idx, seg in enumerate(segments):
        norm_seg = normalize_text(seg.get("text", ""))
        norm_segments.append(norm_seg)
        if norm_seg:
            if full_transcript:
                full_transcript += " "
                char_map.append(idx)
            full_transcript += norm_seg
            char_map.extend([idx] * len(norm_seg))

    # Strategy 1: Exact substring match in full transcript
    match_index = full_transcript.find(norm_target)
    if match_index != -1:
        seg_idx = char_map[match_index]
        return float(segments[seg_idx].get("start", 0.0))

    # Strategy 2: Prefix match (first 3 words)
    target_words = norm_target.split()
    if not target_words:
        return 0.0

    prefix_length = min(3, len(target_words))
    prefix_target = " ".join(target_words[:prefix_length])
    match_index = full_transcript.find(prefix_target)
    if match_index != -1:
        seg_idx = char_map[match_index]
        return float(segments[seg_idx].get("start", 0.0))

    # Strategy 3: Sliding window word overlap
    target_word_set = set(target_words)
    best_overlap = 0
    best_seg_idx = 0
    seg_word_sets = [set(seg_txt.split()) for seg_txt in norm_segments]
    window_size = max(1, min(5, len(segments)))

    for i in range(len(segments) - window_size + 1):
        combined_words: set[str] = set()
        for j in range(window_size):
            combined_words.update(seg_word_sets[i + j])
        overlap = len(target_word_set & combined_words)
        if overlap > best_overlap:
            best_overlap = overlap
            best_seg_idx = i

    if best_overlap > 0:
        return float(segments[best_seg_idx].get("start", 0.0))

    return float(segments[0].get("start", 0.0))
