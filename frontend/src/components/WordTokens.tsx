import React, { useEffect, useRef } from 'react';
import type { DictPopoverAnchor, DictPopoverRequest, SavedVocabItem } from '../types';
import { tokenizeEnglishSubtitle } from '../utils/subtitles';

interface WordTokensProps {
  text: string;
  contextSentence: string;
  scopeKey: string;
  savedVocab: SavedVocabItem[];
  onLookupWord: (req: DictPopoverRequest) => void;
  className?: string;
}

function clearTokenSelectionClasses(): void {
  document.querySelectorAll('.word-token.token-selected').forEach((el) => {
    el.classList.remove('token-selected');
  });
}

function boundingRectForElements(elements: Element[]): DictPopoverAnchor | null {
  if (elements.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }

  if (left === Infinity) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export const WordTokens: React.FC<WordTokensProps> = ({
  text,
  contextSentence,
  scopeKey,
  savedVocab,
  onLookupWord,
  className = '',
}) => {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const lastClickedIdxRef = useRef<number | null>(null);
  const segments = tokenizeEnglishSubtitle(text, savedVocab);

  useEffect(() => {
    lastClickedIdxRef.current = null;
  }, [text, scopeKey]);

  let wordIdxCounter = -1;

  const handleTokenClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    word: string,
    tokenIdx: number,
  ) => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;

    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const prevIdx = lastClickedIdxRef.current;
    if (e.shiftKey && prevIdx !== null && prevIdx !== tokenIdx) {
      const allTokens = Array.from(container.querySelectorAll('.word-token'));
      const start = Math.min(prevIdx, tokenIdx);
      const end = Math.max(prevIdx, tokenIdx);
      const selected = allTokens.slice(start, end + 1);

      clearTokenSelectionClasses();
      selected.forEach((el) => el.classList.add('token-selected'));

      const phrase = selected.map((el) => el.getAttribute('data-word') || el.textContent || '').join(' ').trim();
      const rect = boundingRectForElements(selected);
      if (phrase && rect) {
        onLookupWord({ word: phrase, context: contextSentence, anchorRect: rect });
      }
      lastClickedIdxRef.current = tokenIdx;
      return;
    }

    clearTokenSelectionClasses();
    e.currentTarget.classList.add('token-selected');
    lastClickedIdxRef.current = tokenIdx;

    const r = e.currentTarget.getBoundingClientRect();
    onLookupWord({
      word,
      context: contextSentence,
      anchorRect: {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      },
    });
  };

  const handleMouseUp = () => {
    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const allTokens = Array.from(container.querySelectorAll('.word-token'));
    let startIdx = -1;
    let endIdx = -1;

    allTokens.forEach((token, idx) => {
      if (range.intersectsNode(token)) {
        if (startIdx === -1) startIdx = idx;
        endIdx = idx;
      }
    });

    if (startIdx !== -1 && endIdx !== -1) {
      const selectedTokens = allTokens.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
      const phrase = selectedTokens
        .map((t) => t.getAttribute('data-word') || t.textContent?.trim() || '')
        .join(' ')
        .trim();

      if (phrase.length >= 2) {
        clearTokenSelectionClasses();
        selectedTokens.forEach((t) => t.classList.add('token-selected'));
        const rect = boundingRectForElements(selectedTokens);
        if (rect) {
          onLookupWord({ word: phrase, context: contextSentence, anchorRect: rect });
        }
        window.setTimeout(() => {
          window.getSelection()?.removeAllRanges();
        }, 40);
      }
    }
  };

  return (
    <span ref={containerRef} className={className} onMouseUp={handleMouseUp}>
      {segments.map((seg, i) => {
        if (!seg.isWord) {
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        }
        wordIdxCounter += 1;
        const currentTokenIdx = wordIdxCounter;
        const statusClass =
          seg.status === 'extracted'
            ? 'word-extracted'
            : seg.status === 'starred'
              ? 'word-saved'
              : '';
        return (
          <span
            key={i}
            data-word={seg.word}
            className={`word-token ${statusClass}`.trim()}
            onClick={(e) => handleTokenClick(e, seg.word, currentTokenIdx)}
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
};
