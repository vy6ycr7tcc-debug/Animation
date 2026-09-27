/* The temple's rites (Samuel: "I need the temple to be an exploratory place for the spirit…
   think about interactions and content"). At each shrine you may be with its archetype: it
   wakes and makes its own gesture (player/gestures.ts) and you make it with it, while three
   things are said: an invitation (what to do), what the archetype is (the narration-ready
   distillations of reference/theory, section (c): paraphrase, never Ra's words), and a
   question to carry away (written for the game). Each rite lights the shrine's lamp. When the
   same place is lit in all three realms (Ra's grouping: I, VIII, XV; II, IX, XVI; …), the altar
   answers with that place's synthesis. When all twenty-one are lit, the Choice opens.
   Voiced with Piper (narration/piper.sh rites): public/audio/rites/<numeral>-<1|2|3>.mp3 and
   synth-<1..8>.mp3. */

export interface Rite {
  invite: string;
  line: string;
  ask: string;
}

export const RITES: Record<string, Rite> = {
  I: { invite: "Stand with the Magician. Let your hand follow the light, and your attention with it.", line: "Your conscious mind is the magician: the still foundation from which every thought, feeling, and dream arises.", ask: "What are you giving your attention to, right now?" },
  II: { invite: "Be still before the High Priestess. Nothing needs to happen. Let the silence be the teaching.", line: "Beneath thought lies the unconscious, a vast sea of potential that gives every experience its power.", ask: "What might you hear, if you stopped listening for an answer?" },
  III: { invite: "Open your arms with the Empress, palms up, as if to rain. Let what comes, come.", line: "Catalyst is what life places before you: each moment offering the raw material of your becoming.", ask: "What has life placed before you, that you have not yet received?" },
  IV: { invite: "Sit upright with the Emperor. Hold one thing steady before your heart, and then hold it lightly.", line: "Experience is catalyst made your own: the wisdom you carry forward from everything you have met.", ask: "What have you learned that you are ready to hold more lightly?" },
  V: { invite: "Raise an open hand with the Hierophant, and ask yourself, plainly, why you seek.", line: "Your mind has the will to know. The question is what it will do with its knowledge, and why.", ask: "Why do you seek?" },
  VI: { invite: "Turn with the Lovers, toward one side, and then the other. Then bring your hands to your heart.", line: "Transformation begins the moment you must choose, in your mind, between the light and the dark.", ask: "Where in your life are you being asked to choose?" },
  VII: { invite: "Hold the reins with the Chariot, and do not pull. Let the stillness carry you.", line: "The great way of mind is the path itself: consciousness moving, majestically, through everything it conceives.", ask: "Where could you stop pushing, and let the way carry you?" },
  VIII: { invite: "Rest a hand, with Strength, on the lion. Breathe with it, until you breathe as one.", line: "Your body is always working, always in motion: the balanced instrument through which the mind acts.", ask: "Can your strength be gentle today?" },
  IX: { invite: "Lift the lamp with the Hermit. See the way it shows, a little ahead, and no further.", line: "Wisdom steadies the body: informed judgment turns its ceaseless activity into something useful and true.", ask: "Whose way could your light show, a little ahead?" },
  X: { invite: "Turn the wheel with your hand. Feel it rise and fall, and stay at its centre.", line: "Other people are your catalyst: every encounter offers both positive and negative experience, and both teach.", ask: "Who has been your teacher lately, without knowing it?" },
  XI: { invite: "Hold the scales with Justice. Wait, until they come level, and are still.", line: "What you have lived through and understood becomes a seed, and that seed grows into more life.", ask: "What have you lived, that is now a seed?" },
  XII: { invite: "Be still with the Hanged Man. Stop holding up the world, and see it the other way round.", line: "The body surrenders, suspended: in stillness, the instrument of the mind learns to listen.", ask: "What would you see, if you let go of how things should look?" },
  XIII: { invite: "Sweep slowly with Death, low over the ground. Let one finished thing be cut, gently.", line: "Each day offers a small death and a rebirth: let what is finished fall away, and rise into what is next.", ask: "What is finished, and ready to fall away?" },
  XIV: { invite: "Pour with Temperance, from one hand into the other, until what you pour shines.", line: "Your body is the vessel in which the mind's intentions are slowly transmuted into living gold.", ask: "What in you is slowly turning into gold?" },
  XV: { invite: "Stand with the one who holds the torch. Look closely at the cords, and see how loose they are.", line: "The spirit is a dark night: not evil, but unseen. The mystery in which everything luminous waits.", ask: "Which chain in your life is already loose?" },
  XVI: { invite: "Lift your face to the Tower. When the light strikes, let your arms open, and let it fall.", line: "Lightning strikes the darkness: a bolt of sudden seeing that breaks open what you thought you knew.", ask: "What did you think you knew, that has broken open?" },
  XVII: { invite: "Pour with the Star, one vessel and then the other, and lift your eyes between.", line: "Faith is the catalyst of spirit: the quiet light that begins to change how you see everything.", ask: "Can you pour yourself out, without needing to know where it goes?" },
  XVIII: { invite: "Walk the half-light with the Moon, hands out before you. Then stand still, and look up.", line: "In moonlight, truth wears the shape of shadow: learn to tell what is real from what only glimmers.", ask: "What is real here, and what only glimmers?" },
  XIX: { invite: "Open your arms with the Sun, and bring them home to your heart. Give, and receive.", line: "You are the living vessel of light: you either radiate love outward, or draw it inward to yourself.", ask: "Right now, are you radiating, or absorbing?" },
  XX: { invite: "Rise with Judgement, slowly, as if you were called by name.", line: "Spirit transforms the material world itself into something infinite, something that does not end.", ask: "What in you does not end?" },
  XXI: { invite: "Sway with the dancer at the harp. The circle is left open: you may finish it.", line: "At the end of the spirit's path, the circle closes: the dancer, the world, and the one are the same.", ask: "If the journey were already complete, how would you walk?" },
  XXII: { invite: "Stand at the edge with the Choice, and lean toward the light.", line: "The Choice stands alone among them: not a place on the path, but the one decision the whole path is for. To give your light, or to keep it.", ask: "How will you love?" },
};

/** The seven places, each met in mind, body and spirit (Ra's teaching order, 88.24). */
export const SYNTHESES: string[] = [
  "The Matrix. The mind's still awareness, the body's ceaseless working, the spirit's dark night. Each is where a journey begins.",
  "The Potentiator. The deep mind, the body's wisdom, the lightning. What waits beneath, and what suddenly breaks through.",
  "The Catalyst. What life brings, what others bring, and faith. All of it the raw material of becoming.",
  "The Experience. Catalyst made your own, lived into a seed, walked by moonlight.",
  "The Significator. The will to know, the body that surrenders, the self that radiates or absorbs. Each of them is you.",
  "The Transformation. The choice, the daily death, and the spirit turning matter into the infinite.",
  "The Great Way. The path, the body as the vessel of gold, and the circle that is left open.",
  "Twenty-one lamps are lit. The Choice is waiting, at the back of the sanctuary.",
];

export const riteAudio = (numeral: string, k: 1 | 2 | 3) => `audio/rites/${numeral}-${k}.mp3`;
export const synthAudio = (k: number) => `audio/rites/synth-${k + 1}.mp3`;
