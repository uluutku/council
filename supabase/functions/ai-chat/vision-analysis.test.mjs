import assert from 'node:assert/strict';
import { GENERIC_VISION_ANALYSIS_PROMPT } from './vision-analysis.mjs';

assert.match(GENERIC_VISION_ANALYSIS_PROMPT, /broadly describe/i);
assert.doesNotMatch(GENERIC_VISION_ANALYSIS_PROMPT, /user request/i);
assert.doesNotMatch(GENERIC_VISION_ANALYSIS_PROMPT, /summarize this chart/i);
