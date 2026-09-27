#!/usr/bin/env bash
# Local text-to-speech (Piper, MIT; voices from rhasspy/piper-voices, see CREDITS.md).
# Setup (once):   pip install piper-tts imageio-ffmpeg
#                 ./piper.sh fetch
# Speak a line:   ./piper.sh say "Some words." ../public/audio/out.mp3 [voice]
# The opening:    ./piper.sh opening
set -euo pipefail
cd "$(dirname "$0")"
VOICES=${VOICES:-$HOME/.piper-voices}
VOICE=${VOICE:-en_GB-cori-high}
FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
url() { case $1 in
  en_GB-cori-high) echo en/en_GB/cori/high/en_GB-cori-high;;
  en_GB-jenny_dioco-medium) echo en/en_GB/jenny_dioco/medium/en_GB-jenny_dioco-medium;;
  en_US-hfc_female-medium) echo en/en_US/hfc_female/medium/en_US-hfc_female-medium;;
esac; }
fetch() {
  mkdir -p "$VOICES"
  for v in en_GB-cori-high en_GB-jenny_dioco-medium en_US-hfc_female-medium; do
    for ext in onnx onnx.json; do
      [ -f "$VOICES/$v.$ext" ] || curl -sSL -o "$VOICES/$v.$ext" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$(url $v).$ext"
    done
  done
}
say() { # text, out.mp3, [voice]
  local v=${3:-$VOICE} tmp; tmp=$(mktemp --suffix .wav)
  echo "$1" | python3 -m piper -m "$VOICES/$v.onnx" --length-scale 1.22 --sentence-silence 0.5 -f "$tmp"
  "$FF" -y -loglevel error -i "$tmp" -af "adelay=120|120,aecho=0.8:0.6:70|140:0.18|0.1,loudnorm=I=-18:TP=-2" -ac 1 -b:a 96k "$2"
  rm -f "$tmp"
}
case ${1:-} in
  fetch) fetch ;;
  say) say "$2" "$3" "${4:-}" ;;
  opening)
    i=1
    while IFS= read -r line; do say "$line" "../public/audio/opening/$i.mp3"; i=$((i+1)); done <<'LINES'
From the stillness of the heart,
in the within of noise and the silence,
the soul seeks to rediscover itself,
experiencing creation,
and the creator,
all there is.
This is a world of night and light to wander, with nothing to win and nowhere you must be.
Touch what calls you. Rest where it is quiet. Listen.
LINES
    ;;
  *) echo "usage: $0 fetch | say TEXT OUT.mp3 [VOICE] | opening"; exit 1 ;;
esac
