// ====================================
// stt.js — Web Speech STT 쉐도잉 채점기
// ====================================
import { compareStrings } from './modes.js';

let recognition = null;
let isListening = false;

export function isSTTSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function initSTT() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.continuous = true;

  return true;
}

export function startSTT(onInterim, onFinal, onError, onEnd) {
  if (!recognition) {
    if (!initSTT()) {
      onError("이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome/Edge/Safari 권장)");
      return;
    }
  }

  if (isListening) {
    stopSTT();
    return;
  }

  isListening = true;
  
  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript) {
      onFinal(finalTranscript);
    } else if (interimTranscript) {
      onInterim(interimTranscript);
    }
  };

  recognition.onerror = (event) => {
    isListening = false;
    if (event.error !== 'no-speech') {
      onError(`음성 인식 오류: ${event.error}`);
    }
  };

  recognition.onend = () => {
    isListening = false;
    if (onEnd) onEnd();
  };

  try {
    recognition.start();
  } catch (err) {
    isListening = false;
    onError("음성 인식을 시작할 수 없습니다.");
  }
}

export function stopSTT() {
  if (recognition && isListening) {
    try {
      recognition.stop();
    } catch (e) {}
    isListening = false;
  }
}

export function getSTTListeningState() {
  return isListening;
}

export function evaluatePronunciation(correctText, typedText) {
  const comparison = compareStrings(correctText, typedText);
  const correctCount = comparison.filter(item => item.status === "correct").length;
  const totalWords = comparison.filter(item => item.status !== "extra").length;
  
  const score = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
  
  return {
    score,
    comparison
  };
}
