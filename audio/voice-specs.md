# Narration voice specs — Inward Journey series

Locked in 2026-09-24. These are fixed catalog voice IDs, not descriptions —
recreate the exact voices by passing the IDs verbatim.

## Female narrator — "Aria"
- Voice ID: `avocado_v2:MAI_01` (catalog name "Warm": friendly, American female; Meta AI production voice)
- Speed: `92`
- Role: opens the journey; guides the Island of Mind and the Island of Spirit

## Male narrator — "Rowan"
- Voice ID: `avocado_v2:miles` (catalog name "Satiny": soothing, American male)
- Speed: `92`
- Role: transitions; guides the Island of Body; closes the journey

## Technical notes for the agent
- Single voice: `tts speak --text "..." --voice avocado_v2:MAI_01 --speed 92 --output out.mp3`
- Multi-speaker: `tts synthesize-script --script script.txt --speaker Aria=avocado_v2:MAI_01 --speaker Rowan=avocado_v2:miles --speed 92 --output out.mp3`
  - Script file: one block per line, labeled `Aria: ...` / `Rowan: ...`
- Voice catalog (authority): `/opt/hatch/skills/voice-selector/voice_source.json`
- Contemplative pacing: speed 92; write text in spoken form — no markup, spell out numbers, use "..." for pauses
- Rejected (do not substitute): MAI_03, isabella, myrtle, bud, vdc_27862, paloma, lumi, rumi, nova, lady_macbeth, melody, marisol, Vanessa, Lily, Caitlin, GrowthMindset, vdc_5
