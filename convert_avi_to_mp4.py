#!/usr/bin/env python3
import os
import sys
import subprocess
import glob

# Local project videos directory
MEDIA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "videos")
FFMPEG_PATH = "/opt/homebrew/bin/ffmpeg"

def check_requirements():
    if not os.path.exists(FFMPEG_PATH):
        print(f"❌ ffmpeg을 찾을 수 없습니다: {FFMPEG_PATH}")
        print("Homebrew를 통해 ffmpeg이 설치되어 있는지 확인해 주세요.")
        sys.exit(1)
    
    if not os.path.isdir(MEDIA_DIR):
        print(f"❌ 미디어 디렉토리가 존재하지 않습니다: {MEDIA_DIR}")
        print("프로젝트 폴더 내에 'videos' 폴더를 생성하고 영상/자막을 넣어주세요.")
        sys.exit(1)

def convert_all():
    # Find all .avi files in the media directory
    avi_files = sorted(glob.glob(os.path.join(MEDIA_DIR, "*.avi")))
    
    if not avi_files:
        print("🎵 변환할 .avi 파일이 없습니다.")
        return

    print(f"🔍 총 {len(avi_files)}개의 .avi 파일을 발견했습니다.")
    print("🚀 변환을 시작합니다.\n")

    for idx, avi_path in enumerate(avi_files, 1):
        filename = os.path.basename(avi_path)
        basename, _ = os.path.splitext(filename)
        mp4_path = os.path.join(MEDIA_DIR, f"{basename}.mp4")
        
        print(f"[{idx}/{len(avi_files)}] 처리 중: {filename}")
        
        if os.path.exists(mp4_path):
            # Check if MP4 file is valid (not 0 bytes)
            if os.path.getsize(mp4_path) > 1000000: # > 1MB
                print(f"  ⏭️ 이미 변환된 mp4 파일이 존재하여 건너뜁니다.")
                continue
            else:
                print(f"  ⚠️ 비정상적인 mp4 파일 감지, 재변환합니다.")
                os.remove(mp4_path)

        # ffmpeg command
        # -y: overwrite output files without asking
        # -c:v libx264 -crf 23: standard high quality H.264 encoding
        # -preset fast: speed/quality tradeoff
        # -c:a aac -b:a 128k: standard audio format
        cmd = [
            FFMPEG_PATH,
            "-y",
            "-i", avi_path,
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "fast",
            "-c:a", "aac",
            "-b:a", "128k",
            mp4_path
        ]
        
        try:
            print(f"  🎬 인코딩 시작...")
            # Run ffmpeg with stdout/stderr hidden unless there's an error
            process = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if process.returncode == 0:
                print(f"  ✅ 변환 완료: {basename}.mp4")
            else:
                print(f"  ❌ 변환 실패 (에러 코드: {process.returncode})")
                print(process.stderr.decode('utf-8', errors='ignore'))
        except Exception as e:
            print(f"  ❌ 오류 발생: {e}")

    print("\n🎉 모든 파일 변환 작업이 종료되었습니다!")

if __name__ == "__main__":
    check_requirements()
    convert_all()
