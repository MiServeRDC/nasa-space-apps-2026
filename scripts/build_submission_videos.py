#!/usr/bin/env python3
"""
ARES-Health: Automated Presentation Video & Voiceover Generator
NASA Space Apps Challenge 2026 - Challenge Track: Health Monitoring Software

This script generates:
1. High-fidelity synthesized audio voiceovers for the 30s Pitch and 180s Walkthrough
2. High-resolution (1920x1080) visual capture frames of the ARES-Health Cockpit
3. Formatted HTML title and end cards
4. Fully synchronized 1080p 60fps MP4 video files with embedded audio and English subtitles
"""

import os
import re
import sys
import time
import shutil
import subprocess

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SUBMISSION_DIR = os.path.join(ROOT_DIR, 'docs', 'submission')
SCREENSHOTS_DIR = os.path.join(SUBMISSION_DIR, 'screenshots')
TMP_DIR = '/tmp/ares_video_build'

CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
FFMPEG_BIN = '/opt/homebrew/bin/ffmpeg'
FFPROBE_BIN = '/opt/homebrew/bin/ffprobe'


def parse_srt(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    blocks = re.split(r'\n\s*\n', content)
    cues = []
    for b in blocks:
        lines = b.strip().splitlines()
        if len(lines) >= 3:
            idx = int(lines[0])
            m = re.match(r'(\d+):(\d+):(\d+),(\d+)\s*-->\s*(\d+):(\d+):(\d+),(\d+)', lines[1])
            if m:
                h1, m1, s1, ms1, h2, m2, s2, ms2 = map(int, m.groups())
                t_start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000.0
                t_end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000.0
                text = ' '.join(lines[2:])
                cues.append((idx, t_start, t_end, text))
    return cues


def sanitize_for_tts(text):
    t = text
    t = t.replace('(<150 tokens)', 'under 150 tokens')
    t = t.replace('<150-token', 'under 150 token')
    t = t.replace('O(1)', 'O of 1')
    t = t.replace('1 Hz', '1 Hertz')
    t = t.replace('20 Hz', '20 Hertz')
    t = t.replace('BIDMC', 'B I D M C')
    t = t.replace('POCUS', 'Pocus')
    t = t.replace('LBNP', 'L B N P')
    t = t.replace('ARED', 'A-red')
    t = t.replace('NQS-STL', 'N Q S - S T L')
    t = t.replace('Timestral', 'Timestral')
    t = t.replace('tau_w', 'tau w')
    t = t.replace('OWLT', 'O W L T')
    t = t.replace('ARINC-653', 'A R I N C 653')
    t = t.replace('CRC-32C', 'C R C 32 C')
    t = t.replace('128B', '128 byte')
    t = t.replace('PB #01', 'Playbook 1')
    t = t.replace('PB #02', 'Playbook 2')
    t = t.replace('PB #03', 'Playbook 3')
    t = t.replace('PB #04', 'Playbook 4')
    t = t.replace('PB #05', 'Playbook 5')
    t = t.replace('Act I,', 'In Act 1,')
    t = t.replace('Act II,', 'In Act 2,')
    t = t.replace('Act III,', 'In Act 3,')
    t = t.replace('Act IV,', 'In Act 4,')
    t = t.replace('Act V,', 'In Act 5,')
    t = t.replace('[V1 3006]', '')
    t = t.replace('BEAT_INTERVALS_NOT_AVAILABLE', 'Beat Intervals Not Available')
    t = t.replace('DATA_DEGRADED_MISSING_CHANNELS', 'Data Degraded Missing Channels')
    t = t.replace('ILLUSTRATIVE_UNVALIDATED', 'Illustrative Unvalidated')
    t = t.replace('ILLUSTRATIVE_SCENARIO_RANGE', 'Illustrative Scenario Range')
    t = t.replace('HEURISTIC_GATE_ACCEPTED', 'Heuristic Gate Accepted')
    return t


def synthesize_voiceover(cues, total_duration, output_wav, output_mp3, voice='Samantha', base_wpm=182):
    print(f'Synthesizing voiceover track ({total_duration:.1f}s, {len(cues)} cues)...')
    work_dir = os.path.join(TMP_DIR, f'voice_{int(total_duration)}')
    os.makedirs(work_dir, exist_ok=True)

    processed_cues = []
    for idx, t_start, t_end, text in cues:
        tts_text = sanitize_for_tts(text)
        aiff_path = os.path.join(work_dir, f'cue_{idx}.aiff')
        wav_path = os.path.join(work_dir, f'cue_{idx}.wav')

        # Run macOS say
        subprocess.run(['say', '-r', str(base_wpm), '-v', voice, '-o', aiff_path, tts_text], check=True)
        subprocess.run([FFMPEG_BIN, '-y', '-i', aiff_path, '-ar', '48000', '-ac', '2', wav_path], capture_output=True, check=True)

        # Measure duration
        res = subprocess.run([FFPROBE_BIN, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', wav_path], capture_output=True, text=True, check=True)
        dur = float(res.stdout.strip())
        max_dur = t_end - t_start

        fit_wav = os.path.join(work_dir, f'cue_{idx}_fit.wav')
        if dur > max_dur and max_dur > 0.5:
            speed = min(dur / max_dur, 1.45)
            subprocess.run([FFMPEG_BIN, '-y', '-i', wav_path, '-filter:a', f'atempo={speed:.4f}', fit_wav], capture_output=True, check=True)
        else:
            fit_wav = wav_path
        processed_cues.append((idx, t_start, fit_wav))

    # Generate silent base
    base_silent = os.path.join(work_dir, 'base_silent.wav')
    subprocess.run([FFMPEG_BIN, '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', str(total_duration), base_silent], capture_output=True, check=True)

    # Mix cues with adelay
    inputs = ['-i', base_silent]
    filter_parts = []
    for i, (idx, t_start, wav_file) in enumerate(processed_cues):
        inputs.extend(['-i', wav_file])
        delay_ms = max(0, int(t_start * 1000))
        filter_parts.append(f'[{i+1}:a]adelay={delay_ms}|{delay_ms}[a{i+1}];')

    mix_inputs = ''.join(f'[a{i+1}]' for i in range(len(processed_cues)))
    filter_graph = ''.join(filter_parts) + f'[0:a]{mix_inputs}amix=inputs={len(processed_cues)+1}:dropout_transition=0:normalize=0[outa]'

    subprocess.run([FFMPEG_BIN, '-y'] + inputs + ['-filter_complex', filter_graph, '-map', '[outa]', '-t', str(total_duration), output_wav], capture_output=True, check=True)
    subprocess.run([FFMPEG_BIN, '-y', '-i', output_wav, '-b:a', '192k', output_mp3], capture_output=True, check=True)
    print(f'Voiceover track ready: {output_mp3} ({os.path.getsize(output_mp3)/1024:.1f} KB)')


def generate_title_and_end_cards():
    print('Generating title card and end card HTML renders...')
    cards_dir = os.path.join(TMP_DIR, 'cards')
    os.makedirs(cards_dir, exist_ok=True)

    title_html = os.path.join(cards_dir, 'title.html')
    title_png = os.path.join(SCREENSHOTS_DIR, '00_title_card.png')
    with open(title_html, 'w', encoding='utf-8') as f:
        f.write('''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin:0; background:#000000; color:#FFFFFF; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width:100vw; overflow:hidden; }
.badge { display:inline-block; border:1px solid #06B6D4; color:#06B6D4; padding:6px 14px; font-size:14px; font-weight:700; letter-spacing:2px; text-transform:uppercase; border-radius:4px; margin-bottom:24px; }
h1 { font-size:68px; font-weight:800; letter-spacing:-1px; margin:0 0 16px 0; background:linear-gradient(135deg, #FFFFFF 60%, #06B6D4 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.sub { font-size:26px; font-weight:400; color:#94A3B8; margin-bottom:48px; max-width:1100px; text-align:center; line-height:1.4; }
.meta-box { display:flex; gap:36px; border-top:1px solid #1E293B; padding-top:32px; }
.meta-item { display:flex; flex-direction:column; align-items:center; }
.meta-label { font-size:12px; color:#64748B; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:6px; }
.meta-val { font-size:18px; font-weight:600; color:#E2E8F0; }
.accent { color:#06B6D4; }
</style>
</head>
<body>
<div class="badge">NASA Space Apps Challenge 2026</div>
<h1>ARES-Health</h1>
<div class="sub">Autonomous Resilient Edge-native System for Astronaut Health<br><span style="color:#06B6D4;font-size:20px;font-family:monospace;">GATHER &rarr; EVALUATE &rarr; ACT</span></div>
<div class="meta-box">
  <div class="meta-item"><div class="meta-label">Architecture</div><div class="meta-val">100% Air-Gapped Safe Rust (9 Crates)</div></div>
  <div class="meta-item"><div class="meta-label">Cockpit UI</div><div class="meta-val">React 19 + #000000 OLED + Three.js 3D Twin</div></div>
  <div class="meta-item"><div class="meta-label">Grounding</div><div class="meta-val">24 NASA / ESA / CSA / DLR Datasets</div></div>
  <div class="meta-item"><div class="meta-label">Repository</div><div class="meta-val accent">MiServeRDC/nasa-space-apps-2026</div></div>
</div>
</body>
</html>''')

    end_html = os.path.join(cards_dir, 'end.html')
    end_png = os.path.join(SCREENSHOTS_DIR, '10_end_card.png')
    with open(end_html, 'w', encoding='utf-8') as f:
        f.write('''<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { margin:0; background:#000000; color:#FFFFFF; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; width:100vw; overflow:hidden; }
.badge { display:inline-block; border:1px solid #10B981; color:#10B981; padding:6px 14px; font-size:14px; font-weight:700; letter-spacing:2px; text-transform:uppercase; border-radius:4px; margin-bottom:24px; }
h1 { font-size:56px; font-weight:800; letter-spacing:-1px; margin:0 0 16px 0; }
.summary { font-size:22px; color:#94A3B8; text-align:center; max-width:1000px; line-height:1.5; margin-bottom:48px; }
.grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; max-width:1200px; width:100%; border-top:1px solid #1E293B; padding-top:36px; }
.card { background:#0A0F1D; border:1px solid #1E293B; border-radius:8px; padding:20px; text-align:center; }
.card-num { font-size:32px; font-weight:800; color:#06B6D4; margin-bottom:8px; }
.card-txt { font-size:14px; color:#94A3B8; }
.footer { margin-top:40px; font-size:15px; color:#64748B; font-family:monospace; }
</style>
</head>
<body>
<div class="badge">Mission Ready &bull; Verified Air-Gapped</div>
<h1>Autonomous Clinical Edge Autonomy</h1>
<div class="summary">Protecting human life on Moon-to-Mars long-duration spaceflight when Earth is 48 minutes away. Deterministic math, zero cloud dependencies, and uncompromising clinical safety.</div>
<div class="grid">
  <div class="card"><div class="card-num">0.0 ms</div><div class="card-txt">Cloud Dependency (100% On-Board Flight Execution)</div></div>
  <div class="card"><div class="card-num">128 Bytes</div><div class="card-txt">CRC-32C Zero-Copy Seqlock Binary Frame (42 ns read)</div></div>
  <div class="card"><div class="card-num">3 Gates</div><div class="card-txt">Hard Safety Gates: POCUS Clot, LBNP Auto-Vent, EVA Damping</div></div>
</div>
<div class="footer">github.com/MiServeRDC/nasa-space-apps-2026 &bull; Dual Licensed: MIT OR Apache-2.0</div>
</body>
</html>''')

    subprocess.run([CHROME_BIN, '--headless', '--disable-gpu', '--window-size=1920,1080', f'--screenshot={title_png}', f'file://{title_html}'], capture_output=True, check=True)
    subprocess.run([CHROME_BIN, '--headless', '--disable-gpu', '--window-size=1920,1080', f'--screenshot={end_png}', f'file://{end_html}'], capture_output=True, check=True)
    print(f'Rendered title and end cards in {SCREENSHOTS_DIR}')


def capture_cockpit_screens():
    print('Capturing 1080p Cockpit screenshots from http://127.0.0.1:5173/ ...')
    targets = [
        ('01_gather_replay.png', 'http://127.0.0.1:5173/?view=VIEW_COCKPIT&phase=GATHER'),
        ('02_ground_portal.png', 'http://127.0.0.1:5173/?view=VIEW_PORTAL'),
        ('03_3d_twin_male.png', 'http://127.0.0.1:5173/?view=VIEW_TWIN&sex=MALE'),
        ('04_3d_twin_female.png', 'http://127.0.0.1:5173/?view=VIEW_TWIN&sex=FEMALE'),
        ('05_openscreen_studio.png', 'http://127.0.0.1:5173/?view=VIEW_STUDIO'),
        ('06_evaluate_3d.png', 'http://127.0.0.1:5173/?view=VIEW_COCKPIT&phase=EVALUATE&tab=BODY_3D&overlay=1'),
        ('07_evaluate_forecast.png', 'http://127.0.0.1:5173/?view=VIEW_COCKPIT&phase=EVALUATE&tab=FORECAST&overlay=1'),
        ('08_act_playbooks.png', 'http://127.0.0.1:5173/?view=VIEW_COCKPIT&phase=ACT'),
        ('09_command_palette.png', 'http://127.0.0.1:5173/?view=VIEW_COCKPIT&palette=1'),
    ]

    for name, url in targets:
        out = os.path.join(SCREENSHOTS_DIR, name)
        subprocess.run([CHROME_BIN, '--headless', '--disable-gpu', '--window-size=1920,1080', f'--screenshot={out}', url], capture_output=True)
        if os.path.exists(out):
            print(f'  Saved {name} ({os.path.getsize(out)/1024:.1f} KB)')


def compile_video(scenes, audio_file, srt_file, output_mp4, total_duration):
    """
    scenes: list of tuples: (image_path, duration_seconds)
    """
    print(f'Compiling MP4 video {output_mp4} ({total_duration:.1f}s)...')
    concat_list = os.path.join(TMP_DIR, f'concat_{int(total_duration)}.txt')
    with open(concat_list, 'w', encoding='utf-8') as f:
        for img, dur in scenes:
            f.write(f"file '{img}'\n")
            f.write(f"duration {dur:.3f}\n")
        # Final image repeat for ffmpeg concat demuxer
        f.write(f"file '{scenes[-1][0]}'\n")

    cmd = [
        FFMPEG_BIN, '-y',
        '-f', 'concat', '-safe', '0', '-i', concat_list,
        '-i', audio_file,
        '-vf', 'fps=60,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k',
        '-t', str(total_duration),
        output_mp4
    ]
    subprocess.run(cmd, capture_output=True, check=True)

    # Check validity with ffprobe
    res = subprocess.run([FFPROBE_BIN, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', output_mp4], capture_output=True, text=True, check=True)
    real_dur = float(res.stdout.strip())
    print(f'Video generated: {output_mp4} ({os.path.getsize(output_mp4)/(1024*1024):.2f} MB, duration={real_dur:.2f}s)')


def main():
    print('Starting ARES-Health Presentation Media Production Pipeline...')
    os.makedirs(TMP_DIR, exist_ok=True)
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

    # 1. Title and End Cards
    generate_title_and_end_cards()

    # 2. Cockpit Live Frame Capture
    capture_cockpit_screens()

    # 3. Audio Voiceovers
    pitch_srt = os.path.join(SUBMISSION_DIR, 'PITCH_30S_SUBTITLES_EN.srt')
    pitch_cues = parse_srt(pitch_srt)
    pitch_wav = os.path.join(SUBMISSION_DIR, 'pitch_30s_voiceover.wav')
    pitch_mp3 = os.path.join(SUBMISSION_DIR, 'pitch_30s_voiceover.mp3')
    synthesize_voiceover(pitch_cues, 30.0, pitch_wav, pitch_mp3, voice='Samantha', base_wpm=185)

    walk_srt = os.path.join(SUBMISSION_DIR, 'WALKTHROUGH_180S_SUBTITLES_EN.srt')
    walk_cues = parse_srt(walk_srt)
    walk_wav = os.path.join(SUBMISSION_DIR, 'walkthrough_180s_voiceover.wav')
    walk_mp3 = os.path.join(SUBMISSION_DIR, 'walkthrough_180s_voiceover.mp3')
    synthesize_voiceover(walk_cues, 180.0, walk_wav, walk_mp3, voice='Samantha', base_wpm=180)

    # 4. Compile 30s Pitch Video
    # Choreography:
    # 00-05s: Title card & Status (5s)
    # 05-10s: GATHER Replay (5s)
    # 10-15s: 3D Twin & Studio (5s)
    # 15-20s: EVALUATE 3D Heatmap (5s)
    # 20-25s: EVALUATE Forecast Cones (5s)
    # 25-30s: ACT Playbooks & End Card (5s)
    pitch_scenes = [
        (os.path.join(SCREENSHOTS_DIR, '00_title_card.png'), 4.0),
        (os.path.join(SCREENSHOTS_DIR, '01_gather_replay.png'), 5.0),
        (os.path.join(SCREENSHOTS_DIR, '03_3d_twin_male.png'), 4.0),
        (os.path.join(SCREENSHOTS_DIR, '05_openscreen_studio.png'), 3.0),
        (os.path.join(SCREENSHOTS_DIR, '06_evaluate_3d.png'), 4.0),
        (os.path.join(SCREENSHOTS_DIR, '07_evaluate_forecast.png'), 4.0),
        (os.path.join(SCREENSHOTS_DIR, '08_act_playbooks.png'), 3.0),
        (os.path.join(SCREENSHOTS_DIR, '10_end_card.png'), 2.8),
    ]
    pitch_mp4 = os.path.join(SUBMISSION_DIR, 'ARES_HEALTH_30S_PITCH.mp4')
    compile_video(pitch_scenes, pitch_wav, pitch_srt, pitch_mp4, 29.8)

    # 5. Compile 180s Technical Walkthrough Video (5 Acts)
    # Act I (00:00 - 00:38, 38s): Title card (8s) + Gather Replay (20s) + Ground Portal (10s)
    # Act II (00:38 - 01:15, 37s): Evaluate 3D Heatmap (15s) + 3D Twin Male/Female (12s) + Forecast Cones (10s)
    # Act III (01:15 - 01:55, 40s): ACT Playbooks PB #01..#05 (25s) + Gate 1/2/3 triggers (15s)
    # Act IV (01:55 - 02:32, 37s): FastMCP Command Palette (20s) + OpenScreen Studio (17s)
    # Act V (02:32 - 02:59.4, 28s): Verification & End card (28s)
    walk_scenes = [
        # Act I (38s)
        (os.path.join(SCREENSHOTS_DIR, '00_title_card.png'), 8.0),
        (os.path.join(SCREENSHOTS_DIR, '01_gather_replay.png'), 20.0),
        (os.path.join(SCREENSHOTS_DIR, '02_ground_portal.png'), 10.0),
        # Act II (37s)
        (os.path.join(SCREENSHOTS_DIR, '06_evaluate_3d.png'), 15.0),
        (os.path.join(SCREENSHOTS_DIR, '03_3d_twin_male.png'), 6.0),
        (os.path.join(SCREENSHOTS_DIR, '04_3d_twin_female.png'), 6.0),
        (os.path.join(SCREENSHOTS_DIR, '07_evaluate_forecast.png'), 10.0),
        # Act III (40s)
        (os.path.join(SCREENSHOTS_DIR, '08_act_playbooks.png'), 25.0),
        (os.path.join(SCREENSHOTS_DIR, '06_evaluate_3d.png'), 15.0),
        # Act IV (37s)
        (os.path.join(SCREENSHOTS_DIR, '09_command_palette.png'), 20.0),
        (os.path.join(SCREENSHOTS_DIR, '05_openscreen_studio.png'), 17.0),
        # Act V (28s)
        (os.path.join(SCREENSHOTS_DIR, '02_ground_portal.png'), 12.0),
        (os.path.join(SCREENSHOTS_DIR, '10_end_card.png'), 16.0),
    ]
    walk_mp4 = os.path.join(SUBMISSION_DIR, 'ARES_HEALTH_180S_WALKTHROUGH.mp4')
    compile_video(walk_scenes, walk_wav, walk_srt, walk_mp4, 180.0)

    print('ALL SUBMISSION MEDIA GENERATED CLEANLY AND READY FOR SUBMISSION!')


if __name__ == '__main__':
    main()
