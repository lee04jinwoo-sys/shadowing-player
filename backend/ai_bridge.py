import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")

if GOOGLE_API_KEY:
    client = genai.Client(api_key=GOOGLE_API_KEY)
else:
    client = None

def get_ai_explanation(sentence: str) -> dict:
    if not client:
        return {"success": False, "error": "Gemini API 키가 설정되지 않았습니다."}
    
    prompt = f"""다음 영어 문장의 뜻과 핵심 표현, 뉘앙스를 한국어로 설명해줘:
"{sentence}"

[답변 규칙]
- 너무 길지도, 너무 짧지도 않게 가독성 좋고 친절하게 설명해줘. (약 4~5 문장 분량)
- 1. 뜻: 자연스러운 한국어 해석
- 2. 핵심 표현: 문장에서 배울 만한 유용한 단어나 숙어의 뜻과 예문 1개
- 3. 뉘앙스/팁: 이 표현이 실제로 쓰이는 상황이나 원어민 느낌의 팁
- 깔끔한 마크다운 양식을 사용해줘.
"""
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        return {"success": True, "explanation": response.text}
    except Exception as e:
        return {"success": False, "error": str(e)}

import json
import asyncio

async def _process_chunk_async(i, chunk):
    print(f"Processing chunk {i} to {i+len(chunk)}...")
    prompt = f"""You are an expert English transcriber and editor.
The following is a JSON array of raw, fragmented video subtitles.
There are two main issues to fix:
1. Fragmentation: A single logical sentence is often split across multiple subtitle items.
2. Typos: OCR or transcription errors may exist.

Your task:
- Merge the fragmented subtitle items into complete, natural English sentences.
- Fix obvious transcription or spelling errors without changing the original meaning.
- For any merged item, its 'start_ms' MUST be the 'start_ms' of the very first fragment, and 'end_ms' MUST be the 'end_ms' of the very last fragment.
- For the 'text_kr' field, if it exists, either merge it similarly or leave it empty if it's too difficult to align.

Return ONLY a valid JSON array of objects, where each object has exactly these keys:
"start_ms" (integer), "end_ms" (integer), "text_en" (string), "text_kr" (string).

Raw Subtitles Chunk:
{json.dumps(chunk, ensure_ascii=False, indent=2)}
"""
    try:
        response = await client.aio.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
        )
        enhanced_chunk = json.loads(response.text)
        if isinstance(enhanced_chunk, list):
            return enhanced_chunk
        else:
            return chunk
    except Exception as e:
        print(f"Error processing chunk {i}: {e}")
        return chunk

async def enhance_subtitles_with_ai(subtitles: list) -> list:
    if not client:
        raise Exception("Gemini API 키가 설정되지 않았습니다.")
        
    chunk_size = 60
    chunks = [(i, subtitles[i:i+chunk_size]) for i in range(0, len(subtitles), chunk_size)]
    
    tasks = [_process_chunk_async(i, chunk) for i, chunk in chunks]
    results = await asyncio.gather(*tasks)
    
    merged_results = []
    for res in results:
        merged_results.extend(res)
        
    return merged_results
