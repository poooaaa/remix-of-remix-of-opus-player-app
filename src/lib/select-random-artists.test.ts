import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectRandomArtists } from "./select-random-artists";

const tracks = Array.from({ length: 7 }, (_, index) => ({
  artist: `Artist ${index + 1}`,
  title: `Song ${index + 1}`,
  thumbnail: `cover-${index + 1}.jpg`,
}));

describe("selectRandomArtists", () => {
  it("selects at least two distinct artists when at least two are available", () => {
    const artists = selectRandomArtists(tracks, () => 0);

    assert.equal(artists.length, 2);
    assert.equal(new Set(artists.map(({ name }) => name)).size, 2);
  });

  it("never selects more than five artists", () => {
    const artists = selectRandomArtists(tracks, () => 0.999);

    assert.equal(artists.length, 5);
  });

  it("deduplicates artist names without regard to letter case", () => {
    const artists = selectRandomArtists([
      { artist: "Tulus", title: "Song 1", thumbnail: "cover-1.jpg" },
      { artist: "tULUS", title: "Song 2", thumbnail: "cover-2.jpg" },
      { artist: "Bernadya", title: "Song 3", thumbnail: "cover-3.jpg" },
    ], () => 0);

    assert.deepEqual(artists.map(({ name }) => name).sort(), ["Bernadya", "Tulus"]);
  });
});