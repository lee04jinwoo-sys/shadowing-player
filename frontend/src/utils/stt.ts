interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

let recognition: SpeechRecognitionInstance | null = null;
let isListening = false;

function getSpeechCtor(): SpeechRecognitionConstructor | null {
  const w = window as WindowWithSpeech;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSTTSupported(): boolean {
  return getSpeechCtor() !== null;
}

export function getSTTListeningState(): boolean {
  return isListening;
}

export function stopSTT(): void {
  if (recognition && isListening) {
    try {
      recognition.stop();
    } catch {
      // ignore stop errors
    }
    isListening = false;
  }
}

export function startSTT(
  onInterim: (text: string) => void,
  onFinal: (text: string) => void,
  onError: (message: string) => void,
  onEnd?: () => void,
): void {
  const Ctor = getSpeechCtor();
  if (!Ctor) {
    onError('이 브라우저는 음성 인식을 지원하지 않습니다. (Chrome/Edge/Safari 권장)');
    return;
  }

  if (!recognition) {
    recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;
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
      const res = event.results[i];
      if (res.isFinal) {
        finalTranscript += res[0].transcript;
      } else {
        interimTranscript += res[0].transcript;
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
    onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    isListening = false;
    onError('음성 인식을 시작할 수 없습니다.');
  }
}
