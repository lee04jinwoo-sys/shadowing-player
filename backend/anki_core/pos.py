"""NLTK-based Part-of-Speech tagger for English vocabulary.

Provides simple POS classification (n, v, adj, adv, idiom, etc.)
for Anki vocabulary cards.
"""
import logging

import nltk
from nltk.corpus import wordnet

logger = logging.getLogger(__name__)


def setup_nltk() -> None:
    """Download required NLTK data packages if not already present."""
    packages = [
        ("tokenizers/punkt", "punkt"),
        ("taggers/averaged_perceptron_tagger", "averaged_perceptron_tagger"),
        ("corpora/wordnet", "wordnet"),
    ]
    extra_packages = ["omw-1.4", "punkt_tab", "averaged_perceptron_tagger_eng"]

    for resource_path, package_name in packages:
        try:
            nltk.data.find(resource_path)
        except LookupError:
            nltk.download(package_name, quiet=True)

    for pkg in extra_packages:
        try:
            nltk.download(pkg, quiet=True)
        except Exception:
            pass


def get_simple_pos(word: str) -> str:
    """Get a simplified POS tag for a word or phrase.

    Returns one of: 'n', 'v', 'adj', 'adv', 'prep', 'conj', 'idiom', 'etc'
    or a comma-separated combination (e.g. 'n, v').
    """
    tokens = nltk.word_tokenize(word)
    if not tokens:
        return ""

    if len(tokens) == 1:
        synsets = wordnet.synsets(word)
        if not synsets:
            tag = nltk.pos_tag(tokens)[0][1]
            if tag.startswith("NN"):
                return "n"
            if tag.startswith("VB"):
                return "v"
            if tag.startswith("JJ"):
                return "adj"
            if tag.startswith("RB"):
                return "adv"
            if tag in ["IN", "TO"]:
                return "prep"
            if tag == "CC":
                return "conj"
            return "etc"

        pos_set: set[str] = set()
        for syn in synsets:
            p = syn.pos()
            if p == "n":
                pos_set.add("n")
            elif p == "v":
                pos_set.add("v")
            elif p in ("a", "s"):
                pos_set.add("adj")
            elif p == "r":
                pos_set.add("adv")

        if not pos_set:
            return "etc"

        priority = {"n": 1, "v": 2, "adj": 3, "adv": 4}
        sorted_pos = sorted(list(pos_set), key=lambda x: priority.get(x, 9))
        return ", ".join(sorted_pos)

    # Multi-word expression
    tags = nltk.pos_tag(tokens)
    tag_list = [t[1] for t in tags]

    if all(t.startswith("NN") or t.startswith("JJ") for t in tag_list):
        if tag_list[-1].startswith("NN"):
            return "n"

    if tag_list[0] in ["IN", "TO"] and tag_list[-1] in ["IN", "TO"]:
        return "prep"

    return "idiom"
