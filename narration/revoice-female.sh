#!/bin/sh
# Re-voices the five narrations recorded in the male voice (J02, J04, J06, J08, J10)
# in the female voice, using the same tts CLI as generate.sh.
# The game plays these copies automatically; until they exist, those tracks show as subtitles.
#
# Run from anywhere, where Samuel's `tts` CLI is installed:
#   sh narration/revoice-female.sh
# Then commit public/audio/female/*.mp3.
#
# VOICE defaults to the female narrator (Aria). If the package's "Warm" voice has a different
# id, pass it:  VOICE=avocado_v2:XXXX sh narration/revoice-female.sh
set -e
cd "$(dirname "$0")/.."
VOICE="${VOICE:-avocado_v2:MAI_01}"
SPEED="${SPEED:-92}"
mkdir -p public/audio/female
for name in J02_the_crossing J04_the_magician J06_the_empress J08_the_hierophant J10_the_chariot; do
  echo "Voicing $name ..."
  tts speak --text "$(cat "content/scripts/$name.txt")" --voice "$VOICE" --speed "$SPEED" --output "public/audio/female/$name.mp3"
done
echo "Done. The game will use public/audio/female/*.mp3 in place of the male recordings."
