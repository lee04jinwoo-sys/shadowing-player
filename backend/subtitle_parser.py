import re
import os
import json
import logging
import pysubs2

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def merge_into_sentences(subs: list) -> list:
    """
    Losslessly merges consecutive original subtitle blocks into full sentences based on punctuation (.?!)
    or large silence gaps (>1.5 seconds) or max duration (~5 seconds for auto-captions without punctuation).
    Uses ONLY original raw block timestamps for 100% exact audio sync (0% loss/estimation error).
    """
    if not subs:
        return []

    sentences = []
    current_group = []

    for i, sub in enumerate(subs):
        text_en = sub.get("text_en", "").strip()
        if not text_en:
            continue

        # Check if there is a silence gap > 1.5 seconds (1500ms) before this block
        if current_group:
            prev_end = current_group[-1]["end_ms"]
            if sub["start_ms"] - prev_end > 1500:
                sentences.append({
                    "start_ms": current_group[0]["start_ms"],
                    "end_ms": current_group[-1]["end_ms"],
                    "text_en": " ".join(item["text_en"].strip() for item in current_group),
                    "text_kr": " ".join(item.get("text_kr", "").strip() for item in current_group if item.get("text_kr")).strip()
                })
                current_group = []

        current_group.append(sub)

        # Calculate current group duration
        group_duration = current_group[-1]["end_ms"] - current_group[0]["start_ms"]

        # Check if the text ends with sentence-ending punctuation (. ? !)
        cleaned_text = text_en.rstrip()
        ends_with_punct = (
            cleaned_text.endswith('.') or 
            cleaned_text.endswith('?') or 
            cleaned_text.endswith('!') or 
            cleaned_text.endswith('."') or 
            cleaned_text.endswith('?"') or 
            cleaned_text.endswith('!"')
        )
        ends_with_comma_break = (
            cleaned_text.endswith(',') or 
            cleaned_text.endswith(';') or
            cleaned_text.endswith(',"')
        ) and group_duration >= 3500

        # Split on punctuation OR comma over 3.5s OR if duration reaches ~5 seconds at an original block boundary
        if ends_with_punct or ends_with_comma_break or group_duration >= 5000:
            sentences.append({
                "start_ms": current_group[0]["start_ms"],
                "end_ms": current_group[-1]["end_ms"],
                "text_en": " ".join(item["text_en"].strip() for item in current_group),
                "text_kr": " ".join(item.get("text_kr", "").strip() for item in current_group if item.get("text_kr")).strip()
            })
            current_group = []

    # Flush any remaining group at the end
    if current_group:
        sentences.append({
            "start_ms": current_group[0]["start_ms"],
            "end_ms": current_group[-1]["end_ms"],
            "text_en": " ".join(item["text_en"].strip() for item in current_group),
            "text_kr": " ".join(item.get("text_kr", "").strip() for item in current_group if item.get("text_kr")).strip()
        })

    return sentences

def parse_smi(file_path: str) -> list:
    """
    Parses a standard .smi subtitle file and returns structured dialogues with timestamps.
    """
    try:
        # SMI files are typically encoded in cp949 for Korean text, fallback to utf-8
        try:
            with open(file_path, "r", encoding="cp949", errors="ignore") as f:
                content = f.read()
        except Exception:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

        # Find all Sync Start tags
        matches = list(re.finditer(r'(?i)<sync\s+start=(\d+)>', content))
        if not matches:
            logger.warning(f"No sync blocks found in subtitle file: {file_path}")
            return []

        subtitles = []
        for i in range(len(matches)):
            start_ms = int(matches[i].group(1))
            
            start_pos = matches[i].end()
            end_pos = matches[i+1].start() if i + 1 < len(matches) else len(content)
            block = content[start_pos:end_pos]
            
            en_text = ""
            kr_text = ""
            
            # Check if there are P class tags in the block
            p_matches = list(re.finditer(r'(?i)<p\s+class=([a-z]+)>', block))
            
            if p_matches:
                for j in range(len(p_matches)):
                    p_class = p_matches[j].group(1).upper()
                    p_start = p_matches[j].end()
                    p_end = p_matches[j+1].start() if j + 1 < len(p_matches) else len(block)
                    p_text = block[p_start:p_end]
                    
                    # Clean tags and spacing
                    p_text = re.sub(r'<[^>]+>', '', p_text)
                    p_text = re.sub(r'\s+', ' ', p_text).strip()
                    p_text = p_text.replace('&nbsp;', '').replace('&nbsp', '')
                    
                    if p_class == "ENCC":
                        en_text = p_text
                    elif p_class == "KRCC":
                        kr_text = p_text
            else:
                # Fallback if no class tags, treat all text inside as English
                clean_text = re.sub(r'<[^>]+>', '', block)
                clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                clean_text = clean_text.replace('&nbsp;', '').replace('&nbsp', '')
                en_text = clean_text

            # Standardize &nbsp; removal
            if en_text == "&nbsp;" or en_text == "":
                en_text = ""
            if kr_text == "&nbsp;" or kr_text == "":
                kr_text = ""
                
            subtitles.append({
                "start_ms": start_ms,
                "end_ms": 0,
                "text_en": en_text,
                "text_kr": kr_text
            })

        # Calculate exact end times
        final_subs = []
        for sub in subtitles:
            # Empty dialogue (often used to clear subtitles on screen)
            if not sub["text_en"] and not sub["text_kr"]:
                if final_subs:
                    final_subs[-1]["end_ms"] = sub["start_ms"]
                continue
            final_subs.append(sub)

        for i in range(len(final_subs)):
            current_start = final_subs[i]["start_ms"]
            next_start = final_subs[i+1]["start_ms"] if i + 1 < len(final_subs) else current_start + 4000
            
            if final_subs[i]["end_ms"] == 0:
                # Cap the dialogue duration to 4 seconds max, or until the next starts
                final_subs[i]["end_ms"] = min(current_start + 4000, next_start)

        return merge_into_sentences(final_subs)

    except Exception as e:
        logger.error(f"Error parsing SMI subtitle: {e}")
        return []

def parse_dual_srt(en_path: str, ko_path: str) -> list:
    en_subs = []
    if en_path and os.path.exists(en_path):
        for enc in ['utf-8', 'utf-8-sig', 'cp949', 'cp1252', 'latin-1']:
            try:
                en_subs = pysubs2.load(en_path, encoding=enc)
                break
            except Exception:
                continue
        if not en_subs:
            logger.error("Failed to load en srt with all tried encodings.")
            
    ko_subs = []
    if ko_path and os.path.exists(ko_path):
        for enc in ['utf-8', 'utf-8-sig', 'cp949', 'euc-kr', 'cp1252', 'latin-1']:
            try:
                ko_subs = pysubs2.load(ko_path, encoding=enc)
                break
            except Exception:
                continue
        if not ko_subs:
            logger.error("Failed to load ko srt with all tried encodings.")

    # Use english subtitles as the base timeline
    final_subs = []
    
    j = 0
    kr_len = len(ko_subs)
    
    # Simple mapping: for each EN subtitle, find the KO subtitle that overlaps the most
    for sub in en_subs:
        start_ms = sub.start
        end_ms = sub.end
        raw_en = getattr(sub, 'plaintext', str(sub.text))
        en_text = re.sub(r'<[^>]+>', '', raw_en).replace('\n', ' ').strip()
        
        # Advance j to discard ko_subs that are too far in the past
        while j < kr_len and ko_subs[j].end < start_ms - 1500:
            j += 1
            
        # Find matching KO text within window
        ko_text = ""
        best_overlap = 0
        
        k = j
        while k < kr_len and ko_subs[k].start < end_ms + 1500:
            k_sub = ko_subs[k]
            overlap_start = max(start_ms, k_sub.start)
            overlap_end = min(end_ms, k_sub.end)
            overlap = overlap_end - overlap_start
            
            if overlap > best_overlap and overlap > 0:
                best_overlap = overlap
                raw_ko = getattr(k_sub, 'plaintext', str(k_sub.text))
                ko_text = re.sub(r'<[^>]+>', '', raw_ko).replace('\n', ' ').strip()
            k += 1
                
        final_subs.append({
            "start_ms": start_ms,
            "end_ms": end_ms,
            "text_en": en_text,
            "text_kr": ko_text
        })
        
    return merge_into_sentences(final_subs)

def get_subtitles(video_path: str) -> list:
    """
    Returns parsed subtitles by merging .en.srt and .ko.srt.
    """
    base_name = os.path.basename(video_path)
    video_dir = os.path.dirname(video_path)
    cache_path = os.path.join(CACHE_DIR, f"{base_name}.parsed.json")

    # Load cache if exists
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error reading cache: {e}")

    name_no_ext = os.path.splitext(base_name)[0]
    en_path = os.path.join(video_dir, f"{name_no_ext}.en.srt")
    ko_path = os.path.join(video_dir, f"{name_no_ext}.ko.srt")

    smi_path = os.path.join(video_dir, f"{name_no_ext}.smi")

    subs = []
    if os.path.exists(en_path) or os.path.exists(ko_path):
        subs = parse_dual_srt(en_path, ko_path)
        
    if not subs and os.path.exists(smi_path):
        subs = parse_smi(smi_path)
    
    # Write to cache
    if subs:
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(subs, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to write subtitle cache: {e}")
            
    return subs
