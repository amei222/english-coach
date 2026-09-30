import io
p = 'js/ai.js'
s = io.open(p, encoding='utf-8').read()
def sub(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)

SOUNDALIKE = ("Spoken answers pass through speech recognition, which often mishears a non-native accent as similar-sounding words "
              "(e.g. \\\"response\\\" for \\\"reproduce\\\", \\\"ball\\\" for \\\"board\\\", \\\"allowed\\\" for \\\"he's low\\\"). ")

sub("""- The learner's messages may come from speech recognition: ignore capitalization, punctuation and obvious recognition glitches.""",
    """- The learner's messages may come from speech recognition: ignore capitalization and punctuation. The recognizer often mishears their accent as similar-sounding words (e.g. "response" for "reproduce", "ball" for "board"); when a sound-alike explains an odd word, understand what they meant and reply to that.""")

sub("""- If the learner writes Chinese (or mixes Chinese in), they didn't know how to say it:""",
    """- A misheard sound-alike is not a grammar mistake: don't "correct" it as one. If it points to a sound they should say more clearly, you may mention that in "explain_zh" (e.g. 「识别成了 ball，board 结尾的 d 要发出来」).
- If the learner writes Chinese (or mixes Chinese in), they didn't know how to say it:""")

sub("""Small grammar slips that don't hurt understanding are fine in casual contexts (games, chat). Ignore capitalization and punctuation; the answer may come from speech recognition. The reference answer is only one possibility — other natural answers are equally good.""",
    """Small grammar slips that don't hurt understanding are fine in casual contexts (games, chat). Ignore capitalization and punctuation. The reference answer is only one possibility — other natural answers are equally good.

Spoken answers go through speech recognition, which often mishears a Chinese accent as similar-sounding words (e.g. "response" for "reproduce", "ball" for "board", "allowed" for "he's low"). For a spoken answer, when a sound-alike explains an odd word, assume the learner said the intended word and judge the rest of their English on that basis — don't call the meaning wrong because of recognition errors. If a misheard word suggests a sound they should pronounce more clearly, add a short pronunciation tip to explain_zh (e.g. 「识别成了 ball，board 结尾的 d 要发出来」).""")

sub("""  function grade(situationZh, reference, answer) {
    const content = `Situation (Chinese): ${situationZh}\nReference answer: ${reference}\nLearner's answer: ${answer}`;""",
    """  function grade(situationZh, reference, answer, via = 'typed') {
    const how = via === 'voice' ? 'spoken aloud, captured by speech recognition' : 'typed';
    const content = `Situation (Chinese): ${situationZh}\nReference answer: ${reference}\nLearner's answer (${how}): ${answer}`;""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('ok')
