const { cosineSimilarity, rankBySimilarity } = require('../src/modules/reputation/semantic');

/**
 * The embedding model does the understanding; this module only compares vectors.
 * Pin that identical vectors are perfectly similar, orthogonal ones are not, a
 * malformed pair sorts to the bottom instead of throwing, and the ranking keeps
 * the best first, drops the embedding, and honours the score floor and cap.
 */

describe('cosineSimilarity', () => {
  test('identical direction = 1, orthogonal = 0, opposite = -1', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test('a zero vector or a length mismatch is 0, never NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('rankBySimilarity', () => {
  const rows = [
    { id: 'a', comment: 'cold food', embedding: [1, 0, 0] },
    { id: 'b', comment: 'slow service', embedding: [0, 1, 0] },
    { id: 'c', comment: 'lukewarm dish', embedding: [0.9, 0.1, 0] },
  ];

  test('ranks best first, scores 0–1, and strips the embedding', () => {
    const out = rankBySimilarity([1, 0, 0], rows, { limit: 10, minScore: 0 });
    expect(out.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(out[0].score).toBeCloseTo(1);
    expect(out[0]).not.toHaveProperty('embedding');
    expect(out[0].comment).toBe('cold food');
  });

  test('the score floor drops weak matches; the cap limits the count', () => {
    const floored = rankBySimilarity([1, 0, 0], rows, { minScore: 0.5 });
    expect(floored.map((r) => r.id)).toEqual(['a', 'c']); // b (score 0) is dropped
    const capped = rankBySimilarity([1, 0, 0], rows, { limit: 1, minScore: 0 });
    expect(capped).toHaveLength(1);
    expect(capped[0].id).toBe('a');
  });

  test('an empty query vector returns nothing', () => {
    expect(rankBySimilarity([], rows)).toEqual([]);
  });
});
