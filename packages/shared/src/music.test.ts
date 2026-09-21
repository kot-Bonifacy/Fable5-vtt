import { describe, expect, it } from 'vitest';
import { youtubeVideoId } from './music.js';
import { sanitizeScenePatch } from './scenes.js';

describe('YouTube links', () => {
  it.each([
    'https://www.youtube.com/watch?v=jfKfPfyJRdk&list=ignored',
    'https://youtu.be/jfKfPfyJRdk?t=30',
    'https://music.youtube.com/watch?v=jfKfPfyJRdk',
    'https://m.youtube.com/watch?v=jfKfPfyJRdk',
    'https://youtube.com/shorts/jfKfPfyJRdk',
    'https://youtube.com/live/jfKfPfyJRdk',
    'https://www.youtube.com/embed/jfKfPfyJRdk',
  ])('extracts only the video from %s', (url) => {
    expect(youtubeVideoId(url)).toBe('jfKfPfyJRdk');
  });
  it.each([
    null,
    {},
    'javascript:alert(1)',
    'https://youtube.com.evil.test/watch?v=jfKfPfyJRdk',
    'https://youtube.com@evil.test/watch?v=jfKfPfyJRdk',
    'https://user@youtube.com/watch?v=jfKfPfyJRdk',
    'https://www.youtube.com/playlist?list=test',
    'https://www.youtube.com/watch?v=invalid',
    'https://youtu.be/jfKfPfyJRdk/other',
    'https://youtube.com:123/watch?v=jfKfPfyJRdk',
    'https://youtu.be/%3Cscript%3E',
  ])('rejects unsafe or unsupported links: %s', (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});
it('accepts only built-in natural ambience, including explicit silence', () => {
  for (const ambience of ['none', 'rain', 'wind', 'fire', 'street'])
    expect(sanitizeScenePatch({ ambience })).toEqual({ ambience });
  for (const ambience of ['constructor', '../private', 'https://example.com/audio.mp3', 100, null])
    expect(sanitizeScenePatch({ ambience })).toBeNull();
});
