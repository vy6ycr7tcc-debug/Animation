#!/bin/sh
# Generates narration for Three Islands. Run from anywhere; files land in this folder.
# The game plays opening.mp3, s01.mp3 ... s21.mp3, closing.mp3 when this folder sits beside three-islands.html.
set -e
cd "$(dirname "$0")"

tts synthesize-script --script opening.txt --speaker Aria=avocado_v2:MAI_01 --speaker Rowan=avocado_v2:miles --speed 92 --output opening.mp3
tts speak --text "Your conscious mind is the magician... the still foundation from which every thought, feeling, and dream arises." --voice avocado_v2:MAI_01 --speed 92 --output s01.mp3  # Magician, Aria
tts speak --text "Beneath thought lies the unconscious... a vast sea of potential that gives every experience its power." --voice avocado_v2:MAI_01 --speed 92 --output s02.mp3  # High Priestess, Aria
tts speak --text "Catalyst is what life places before you... each moment offering the raw material of your becoming." --voice avocado_v2:MAI_01 --speed 92 --output s03.mp3  # Empress, Aria
tts speak --text "Experience is catalyst made your own... the wisdom you carry forward from everything you have met." --voice avocado_v2:MAI_01 --speed 92 --output s04.mp3  # Emperor, Aria
tts speak --text "Your mind has the will to know... the question is what it will do with its knowledge, and why." --voice avocado_v2:MAI_01 --speed 92 --output s05.mp3  # Hierophant, Aria
tts speak --text "Transformation begins the moment you must choose, in your mind, between the light and the dark." --voice avocado_v2:MAI_01 --speed 92 --output s06.mp3  # Lovers, Aria
tts speak --text "The great way of mind is the path itself... consciousness moving, majestically, through everything it conceives." --voice avocado_v2:MAI_01 --speed 92 --output s07.mp3  # Chariot, Aria
tts speak --text "Your body is always working, always in motion... the balanced instrument through which the mind acts." --voice avocado_v2:miles --speed 92 --output s08.mp3  # Strength, Rowan
tts speak --text "Wisdom steadies the body... informed judgment turns its ceaseless activity into something useful and true." --voice avocado_v2:miles --speed 92 --output s09.mp3  # Hermit, Rowan
tts speak --text "Other people are your catalyst... every encounter offers both positive and negative experience, and both teach." --voice avocado_v2:miles --speed 92 --output s10.mp3  # Wheel of Fortune, Rowan
tts speak --text "What you have lived through and understood becomes a seed, and that seed grows into more life." --voice avocado_v2:miles --speed 92 --output s11.mp3  # Justice, Rowan
tts speak --text "The body surrenders, suspended... in stillness, the instrument of the mind learns to listen." --voice avocado_v2:miles --speed 92 --output s12.mp3  # Hanged Man, Rowan
tts speak --text "Each day offers a small death and a rebirth... let what is finished fall away, and rise into what is next." --voice avocado_v2:miles --speed 92 --output s13.mp3  # Death, Rowan
tts speak --text "Your body is the vessel in which the mind's intentions are slowly transmuted into living gold." --voice avocado_v2:miles --speed 92 --output s14.mp3  # Temperance, Rowan
tts speak --text "The spirit is a dark night... not evil, but unseen... the mystery in which everything luminous waits." --voice avocado_v2:MAI_01 --speed 92 --output s15.mp3  # Devil, Aria
tts speak --text "Lightning strikes the darkness... a bolt of sudden seeing that breaks open what you thought you knew." --voice avocado_v2:miles --speed 92 --output s16.mp3  # Tower, Rowan
tts speak --text "Faith is the catalyst of spirit... the quiet light that begins to change how you see everything." --voice avocado_v2:MAI_01 --speed 92 --output s17.mp3  # Star, Aria
tts speak --text "In moonlight, truth wears the shape of shadow... learn to tell what is real from what only glimmers." --voice avocado_v2:miles --speed 92 --output s18.mp3  # Moon, Rowan
tts speak --text "You are the living vessel of light... you either radiate love outward, or draw it inward to yourself." --voice avocado_v2:MAI_01 --speed 92 --output s19.mp3  # Sun, Aria
tts speak --text "Spirit transforms the material world itself into something infinite, something that does not end." --voice avocado_v2:miles --speed 92 --output s20.mp3  # Judgment, Rowan
tts speak --text "At the end of the spirit's path, the circle closes... the dancer, the world, and the one are the same." --voice avocado_v2:MAI_01 --speed 92 --output s21.mp3  # World, Aria
tts synthesize-script --script closing.txt --speaker Aria=avocado_v2:MAI_01 --speaker Rowan=avocado_v2:miles --speed 92 --output closing.mp3

# Optional: the whole journey as one listen, in Ra's teaching order (Session 88.24)
tts synthesize-script --script script-full.txt --speaker Aria=avocado_v2:MAI_01 --speaker Rowan=avocado_v2:miles --speed 92 --output full-journey.mp3
