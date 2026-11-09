import { describe, expect, test } from "bun:test";
import { selectRandomArtists } from "./select-random-artists";

const tracks = Array.from({ length: 7 }, (_, index) => ({
  artist: `Artist ${index + 1}`,
  title: `Song ${index + 1}`,
  thumbnail: `cover-${index + 1}.jpg`,
}));

describe("selectRandomArtists", () => {
  test("selects at least two distinct artists when at least two are available", () => {
    const artists = selectRandomArtists(tracks, () => 0);

    expect(artists.length).toBe(2);
    expect(new Set(artists.map(({ name }) => name)).size).toBe(2);
  });

  test("never selects more than five artists", () => {
    const artists = selectRandomArtists(tracks, () => 0.999);

    expect(artists.length).toBe(5);
  });
});