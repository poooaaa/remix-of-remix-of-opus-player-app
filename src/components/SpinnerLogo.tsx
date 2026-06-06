const GEMINI_URL = "https://www.cloudsky.biz.id/api/file/material-you-loading-1.jpg";

// Preload the loading image once so it doesn't re-fetch every time the spinner mounts
if (typeof window !== "undefined") {
  const preload = new Image();
  preload.src = GEMINI_URL;
}

interface SpinnerLogoProps {
  size?: number;
  className?: string;
}

const SpinnerLogo = ({ size = 40, className = "" }: SpinnerLogoProps) => {
  return (
    <img
      src={GEMINI_URL}
      alt="Loading"
      width={size}
      height={size}
      className={`gemini-spin pointer-events-none select-none ${className}`}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  );
};

export default SpinnerLogo;