import TrackCard, { type Track } from "./TrackCard";

interface SavedTracksProps {
  tracks: Track[];
  playingTrackUrl: string | null;
  loadingTrackUrl: string | null;
  remainingTime: string | null;
  onPlay: (track: Track) => void;
  onLongPress: (track: Track, position: { x: number; y: number }) => void;
}

const SavedTracks = ({ tracks, playingTrackUrl, loadingTrackUrl, remainingTime, onPlay, onLongPress }: SavedTracksProps) => {
  if (tracks.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
      {tracks.map((track) => (
        <div key={track.track_url} className="flex-shrink-0 w-[calc(50%-8px)]">
          <TrackCard
            track={track}
            isPlaying={playingTrackUrl === track.track_url}
            isLoading={loadingTrackUrl === track.track_url}
            remainingTime={playingTrackUrl === track.track_url ? remainingTime : null}
            onPlay={() => onPlay(track)}
            onLongPress={(pos) => onLongPress(track, pos)}
          />
        </div>
      ))}
    </div>
  );
};

export default SavedTracks;
